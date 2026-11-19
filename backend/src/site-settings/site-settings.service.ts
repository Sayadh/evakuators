import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { PrismaSqlDatabase } from '../live-dispatch/platform/prisma-sql'

/**
 * Site-wide settings switched from /admin (2026-11-18). Public read (every
 * page's SSR asks for it), so it is cached in memory for a few seconds and the
 * cache is dropped on every write — a switch shows on the next page load.
 *
 * - `design` 1 — the homepage hero as designed: «Ազատ երթուղիներ» (white),
 *   «Գտնել մոտակա էվակուատորները» (gold) and our number (outlined).
 * - `design` 2 — those two buttons hidden everywhere they appear, and our
 *   number made the main call to action (frontend composables/useSiteDesign.ts).
 *   The pages themselves (/free-routes, /evakuator) stay reachable by URL.
 */
export type SiteDesign = 1 | 2
export interface PublicSiteSettings {
  design: SiteDesign
}

export const DEFAULT_SITE_SETTINGS: PublicSiteSettings = { design: 1 }
const CACHE_MS = 10_000

export function parseDesign(value: unknown): SiteDesign {
  return value === 2 ? 2 : 1
}

@Injectable()
export class SiteSettingsService {
  private readonly db: PrismaSqlDatabase
  private cache: { value: PublicSiteSettings; at: number } | null = null

  constructor(prisma: PrismaService) {
    this.db = new PrismaSqlDatabase(prisma)
  }

  async get(now = Date.now()): Promise<PublicSiteSettings> {
    if (this.cache && now - this.cache.at < CACHE_MS) return this.cache.value
    try {
      const rows = await this.db.query<{ key: string; value: unknown }>(`SELECT "key", "value" FROM "SiteSetting"`)
      const byKey = new Map(rows.map((r) => [r.key, typeof r.value === 'string' ? JSON.parse(r.value) : r.value]))
      const value: PublicSiteSettings = { design: parseDesign(byKey.get('design') ?? DEFAULT_SITE_SETTINGS.design) }
      this.cache = { value, at: now }
      return value
    } catch {
      // The site must render even if this table is missing (migration not applied yet): design 1
      return this.cache?.value ?? DEFAULT_SITE_SETTINGS
    }
  }

  async setDesign(design: SiteDesign, adminUserId: number | null): Promise<PublicSiteSettings> {
    await this.db.query(
      `INSERT INTO "SiteSetting" ("key", "value", "updatedAt", "updatedByUserId") VALUES ('design', $1::jsonb, now(), $2::int)
       ON CONFLICT ("key") DO UPDATE SET "value" = EXCLUDED."value", "updatedAt" = now(), "updatedByUserId" = EXCLUDED."updatedByUserId"`,
      [JSON.stringify(design), adminUserId],
    )
    this.cache = null
    return this.get()
  }
}
