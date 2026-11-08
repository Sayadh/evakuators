/**
 * HTTP client for /api/v1/driver-app/*.
 *
 * - The token comes from secure storage, never from AsyncStorage.
 * - Every call has a timeout. A timeout on a MUTATION is reported as
 *   `uncertain` (it may have reached the server), never as success or failure.
 * - 401 SESSION_REVOKED (other device logged in, admin revoked) → logout.
 */
import Constants from 'expo-constants'
import { randomUUID } from 'expo-crypto'
import type { HistoryItem, ProgressAction, Snapshot } from './types'
import type { Fix } from '../location/buffer'
import type { TrackingPolicyDto } from './types'

export const API_BASE: string = (Constants.expoConfig?.extra as { apiBaseUrl?: string } | undefined)?.apiBaseUrl ?? ''

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

/** The request may or may not have been applied (timeout / dropped connection) */
export class UncertainError extends Error {
  constructor() {
    super('uncertain')
  }
}

export class NetworkError extends Error {}

let tokenProvider: () => Promise<string | null> = async () => null
let onSessionRevoked: () => void = () => undefined

export function configureClient(options: { token: () => Promise<string | null>; onSessionRevoked: () => void }): void {
  tokenProvider = options.token
  onSessionRevoked = options.onSessionRevoked
}

async function request<T>(method: string, path: string, body?: unknown, options: { idempotencyKey?: string; timeoutMs?: number; mutation?: boolean } = {}): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 10_000)
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const token = await tokenProvider()
  if (token) headers.Authorization = `Bearer ${token}`
  if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey
  let response: Response
  try {
    response = await fetch(`${API_BASE}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: controller.signal })
  } catch {
    // Did the request leave the phone? We cannot know: for a mutation that is "uncertain".
    if (options.mutation) throw new UncertainError()
    throw new NetworkError('network')
  } finally {
    clearTimeout(timer)
  }
  if (response.status === 204) return undefined as T
  const data = (await response.json().catch(() => ({}))) as { code?: string; message?: string }
  if (!response.ok) {
    const code = data.code ?? (response.status === 401 ? 'SESSION_REVOKED' : `HTTP_${response.status}`)
    if (response.status === 401) onSessionRevoked()
    throw new ApiError(response.status, code, data.message ?? code)
  }
  return data as T
}

export const api = {
  login(body: { phone: string; password: string; deviceId: string; platform: 'ios' | 'android'; appVersion: string }) {
    return request<{ token: string; sessionId: string; towTruckId: number; mustChangePassword: boolean }>('POST', '/driver-app/sessions', body)
  },
  logout: () => request<void>('DELETE', '/driver-app/sessions/current'),
  consent: (version: number) => request<void>('POST', '/driver-app/consent/tracking', { version }),
  snapshot: () => request<Snapshot>('GET', '/driver-app/me'),
  setAvailability: (change: { wantsOnline?: boolean; externalBusy?: boolean }) => request<Snapshot>('PUT', '/driver-app/me/availability', change),
  heartbeat: () => request<{ serverTime: string }>('POST', '/driver-app/me/heartbeat', {}, { timeoutMs: 8000 }),
  locations: (fixes: Fix[]) =>
    request<{ accepted: number; rejected: { seq: number | null; reason: string }[]; currentUpdated: boolean; policy: TrackingPolicyDto; serverTime: string }>(
      'POST',
      '/driver-app/me/locations',
      { fixes },
      { timeoutMs: 15_000 },
    ),
  pushToken: (token: string) => request<void>('POST', '/driver-app/me/push-token', { token }),
  accept: (offerId: string, idempotencyKey: string) => request<{ orderId: number; status: string }>('POST', `/driver-app/offers/${offerId}/accept`, {}, { idempotencyKey, mutation: true }),
  reject: (offerId: string, idempotencyKey: string) => request<unknown>('POST', `/driver-app/offers/${offerId}/reject`, {}, { idempotencyKey, mutation: true }),
  ack: (offerId: string, channel: 'PUSH' | 'REALTIME') => request<void>('POST', `/driver-app/offers/${offerId}/ack`, { channel }),
  progress: (orderId: number, action: ProgressAction, idempotencyKey: string) =>
    request<unknown>('POST', `/driver-app/orders/${orderId}/progress`, { action }, { idempotencyKey, mutation: true }),
  request: (orderId: number, body: { kind: 'CANCEL' | 'PROBLEM'; reason: string; comment: string | null }, idempotencyKey: string) =>
    request<unknown>('POST', `/driver-app/orders/${orderId}/requests`, body, { idempotencyKey, mutation: true }),
  history: (before?: string) => request<HistoryItem[]>('GET', `/driver-app/orders/history${before ? `?before=${encodeURIComponent(before)}` : ''}`),
}

export const newKey = (): string => randomUUID()
