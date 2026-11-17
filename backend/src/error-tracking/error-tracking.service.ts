import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { PrismaSqlDatabase } from '../live-dispatch/platform/prisma-sql'
import { TelegramOpsChannel } from '../live-dispatch/notify/ops-telegram'
import { recordError, type ErrorReport } from './error-store'

export interface ErrorGroupView {
  id: number
  source: string
  message: string
  stack: string | null
  context: Record<string, unknown>
  release: string | null
  count: number
  firstSeenAt: string
  lastSeenAt: string
  resolvedAt: string | null
}

/** The API's side of error tracking (2026-11-17) — see error-store.ts */
@Injectable()
export class ErrorTrackingService {
  private readonly db: PrismaSqlDatabase
  private readonly ops: TelegramOpsChannel
  private readonly frontendUrl: string

  constructor(prisma: PrismaService) {
    this.db = new PrismaSqlDatabase(prisma)
    this.frontendUrl = (process.env.FRONTEND_URL ?? 'https://evakuators.am').replace(/\/$/, '')
    this.ops = new TelegramOpsChannel(this.db, { botToken: process.env.ADMIN_TELEGRAM_BOT_TOKEN ?? '', frontendUrl: this.frontendUrl })
  }

  record(report: ErrorReport): Promise<'new' | 'repeat' | 'dropped'> {
    return recordError(this.db, report, { ops: this.ops, frontendUrl: this.frontendUrl })
  }

  async list(status: 'open' | 'resolved', limit = 200): Promise<ErrorGroupView[]> {
    const rows = await this.db.query<Record<string, unknown>>(
      `SELECT "id", "source", "message", "stack", "context", "release", "count", "firstSeenAt", "lastSeenAt", "resolvedAt"
         FROM "ErrorGroup" WHERE ${status === 'open' ? '"resolvedAt" IS NULL' : '"resolvedAt" IS NOT NULL'}
        ORDER BY "lastSeenAt" DESC LIMIT $1::int`,
      [Math.min(Math.max(limit, 1), 500)],
    )
    const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null)
    return rows.map((r) => ({
      id: Number(r.id),
      source: String(r.source),
      message: String(r.message),
      stack: r.stack === null ? null : String(r.stack),
      context: (typeof r.context === 'string' ? JSON.parse(r.context) : r.context) as Record<string, unknown>,
      release: r.release === null ? null : String(r.release),
      count: Number(r.count),
      firstSeenAt: iso(r.firstSeenAt) as string,
      lastSeenAt: iso(r.lastSeenAt) as string,
      resolvedAt: iso(r.resolvedAt),
    }))
  }

  /** «Fixed»: the group closes; if it happens again it reopens and is reported again */
  async resolve(id: number): Promise<{ resolved: boolean }> {
    const rows = await this.db.query(`UPDATE "ErrorGroup" SET "resolvedAt" = now() WHERE "id" = $1::int AND "resolvedAt" IS NULL RETURNING 1`, [id])
    return { resolved: rows.length > 0 }
  }
}
