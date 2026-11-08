/**
 * The operator console's WebSocket. Events are HINTS: every `order.changed`
 * (and every reconnect) just triggers a re-read over HTTP — the page never
 * assumes it saw every event. Duplicate events (same `eventId`) are ignored.
 *
 * The admin token goes in the first FRAME, never in the URL (nginx logs URLs).
 */
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { getApiBase } from '~/repositories/apiClient'
import { useAdminAuthStore } from '~/stores/adminAuth'
import { realtimeUrl } from '~/utils/realtimeUrl'

export interface OpsRealtimeEvent {
  eventId: string
  event: string
  data: Record<string, unknown>
}

export function useOpsRealtime(onEvent: (event: OpsRealtimeEvent) => void, onReconnect: () => void) {
  const connected = ref(false)
  let socket: WebSocket | null = null
  let stopped = false
  let backoff = 1000
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  const seen = new Set<string>()

  function connect(): void {
    if (stopped || !import.meta.client) return
    const token = useAdminAuthStore().token
    if (!token) return
    socket = new WebSocket(realtimeUrl(getApiBase()))
    socket.addEventListener('open', () => socket?.send(JSON.stringify({ type: 'auth', role: 'ops', token })))
    socket.addEventListener('message', (message) => {
      let frame: { type?: string; eventId?: string; event?: string; data?: Record<string, unknown> }
      try {
        frame = JSON.parse(String(message.data))
      } catch {
        return
      }
      if (frame.type === 'ready') {
        connected.value = true
        backoff = 1000
        onReconnect()
        return
      }
      if (frame.type === 'event' && frame.eventId && frame.event) {
        if (seen.has(frame.eventId)) return
        seen.add(frame.eventId)
        if (seen.size > 2000) seen.delete(seen.values().next().value as string)
        onEvent({ eventId: frame.eventId, event: frame.event, data: frame.data ?? {} })
      }
    })
    socket.addEventListener('close', (event) => {
      connected.value = false
      socket = null
      if (stopped || event.code === 4401) return
      retryTimer = setTimeout(connect, backoff + Math.random() * 500)
      backoff = Math.min(backoff * 2, 30_000)
    })
  }

  onMounted(connect)
  onBeforeUnmount(() => {
    stopped = true
    if (retryTimer) clearTimeout(retryTimer)
    socket?.close(1000)
  })

  return { connected }
}
