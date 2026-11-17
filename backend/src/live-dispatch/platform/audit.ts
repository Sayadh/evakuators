import type { Sql } from './sql'
import { Params } from './params'
import type { Actor } from '../orders/domain/order-state'
import { enqueue } from '../notify/outbox'
import { OPS_TELEGRAM_ALERT_KINDS } from '../notify/ops-telegram'

export interface ActorRef {
  type: Actor
  /** User.id for ADMIN, FleetDriver.id for DRIVER, null for SYSTEM */
  id: number | null
}

export const SYSTEM: ActorRef = { type: 'SYSTEM', id: null }

/** Appends one audit row. Always called inside the transaction making the change. */
export async function recordEvent(
  tx: Sql,
  orderId: number,
  type: string,
  actor: ActorRef,
  data: Record<string, unknown> = {},
): Promise<number> {
  const p = new Params()
  const [row] = await tx.query<{ id: number }>(
    `INSERT INTO "OrderEvent" ("orderId", "type", "actorType", "actorId", "data")
     VALUES (${p.add(orderId)}::int, ${p.add(type)}, ${p.add(actor.type)}, ${p.add(actor.id)}::int, ${p.add(JSON.stringify(data))}::jsonb)
     RETURNING "id"`,
    p.values,
  )
  return Number(row.id)
}

/** Raises an operator alert at most once per dedupe key */
export async function raiseAlert(
  tx: Sql,
  orderId: number,
  kind: string,
  dedupeKey: string,
  data: Record<string, unknown> = {},
): Promise<boolean> {
  const rows = await tx.query<{ id: number }>(
    `INSERT INTO "OrderAlert" ("orderId", "kind", "dedupeKey", "data") VALUES ($1::int, $2, $3, $4::jsonb)
     ON CONFLICT ("dedupeKey") DO NOTHING RETURNING "id"`,
    [orderId, kind, dedupeKey, JSON.stringify(data)],
  )
  // The ones that need a person now also go to Telegram (2026-11-17) — in this
  // same transaction, so an alert is never raised without its message, nor sent
  // for an alert that was rolled back.
  if (rows.length > 0 && OPS_TELEGRAM_ALERT_KINDS.includes(kind)) {
    const id = Number(rows[0].id)
    await enqueue(tx, { topic: 'ops.alert', payload: { alertId: id }, dedupeKey: `ops-alert:${id}` })
  }
  return rows.length > 0
}
