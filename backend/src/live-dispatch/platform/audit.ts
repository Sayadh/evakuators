import type { Sql } from './sql'
import { Params } from './params'
import type { Actor } from '../orders/domain/order-state'

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
  const rows = await tx.query(
    `INSERT INTO "OrderAlert" ("orderId", "kind", "dedupeKey", "data") VALUES ($1::int, $2, $3, $4::jsonb)
     ON CONFLICT ("dedupeKey") DO NOTHING RETURNING "id"`,
    [orderId, kind, dedupeKey, JSON.stringify(data)],
  )
  return rows.length > 0
}
