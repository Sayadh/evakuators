/**
 * «Ազատ է / Զբաղված է» on a website card (2026-11-19, owner's decision).
 *
 * Read from the driver app's live state at the moment the page is requested —
 * not pushed, not refreshed while the page stays open. Shown ONLY for drivers
 * whose truck has driver-app access (`FleetDriver`, status ACTIVE); everyone
 * else gets no key at all, so a card without the app looks exactly as before.
 *
 * | App state | Card |
 * | --- | --- |
 * | blocked from orders by an operator | nothing |
 * | on an active order | BUSY |
 * | Offline (pressed it, auto-offline, never went Online) | nothing |
 * | silent for longer than `APP_STATUS_MAX_SILENCE_SECONDS` | nothing |
 * | marked busy outside the app (`externalBusy`) | BUSY |
 * | Online — including a lost connection, and a few seconds holding an offer | FREE |
 *
 * «Online with a lost connection» is FREE by the owner's choice: the driver
 * said he works, and auto-offline (fleet/auto-offline.ts) takes him Offline
 * once offers stop reaching the phone. The silence cap only stops a phone that
 * died a week ago from advertising a driver forever.
 *
 * The card is public (`GET /tow-trucks`), so this publishes nothing but the two
 * words: no location, no order, no timestamps.
 */
export type AppStatus = 'FREE' | 'BUSY'

/** Same horizon as dispatch's base fallback (DEFAULT baseHeartbeatMaxAgeSeconds) */
export const APP_STATUS_MAX_SILENCE_SECONDS = 7 * 24 * 3600

export interface AppPresenceRow {
  towTruckId: number
  wantsOnline: boolean
  externalBusy: boolean
  suspended: boolean
  onOrder: boolean
  silentTooLong: boolean
}

export function appStatusOf(row: AppPresenceRow): AppStatus | null {
  if (row.suspended) return null
  if (row.onOrder) return 'BUSY'
  if (!row.wantsOnline || row.silentTooLong) return null
  return row.externalBusy ? 'BUSY' : 'FREE'
}

/**
 * Off unless live dispatch runs: with it off nobody can change their state in
 * the app, so a stored «Online» would be a stale claim.
 */
export function appStatusEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.LIVE_DISPATCH_ENABLED ?? '').toLowerCase() === 'true'
}

/**
 * One row per truck with ACTIVE app access. `$1` is the truck ids as a
 * Postgres array literal (`pgArray`), `$2` the silence cap in seconds. Shared
 * by the repository and `test-live/app-status.integration.test.ts`, so the
 * query the site runs is the query the real-Postgres test runs.
 */
export const APP_PRESENCE_SQL = `
  SELECT f."towTruckId" AS "towTruckId",
         p."wantsOnline" AS "wantsOnline",
         p."externalBusy" AS "externalBusy",
         (p."dispatchSuspendedAt" IS NOT NULL
           AND (p."dispatchSuspendedUntil" IS NULL OR p."dispatchSuspendedUntil" > now())) AS "suspended",
         EXISTS (SELECT 1 FROM "OrderAssignment" y
                  WHERE y."driverId" = f."id" AND y."endedAt" IS NULL) AS "onOrder",
         (p."lastHeartbeatAt" IS NULL
           OR p."lastHeartbeatAt" < now() - make_interval(secs => $2::int)) AS "silentTooLong"
    FROM "FleetDriver" f
    JOIN "DriverPresence" p ON p."driverId" = f."id"
   WHERE f."towTruckId" = ANY($1::int[])
     AND f."status" = 'ACTIVE'`
