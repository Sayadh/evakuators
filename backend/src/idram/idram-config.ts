import type { AppConfig } from '../config/configuration'

/**
 * Whether this environment has merchant credentials, and therefore whether it
 * can take card payments at all.
 *
 * ## Why this is a pure function and not just a getter on IdramService
 *
 * Two places need the answer, and they must never disagree.
 * `IdramService.isConfigured` needs it to decide whether to hand a driver a
 * payment form, and `SubscriptionActiveGuard` needs it to decide whether the
 * paywall applies — a guard that locked drivers out while the form was
 * unavailable would be a wall with no door.
 *
 * The guard cannot simply inject `IdramService`: `IdramModule` and
 * `SubscriptionsModule` are already a declared `forwardRef` cycle, and the
 * guard is *exported* to `MyTowTruckModule` and `FreeRoutesModule`, so pulling
 * a service across that cycle from inside a guard resolved in three different
 * modules is exactly the kind of DI graph `scripts/check-di-graph.js` exists
 * to catch. A function over the config value has none of that — both callers
 * read `config.idram` themselves and ask the same question of it.
 *
 * Blank is a normal state, not a misconfiguration: see the note on
 * `IDRAM_REC_ACCOUNT` in `env.validation.ts` and the deploy sequence in
 * `docs/deployment.md`.
 */
export function isIdramConfigured(credentials: AppConfig['idram']): boolean {
  return credentials.recAccount.length > 0 && credentials.secretKey.length > 0
}
