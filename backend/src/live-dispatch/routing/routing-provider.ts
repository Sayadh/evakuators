/**
 * Road distance/duration for dispatch.
 *
 * ## What a result means — and does not
 *
 * A result is the provider's estimate for an ordinary car on public roads.
 * It is NOT a guarantee that a loaded tow truck can take that road (weight
 * limits, low bridges, mountain passes in winter). Every surface that shows
 * it labels it «մոտավոր».
 *
 * ## Failure is per pair
 *
 * `matrix()` returns one entry PER destination, each `ok` or not. One
 * unreachable driver never sinks the others; a whole-request failure (timeout,
 * 5xx after retries, no budget) returns every entry as failed with the same
 * error — and the caller ranks those candidates after the routed ones, by
 * straight line, WITHOUT presenting the straight line as a road figure.
 *
 * ## Cost control
 *
 * Billing is per ELEMENT (origins × destinations), so the guard counts
 * elements, not requests, against a daily budget stored in the database
 * (`RoutingUsageDay`) — a restart cannot reset it. A per-process semaphore
 * caps concurrent provider calls. Dispatch never routes on a GPS update; it
 * routes when a batch of candidates is built or refreshed.
 */
import { armeniaDateKey } from '../../common/armenia-day'
import type { Sql } from '../platform/sql'

export interface LatLng {
  latitude: number
  longitude: number
}

export type RouteEntry =
  | { ok: true; meters: number; seconds: number }
  | { ok: false; error: RouteError }

export type RouteError =
  | 'NO_ROUTE'
  | 'ELEMENT_ERROR'
  | 'TIMEOUT'
  | 'PROVIDER_ERROR'
  | 'RATE_LIMITED'
  | 'BUDGET_EXHAUSTED'
  | 'NOT_CONFIGURED'

export interface MatrixResult {
  provider: string
  computedAt: Date
  /** Aligned with the `origins` argument (one destination, many origins) */
  entries: RouteEntry[]
  billableElements: number
}

/**
 * One destination, many origins: "how far is each driver from the pickup".
 * The same shape serves pickup → destination (one origin, one destination).
 */
export interface RoutingProvider {
  readonly name: string
  readonly maxElementsPerRequest: number
  matrix(origins: LatLng[], destination: LatLng, signal: AbortSignal): Promise<MatrixResult>
}

export class ProviderHttpError extends Error {
  constructor(
    readonly status: number,
    readonly retryable: boolean,
  ) {
    super(`provider HTTP ${status}`)
  }
}

export function failedAll(provider: string, count: number, error: RouteError): MatrixResult {
  return {
    provider,
    computedAt: new Date(),
    entries: Array.from({ length: count }, () => ({ ok: false as const, error })),
    billableElements: 0,
  }
}

class Semaphore {
  active = 0
  private readonly waiting: (() => void)[] = []

  constructor(private readonly limit: number) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.limit) await new Promise<void>((resolve) => this.waiting.push(resolve))
    this.active++
    try {
      return await fn()
    } finally {
      this.active--
      this.waiting.shift()?.()
    }
  }
}

export interface GuardOptions {
  timeoutMs: number
  retries: number
  baseBackoffMs: number
  maxConcurrent: number
  dailyElementBudget: () => number
  /**
   * Optional cap on provider REQUESTS per Armenia day (every attempt, retries
   * included). OpenRouteService bills per matrix request, not per element, and
   * one ORS key is shared with the website's /evakuator search — this is what
   * keeps dispatch inside its share (ROUTE_ORS_DISPATCH_DAILY_SHARE).
   * Undefined = no request cap (Google bills per element; fake costs nothing).
   */
  dailyRequestBudget?: () => number
  /**
   * Usage row key. Defaults to the provider name; the public nearby search
   * uses its own key so visitors can never spend the dispatch budget.
   */
  budgetKey?: string
  /**
   * When every concurrency slot is taken, fail fast (RATE_LIMITED) instead of
   * queueing. For the public search: a visitor gets a straight-line list now
   * rather than a road list in three seconds (measured — see
   * docs/live-dispatch/10-load-test-report.md). Dispatch keeps queueing.
   */
  rejectWhenBusy?: boolean
}

export interface RoutingMetrics {
  requests: number
  elements: number
  errors: number
  budgetRefusals: number
  busyRefusals: number
  latenciesMs: number[]
}

/**
 * Timeout + bounded retry with backoff + concurrency limit + DB-backed daily
 * element budget, around any provider.
 */
export class GuardedRouting {
  private readonly semaphore: Semaphore
  readonly metrics: RoutingMetrics = { requests: 0, elements: 0, errors: 0, budgetRefusals: 0, busyRefusals: 0, latenciesMs: [] }

  constructor(
    private readonly provider: RoutingProvider,
    private readonly db: Sql,
    private readonly options: GuardOptions,
    private readonly sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  ) {
    this.semaphore = new Semaphore(options.maxConcurrent)
  }

  get providerName(): string {
    return this.provider.name
  }

  private get usageKey(): string {
    return this.options.budgetKey ?? this.provider.name
  }

  async matrix(origins: LatLng[], destination: LatLng): Promise<MatrixResult> {
    if (origins.length === 0) return { provider: this.provider.name, computedAt: new Date(), entries: [], billableElements: 0 }
    if (origins.length > this.provider.maxElementsPerRequest) {
      throw new Error(`matrix of ${origins.length} exceeds ${this.provider.maxElementsPerRequest} elements per request`)
    }

    if (this.options.rejectWhenBusy && this.semaphore.active >= this.options.maxConcurrent) {
      this.metrics.busyRefusals++
      return failedAll(this.provider.name, origins.length, 'RATE_LIMITED')
    }

    const day = armeniaDateKey(new Date())
    const elementBudget = this.options.dailyElementBudget()
    const requestBudget = this.options.dailyRequestBudget?.() ?? null
    // Reserve BEFORE each attempt (retries too), atomically against both
    // budgets: a request that times out has usually still been billed, and
    // ORS counts every request against the key's daily quota.
    const reserve = async (): Promise<boolean> => {
      if (origins.length > elementBudget || (requestBudget !== null && requestBudget < 1)) return false
      const reserved = await this.db.query(
        `INSERT INTO "RoutingUsageDay" ("day", "provider", "requests", "elements")
         VALUES ($1, $2, 1, $3::int)
         ON CONFLICT ("day", "provider") DO UPDATE
           SET "requests" = "RoutingUsageDay"."requests" + 1,
               "elements" = "RoutingUsageDay"."elements" + EXCLUDED."elements"
         WHERE "RoutingUsageDay"."elements" + EXCLUDED."elements" <= $4::int
           AND ($5::int IS NULL OR "RoutingUsageDay"."requests" + 1 <= $5::int)
         RETURNING 1`,
        [day, this.usageKey, origins.length, elementBudget, requestBudget],
      )
      return reserved.length > 0
    }
    if (!(await reserve())) {
      this.metrics.budgetRefusals++
      return failedAll(this.provider.name, origins.length, 'BUDGET_EXHAUSTED')
    }

    return this.semaphore.run(async () => {
      let lastError: RouteError = 'PROVIDER_ERROR'
      for (let attempt = 0; attempt <= this.options.retries; attempt++) {
        if (attempt > 0) {
          const jitter = Math.random() * this.options.baseBackoffMs
          await this.sleep(this.options.baseBackoffMs * 2 ** (attempt - 1) + jitter)
          // A retry is another billed request: no budget left → stop here.
          if (!(await reserve())) {
            this.metrics.budgetRefusals++
            break
          }
        }
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), this.options.timeoutMs)
        const started = Date.now()
        try {
          this.metrics.requests++
          const result = await this.provider.matrix(origins, destination, controller.signal)
          this.metrics.elements += result.billableElements
          this.metrics.latenciesMs.push(Date.now() - started)
          if (this.metrics.latenciesMs.length > 1000) this.metrics.latenciesMs.shift()
          return result
        } catch (error) {
          this.metrics.errors++
          this.metrics.latenciesMs.push(Date.now() - started)
          if (controller.signal.aborted) {
            lastError = 'TIMEOUT'
            continue
          }
          if (error instanceof ProviderHttpError) {
            lastError = error.status === 429 ? 'RATE_LIMITED' : 'PROVIDER_ERROR'
            if (!error.retryable) break
            continue
          }
          lastError = 'PROVIDER_ERROR'
        } finally {
          clearTimeout(timer)
        }
      }
      await this.db
        .query(`UPDATE "RoutingUsageDay" SET "errors" = "errors" + 1 WHERE "day" = $1 AND "provider" = $2`, [day, this.usageKey])
        .catch(() => undefined)
      return failedAll(this.provider.name, origins.length, lastError)
    })
  }
}
