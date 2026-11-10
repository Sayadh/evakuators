/**
 * Sequential dispatch: one live offer per order at a time, best candidate
 * first, next candidate on reject/expiry, wider radius when a batch is used
 * up, NEEDS_ATTENTION when nothing is left or time/attempts run out.
 *
 * The engine itself holds no state. Each `advance()` reads the database,
 * takes one or more short transactions and returns. It is triggered by the
 * outbox (`dispatch.advance`) and by the reconciler — so a crashed worker, a
 * lost job or a Redis restart only delays the next step; it can never repeat
 * a decision, because every decision is re-made under the order's row lock.
 *
 * Routing calls happen OUTSIDE any transaction (they take hundreds of ms and
 * must never hold a row lock), and their results are re-validated when they
 * are written back (`addCandidates` checks the attempt is still the open one).
 */
import { haversineMeters } from '../fleet/domain/gps'
import { readOrder, requirementsOf } from '../orders/order-row'
import type { DispatchSettings } from '../platform/settings'
import type { SqlDatabase } from '../platform/sql'
import type { GuardedRouting } from '../routing/routing-provider'
import type { CandidateFinder } from './candidate-finder'
import { rankCandidates, searchRadii, YEREVAN_CENTRE } from './domain/ranking'
import { openAttempt, type NextOfferResult, type OffersRepository } from './offers.repository'

export interface EngineLogger {
  info(message: string, data?: Record<string, unknown>): void
  warn(message: string, data?: Record<string, unknown>): void
}

export const silentLogger: EngineLogger = { info: () => undefined, warn: () => undefined }

export class DispatchEngine {
  constructor(
    private readonly db: SqlDatabase,
    private readonly offers: OffersRepository,
    private readonly finder: CandidateFinder,
    private readonly routing: GuardedRouting,
    private readonly loadSettings: () => Promise<DispatchSettings>,
    private readonly log: EngineLogger = silentLogger,
  ) {}

  async advance(orderId: number): Promise<NextOfferResult> {
    const settings = await this.loadSettings()
    // Bounded: each pass either makes an offer, stops, or adds/refreshes
    // candidates. A radius ladder of N stages needs at most ~2N passes.
    for (let pass = 0; pass < 16; pass++) {
      const result = await this.offers.tryCreateNextOffer(orderId, settings)
      if (result.kind === 'need-candidates') {
        const added = await this.expand(orderId, result.attemptId, settings)
        if (added === 0) {
          const failed = await this.offers.failSearchIfStillEmpty(orderId, result.attemptId)
          this.log.info('dispatch: no candidates left', { orderId, attemptId: result.attemptId, failed })
          return failed ? { kind: 'failed', attentionKind: 'SEARCH_EXHAUSTED' } : { kind: 'idle', reason: 'raced' }
        }
        continue
      }
      if (result.kind === 'need-refresh') {
        await this.refresh(orderId, result.attemptId)
        continue
      }
      if (result.kind === 'offered') this.log.info('dispatch: offer created', { orderId, offerId: result.offerId })
      return result
    }
    this.log.warn('dispatch: step limit reached', { orderId })
    return { kind: 'idle', reason: 'step limit' }
  }

  /**
   * Builds the next batch: nearest eligible drivers not yet considered in
   * this attempt, widening the radius stage by stage; then ONE matrix call
   * for the whole batch; then rank by ETA. Returns how many were added.
   *
   * Stages run over the radius ladder TWICE: first by live GPS, then — only
   * once every GPS stage came up empty — by base location (connected drivers
   * whose GPS is stale; product decision 2026-11). A driver with real GPS is
   * therefore always offered before anyone measured from a base. `searchStage`
   * counts across both passes (0…2n-1).
   */
  private async expand(orderId: number, attemptId: number, settings: DispatchSettings): Promise<number> {
    const order = await readOrder(this.db, orderId)
    const attempt = await openAttempt(this.db, orderId, false)
    if (!order || order.status !== 'SEARCHING' || !attempt || attempt.id !== attemptId) return 0
    // Unreachable in practice: automatic search refuses an order without
    // pickup coordinates (assertAutoDispatchable). Kept as a real guard.
    if (order.pickupLatitude === null || order.pickupLongitude === null) return 0

    const pickup = { latitude: order.pickupLatitude, longitude: order.pickupLongitude }
    const radii = searchRadii(
      haversineMeters(pickup.latitude, pickup.longitude, YEREVAN_CENTRE.latitude, YEREVAN_CENTRE.longitude),
      settings,
    )
    const stages = radii.length * 2
    let stage = attempt.searchStage
    let found: Awaited<ReturnType<CandidateFinder['find']>> = []
    while (stage < stages) {
      found = await this.finder.find(
        this.db,
        {
          pickup,
          radiusMeters: radii[stage % radii.length],
          limit: settings.candidateBatchSize,
          requirements: requirementsOf(order),
          excludeAttemptId: attemptId,
          source: stage < radii.length ? 'GPS' : 'BASE',
        },
        settings,
      )
      if (found.length > 0) break
      stage++
    }
    if (found.length === 0) {
      await this.offers.addCandidates(orderId, attemptId, Math.min(stage, stages), [], { provider: this.routing.providerName, computedAt: new Date() })
      return 0
    }

    const matrix = await this.routing.matrix(
      found.map((c) => ({ latitude: c.latitude, longitude: c.longitude })),
      pickup,
    )
    const ranked = rankCandidates(
      found.map((c, i) => ({
        driverId: c.driverId,
        straightLineMeters: c.straightLineMeters,
        route: matrix.entries[i] ?? null,
        availableSince: c.availableSince,
        source: c.source,
      })),
      settings.etaTieSeconds,
    )
    const failedRoutes = matrix.entries.filter((e) => !e.ok).length
    if (failedRoutes > 0) {
      this.log.warn('dispatch: routing partially failed', { orderId, failed: failedRoutes, of: found.length, provider: matrix.provider })
    }
    return this.offers.addCandidates(orderId, attemptId, stage, ranked, { provider: matrix.provider, computedAt: matrix.computedAt })
  }

  /** Drivers move: queued candidates whose road figures are too old are re-routed from their CURRENT fix */
  private async refresh(orderId: number, attemptId: number): Promise<void> {
    const order = await readOrder(this.db, orderId)
    if (!order || order.pickupLatitude === null || order.pickupLongitude === null) return
    const settings = await this.loadSettings()
    const rows = await this.offers.queuedForRefresh(attemptId)
    if (rows.length === 0) return
    const pickup = { latitude: order.pickupLatitude, longitude: order.pickupLongitude }
    const matrix = await this.routing.matrix(rows.map((r) => ({ latitude: r.latitude, longitude: r.longitude })), pickup)
    const ranked = rankCandidates(
      rows.map((r, i) => ({
        driverId: r.driverId,
        straightLineMeters: Math.round(haversineMeters(r.latitude, r.longitude, pickup.latitude, pickup.longitude)),
        route: matrix.entries[i] ?? null,
        availableSince: null,
      })),
      settings.etaTieSeconds,
    )
    const base = Math.min(...rows.map((r) => r.batch)) * 1000
    const byTruck = new Map(rows.map((r) => [r.driverId, r]))
    await this.offers.applyRefresh(
      attemptId,
      ranked.map((c) => ({
        id: byTruck.get(c.driverId)!.id,
        rank: base + c.rank,
        route: c.route ?? { ok: false, error: 'PROVIDER_ERROR' },
      })),
      { provider: matrix.provider, computedAt: matrix.computedAt },
    )
  }
}
