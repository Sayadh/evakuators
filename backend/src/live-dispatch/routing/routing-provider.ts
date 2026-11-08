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
  private active = 0
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
   * Usage row key. Defaults to the provider name; the public nearby search
   * uses its own key so visitors can never spend the dispatch budget.
   */
  budgetKey?: string
}

export interface RoutingMetrics {
  requests: number
  elements: number
  errors: number
  budgetRefusals: number
  latenciesMs: number[]
}

/**
 * Timeout + bounded retry with backoff + concurrency limit + DB-backed daily
 * element budget, around any provider.
 */
export class GuardedRouting {
  private readonly semaphore: Semaphore
  readonly metrics: RoutingMetrics = { requests: 0, elements: 0, errors: 0, budgetRefusals: 0, latenciesMs: [] }

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

    const day = armeniaDateKey(new Date())
    // Reserve the elements BEFORE the call, atomically against the budget: a
    // request that times out has usually still been billed.
    const reserved = await this.db.query(
      `INSERT INTO "RoutingUsageDay" ("day", "provider", "requests", "elements")
       VALUES ($1, $2, 1, $3::int)
       ON CONFLICT ("day", "provider") DO UPDATE
         SET "requests" = "RoutingUsageDay"."requests" + 1,
             "elements" = "RoutingUsageDay"."elements" + EXCLUDED."elements"
       WHERE "RoutingUsageDay"."elements" + EXCLUDED."elements" <= $4::int
       RETURNING 1`,
      [day, this.usageKey, origins.length, this.options.dailyElementBudget()],
    )
    if (reserved.length === 0 || origins.length > this.options.dailyElementBudget()) {
      this.metrics.budgetRefusals++
      return failedAll(this.provider.name, origins.length, 'BUDGET_EXHAUSTED')
    }

    return this.semaphore.run(async () => {
      let lastError: RouteError = 'PROVIDER_ERROR'
      for (let attempt = 0; attempt <= this.options.retries; attempt++) {
        if (attempt > 0) {
          const jitter = Math.random() * this.options.baseBackoffMs
          await this.sleep(this.options.baseBackoffMs * 2 ** (attempt - 1) + jitter)
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
