import { DispatchError } from './errors'
import { resolveSettings, SETTING_KEYS, validateCombination, validateSetting, type DispatchSettings } from './settings'
import type { SqlDatabase } from './sql'

/**
 * Reads `DispatchSetting` with a short cache (settings are read on every
 * dispatch step and every ingest). Writes are ADMIN-only (enforced by the
 * controller guard) and validated — individually and as a combination —
 * before anything is stored.
 */
export class SettingsRepository {
  private cache: { value: DispatchSettings; at: number } | null = null

  constructor(
    private readonly db: SqlDatabase,
    private readonly ttlMs = 5000,
    private readonly onInvalid: (key: string, reason: string) => void = () => undefined,
  ) {}

  async get(): Promise<DispatchSettings> {
    if (this.cache && Date.now() - this.cache.at < this.ttlMs) return this.cache.value
    const rows = await this.db.query<{ key: string; value: unknown }>(`SELECT "key", "value" FROM "DispatchSetting"`)
    const value = resolveSettings(rows, this.onInvalid)
    this.cache = { value, at: Date.now() }
    return value
  }

  async update(changes: Record<string, unknown>, adminUserId: number): Promise<DispatchSettings> {
    const errors: Record<string, string> = {}
    for (const [key, value] of Object.entries(changes)) {
      const reason = validateSetting(key, value)
      if (reason) errors[key] = reason
    }
    if (Object.keys(errors).length > 0) throw new DispatchError('VALIDATION_FAILED', { errors })
    const current = await this.get()
    const merged = { ...current, ...changes } as DispatchSettings
    const combined = validateCombination(merged)
    if (combined.length > 0) throw new DispatchError('VALIDATION_FAILED', { errors: { '*': combined.join('; ') } })

    await this.db.transaction(async (tx) => {
      for (const [key, value] of Object.entries(changes)) {
        if (!SETTING_KEYS.includes(key as keyof DispatchSettings)) continue
        await tx.query(
          `INSERT INTO "DispatchSetting" ("key", "value", "updatedAt", "updatedByUserId") VALUES ($1, $2::jsonb, now(), $3::int)
           ON CONFLICT ("key") DO UPDATE SET "value" = EXCLUDED."value", "updatedAt" = now(), "updatedByUserId" = EXCLUDED."updatedByUserId"`,
          [key, JSON.stringify(value), adminUserId],
        )
      }
    })
    this.cache = null
    return this.get()
  }
}
