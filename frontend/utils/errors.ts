import { FetchError } from 'ofetch'

/**
 * Surfaces the backend's actual validation/error message (e.g. "this phone
 * number already belongs to another active driver") instead of ofetch's
 * generic FetchError.message (which is just something like
 * `[POST] "/admin/...": 400 Bad Request` — the real text lives in
 * `error.data.message`, NestJS's standard error body shape).
 *
 * Every catch block that shows an error to a person — admin or driver —
 * should use this instead of a hardcoded string, so a specific backend
 * message (e.g. a duplicate-phone rejection) actually reaches them.
 */
export function extractErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof FetchError) {
    const data = error.data as { message?: string | string[] } | undefined
    if (typeof data?.message === 'string') return data.message
    if (Array.isArray(data?.message)) return data.message.join(', ')
  }
  return error instanceof Error ? error.message : fallback
}
