/**
 * WebSocket while the app is open. Auth in the first frame (never the URL).
 * Every event is a hint to re-read the snapshot; after every (re)connect the
 * snapshot is re-read, because events may have been missed.
 */
import { API_BASE } from '../api/client'

export function realtimeUrl(apiBase: string): string {
  return `${apiBase.replace(/^http/, 'ws').replace(/\/$/, '')}/realtime`
}

export function connectRealtime(options: {
  token: () => Promise<string | null>
  onEvent: (event: string, data: Record<string, unknown>) => void
  onReady: () => void
  onStatus: (connected: boolean) => void
}): () => void {
  let socket: WebSocket | null = null
  let stopped = false
  let backoff = 1000
  let timer: ReturnType<typeof setTimeout> | null = null
  const seen = new Set<string>()

  const open = async () => {
    const token = await options.token()
    if (stopped || !token) return
    socket = new WebSocket(realtimeUrl(API_BASE))
    socket.onopen = () => socket?.send(JSON.stringify({ type: 'auth', role: 'driver', token }))
    socket.onmessage = (message) => {
      let frame: { type?: string; eventId?: string; event?: string; data?: Record<string, unknown> }
      try {
        frame = JSON.parse(String(message.data))
      } catch {
        return
      }
      if (frame.type === 'ready') {
        backoff = 1000
        options.onStatus(true)
        options.onReady()
      } else if (frame.type === 'event' && frame.eventId && frame.event && !seen.has(frame.eventId)) {
        seen.add(frame.eventId)
        if (seen.size > 500) seen.delete(seen.values().next().value as string)
        options.onEvent(frame.event, frame.data ?? {})
      }
    }
    socket.onclose = (event) => {
      options.onStatus(false)
      socket = null
      if (stopped || event.code === 4401) return
      timer = setTimeout(() => void open(), backoff + Math.random() * 500)
      backoff = Math.min(backoff * 2, 30_000)
    }
  }
  void open()
  return () => {
    stopped = true
    if (timer) clearTimeout(timer)
    socket?.close(1000)
  }
}

export function sendAck(socket: WebSocket | null, offerId: string): void {
  socket?.send(JSON.stringify({ type: 'ack', offerId }))
}
