/**
 * Watches what must keep running and tells the operators on Telegram when it
 * stops (2026-11-17). Each process is watched from OUTSIDE — a dead process
 * cannot report its own death:
 *
 *   - the API process watches the WORKER (its `SystemHeartbeat` row, written
 *     every 15 s) and the nightly BACKUP (row written by scripts/backup-db.sh);
 *   - the worker watches the API (an HTTP GET of /api/v1/health on its port).
 *
 * One «down» message per incident and one «back» message when it recovers —
 * never a message per check. The state for the DB-backed checks lives in
 * `SystemHeartbeat.alertedAt`, claimed with a conditional UPDATE, so two API
 * instances or a restart neither duplicate nor lose an alert.
 */
import type { Sql } from '../platform/sql'
import type { OpsChannel } from './ops-telegram'

/** What one check should do now. Pure. */
export function watchDecision(healthy: boolean, alerted: boolean): 'down' | 'up' | null {
  if (!healthy && !alerted) return 'down'
  if (healthy && alerted) return 'up'
  return null
}

export interface HeartbeatCheck {
  name: string
  /** Older than this = not running */
  maxAgeSeconds: number
  /** Never seen at all: alert (a backup never set up), or stay quiet (a worker on a box where dispatch is off) */
  alertWhenMissing: boolean
  down: (lastAt: Date | null) => string
  up: string
}

const clock = (at: Date) => at.toLocaleTimeString('en-GB', { timeZone: 'Asia/Yerevan', hour: '2-digit', minute: '2-digit' })
const day = (at: Date) => at.toLocaleDateString('en-GB', { timeZone: 'Asia/Yerevan' })

/**
 * PM2 names its processes `evakuators-<app>` and, on staging,
 * `evakuators-<app>-staging`; PM2 puts the current one in `process.env.name`.
 * The hint in a message names the process to look at on THIS box.
 */
export function pm2Name(app: 'worker' | 'backend', currentName: string | undefined): string {
  return `evakuators-${app}${(currentName ?? '').endsWith('-staging') ? '-staging' : ''}`
}

export function workerCheck(currentPm2Name: string | undefined): HeartbeatCheck {
  return {
    name: 'worker',
    maxAgeSeconds: 120,
    alertWhenMissing: false,
    down: (at) =>
      `🔴 Worker-ը չի աշխատում${at ? ` (վերջին ազդանշանը՝ ${clock(at)})` : ''} — պատվերները չեն բաշխվում։\nՍերվերում՝ pm2 logs ${pm2Name('worker', currentPm2Name)} --lines 50`,
    up: '🟢 Worker-ը նորից աշխատում է։',
  }
}

export const BACKUP_CHECK: HeartbeatCheck = {
  name: 'backup',
  // Nightly, with room for a slow night
  maxAgeSeconds: 26 * 3600,
  alertWhenMissing: true,
  down: (at) =>
    at
      ? `🔴 Բազայի պահուստը չի ստեղծվել 26 ժամից ավելի (վերջինը՝ ${day(at)} ${clock(at)})։\nՍերվերում՝ tail -50 /var/log/evakuators-backup.log`
      : '🔴 Բազայի պահուստ դեռ երբեք չի ստեղծվել։ Տես docs/deployment.md § «Database backups»։',
  up: '🟢 Բազայի պահուստը նորից ստեղծվում է։',
}

export async function beat(db: Sql, name: string, data: Record<string, unknown> = {}): Promise<void> {
  await db.query(
    `INSERT INTO "SystemHeartbeat" ("name", "at", "data") VALUES ($1, now(), $2::jsonb)
     ON CONFLICT ("name") DO UPDATE SET "at" = now(), "data" = EXCLUDED."data"`,
    [name, JSON.stringify(data)],
  )
}

/** One check of one heartbeat; sends at most one message. Returns what it sent. */
export async function checkHeartbeat(db: Sql, channel: OpsChannel, check: HeartbeatCheck): Promise<'down' | 'up' | null> {
  const [row] = await db.query<{ at: Date | string; alertedAt: Date | string | null; ageSeconds: number }>(
    `SELECT "at", "alertedAt", EXTRACT(EPOCH FROM (now() - "at"))::float8 AS "ageSeconds" FROM "SystemHeartbeat" WHERE "name" = $1`,
    [check.name],
  )
  if (!row && !check.alertWhenMissing) return null
  if (!row) {
    // Remember the alert for a heartbeat that does not exist yet
    await db.query(`INSERT INTO "SystemHeartbeat" ("name", "at") VALUES ($1, to_timestamp(0)) ON CONFLICT ("name") DO NOTHING`, [check.name])
    return checkHeartbeat(db, channel, check)
  }
  const at = new Date(row.at)
  const healthy = Number(row.ageSeconds) <= check.maxAgeSeconds
  const decision = watchDecision(healthy, row.alertedAt !== null)
  if (decision === null) return null
  // Claim the transition: only one watcher sends it
  const claimed = await db.query(
    decision === 'down'
      ? `UPDATE "SystemHeartbeat" SET "alertedAt" = now() WHERE "name" = $1 AND "alertedAt" IS NULL RETURNING 1`
      : `UPDATE "SystemHeartbeat" SET "alertedAt" = NULL WHERE "name" = $1 AND "alertedAt" IS NOT NULL RETURNING 1`,
    [check.name],
  )
  if (claimed.length === 0) return null
  try {
    await channel.send({ text: decision === 'down' ? check.down(at.getTime() === 0 ? null : at) : check.up })
  } catch (error) {
    // Not sent: give the claim back so the next check tries again
    await db.query(`UPDATE "SystemHeartbeat" SET "alertedAt" = ${decision === 'down' ? 'NULL' : 'now()'} WHERE "name" = $1`, [check.name])
    throw error
  }
  return decision
}

/**
 * The worker's view of the API: in-memory state (the API cannot be asked to
 * store it — it is the thing that is down). Two failed checks in a row before
 * «down», so a deploy's reload is not an incident.
 */
export class HttpWatch {
  private failures = 0
  private alerted = false

  constructor(
    private readonly url: string,
    private readonly channel: OpsChannel,
    private readonly texts: { down: string; up: string },
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async check(): Promise<'down' | 'up' | null> {
    let ok = false
    try {
      const response = await this.fetchImpl(this.url, { signal: AbortSignal.timeout(5_000) })
      ok = response.ok
    } catch {
      ok = false
    }
    this.failures = ok ? 0 : this.failures + 1
    const decision = watchDecision(this.failures < 2, this.alerted)
    if (decision === null) return null
    await this.channel.send({ text: decision === 'down' ? this.texts.down : this.texts.up })
    this.alerted = decision === 'down'
    return decision
  }
}
