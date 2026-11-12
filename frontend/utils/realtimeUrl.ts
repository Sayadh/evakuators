/**
 * The live dispatch WebSocket URL, derived from the API base: same host,
 * `wss:` for `https:`, path `<base>/realtime`. Pure, so it is unit-tested.
 * The token NEVER goes into this URL (nginx logs URLs) — it is sent as the
 * first frame instead (composables/useOpsRealtime.ts).
 */
export function realtimeUrl(apiBase: string): string {
  const url = new URL(apiBase)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.pathname = `${url.pathname.replace(/\/$/, '')}/realtime`
  return url.toString()
}
