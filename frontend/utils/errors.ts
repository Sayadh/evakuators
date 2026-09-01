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
 *
 * Falls back to `fallback` for anything that isn't a `FetchError` carrying a
 * real backend body — deliberately, not to `error.message`. A `FetchError`
 * with no `data.message` at all means the request never reached the backend
 * (a connection-level failure — nginx's own `client_max_body_size` cutting
 * the connection before any response existed is the incident that surfaced
 * this: the browser's own error was the literal string "Failed to fetch",
 * which reached a driver's screen verbatim). That string, or any other raw
 * network/runtime `Error.message`, is never something a person can act on —
 * every call site already supplies a real Armenian `fallback` for exactly
 * this case, so there is nothing an unrecognized `error.message` adds.
 */
export function extractErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof FetchError) {
    const data = error.data as { message?: string | string[] } | undefined
    if (typeof data?.message === 'string') return data.message
    if (Array.isArray(data?.message)) return data.message.join(', ')
  }
  return fallback
}
