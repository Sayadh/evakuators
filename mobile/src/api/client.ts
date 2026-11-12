/**
 * HTTP client for /api/v1/driver-app/*.
 *
 * - The token comes from secure storage, never from AsyncStorage.
 * - Every call has a timeout. A timeout on a MUTATION is reported as
 *   `uncertain` (it may have reached the server), never as success or failure.
 * - 401 SESSION_REVOKED (other device logged in, admin revoked) → logout;
 *   401 INVALID_CREDENTIALS (wrong password on a re-auth) is NOT a logout.
 */
import Constants from 'expo-constants'
import { File as ExpoFile } from 'expo-file-system'
import { getToken } from '../auth/session'
import { randomUUID } from 'expo-crypto'
import type { HistoryItem, MissedOffer, ProfileChangeStatus, ProfileResponse, ProgressAction, SiteListingView, Snapshot, WalletEntry, WalletResponse, WalletTopup } from './types'
import type { Fix } from '../location/buffer'
import type { TrackingPolicyDto } from './types'

/**
 * `process.env.EXPO_PUBLIC_*` is inlined by Metro on every bundle, so a changed
 * `.env` applies after `expo start -c`. `expoConfig.extra` is embedded in the
 * native binary at build time (iOS), so it would keep a stale URL until the next
 * `expo run:ios` — it stays only as a fallback.
 */
export const API_BASE: string =
  process.env.EXPO_PUBLIC_API_BASE_URL || ((Constants.expoConfig?.extra as { apiBaseUrl?: string } | undefined)?.apiBaseUrl ?? '')
const WEBSITE_URL: string = (Constants.expoConfig?.extra as { websiteUrl?: string } | undefined)?.websiteUrl || 'https://evakuators.am'
/** The app's privacy policy and the out-of-app deletion page (store requirements: reachable from inside the app) */
export const PRIVACY_POLICY_URL = `${WEBSITE_URL}/driver-app/privacy`
export const DELETE_ACCOUNT_URL = `${WEBSITE_URL}/driver-app/delete-account`
/** The website's own policy — the one a published profile is under */
export const SITE_PRIVACY_URL = `${WEBSITE_URL}/privacy`
export const websiteUrl = (path: string): string => `${WEBSITE_URL}${path}`

const API_ORIGIN = API_BASE.replace(/^(https?:\/\/[^/]+).*$/, '$1')
/**
 * A photo URL the phone can actually load. In development the server writes
 * its media URLs as `http://localhost:4002/media/…` (MEDIA_PUBLIC_URL) — on the
 * phone "localhost" is the phone itself, so every profile photo was blank
 * (2026-11-12). Such a URL is re-pointed at the API's own origin (the tunnel),
 * which serves `/media/` too. Production URLs pass through untouched.
 */
export function mediaUrl(url: string): string {
  if (!API_ORIGIN) return url
  return url.replace(/^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|10\.0\.2\.2)(:\d+)?(?=\/)/, API_ORIGIN)
}

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

// Default: the stored token, so background handlers (push ack) work before AppState configures the client
let tokenProvider: () => Promise<string | null> = () => getToken()
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
  const data = (await response.json().catch(() => ({}))) as { code?: string; message?: string | string[] }
  if (!response.ok) {
    const code = data.code ?? (response.status === 401 ? 'SESSION_REVOKED' : `HTTP_${response.status}`)
    // 401 means "this device is signed out" — EXCEPT a wrong password typed
    // while signed in (Settings → Delete account re-asks it): that must show
    // "wrong password", not throw the driver out of the app.
    if (response.status === 401 && code !== 'INVALID_CREDENTIALS') onSessionRevoked()
    // `message` is Armenian text written for a person (backend
    // common/exception-response.ts) — the website's rules answer with it and
    // no `code`, so screens show it as it is.
    throw new ApiError(response.status, code, Array.isArray(data.message) ? data.message.join(' · ') : (data.message ?? code))
  }
  return data as T
}

export const api = {
  login(body: { phone: string; password: string; deviceId: string; platform: 'ios' | 'android'; appVersion: string }) {
    return request<{ token: string; sessionId: string; driverId: number; kind: 'SITE_LINKED' | 'APP_ONLY'; mustChangePassword: boolean }>('POST', '/driver-app/sessions', body)
  },
  /**
   * The sign-up: the WEBSITE's registration plus a password (2026-11). The
   * payload is built by the website's own `buildRegistrationPayload`; photos
   * are uploaded first (`uploadImage`) and travel as `imageIds`.
   */
  registerOnSite: (body: Record<string, unknown>) =>
    request<{ id: number; status: string }>('POST', '/driver-app/site-registrations', body, { timeoutMs: 30_000 }),
  /** The website's public upload endpoint — a photo becomes an id to attach */
  uploadImage: (photo: { uri: string; mimeType: string; fileName: string }) => uploadImage(photo),
  profile: () => request<ProfileResponse>('GET', '/driver-app/me/profile'),
  /** Queues the edit for moderation — never writes (see the backend controller) */
  /** "I want to be on the website too" — an admin reviews and publishes */
  requestSiteListing: (note?: string) => request<SiteListingView>('POST', '/driver-app/me/site-listing', { note }, { timeoutMs: 15_000 }),
  /** One-time t.me link to connect Telegram (only once on the website) */
  telegramLink: () => request<{ url: string | null; linked: boolean }>('POST', '/driver-app/me/telegram-link', {}, { timeoutMs: 15_000 }),
  updateProfile: (body: Record<string, unknown>) => request<ProfileChangeStatus>('PUT', '/driver-app/me/profile', body, { timeoutMs: 20_000 }),
  updateCoordinates: (body: { latitude: number; longitude: number }) => request<ProfileChangeStatus>('PUT', '/driver-app/me/profile/coordinates', body),
  withdrawProfileChange: () => request<{ withdrawn: boolean }>('DELETE', '/driver-app/me/profile/change'),
  changePassword: (body: { currentPassword: string; newPassword: string }) => request<void>('PUT', '/driver-app/me/password', body),
  logout: () => request<void>('DELETE', '/driver-app/sessions/current'),
  consent: (version: number) => request<void>('POST', '/driver-app/consent/tracking', { version }),
  /** Withdraws location consent and goes offline (refused during an active order) */
  withdrawConsent: () => request<void>('DELETE', '/driver-app/consent/tracking'),
  /** Deletes the driver's own app account — irreversible; the password is asked again */
  deleteAccount: (password: string) => request<void>('POST', '/driver-app/me/delete', { password }, { timeoutMs: 20_000 }),
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
  /** `sound`: the driver's new-order ring (push/sounds.ts) — the server names it in the iOS offer push */
  pushToken: (token: string, sound?: string) => request<void>('POST', '/driver-app/me/push-token', sound ? { token, sound } : { token }),
  accept: (offerId: string, idempotencyKey: string) => request<{ orderId: number; status: string }>('POST', `/driver-app/offers/${offerId}/accept`, {}, { idempotencyKey, mutation: true }),
  reject: (offerId: string, idempotencyKey: string, reason: string | null = null) =>
    request<unknown>('POST', `/driver-app/offers/${offerId}/reject`, reason ? { reason } : {}, { idempotencyKey, mutation: true }),
  /** `expiresAt`: the deadline once the answer window started (server 2026-11; an older one answers 204 → undefined) */
  ack: (offerId: string, channel: 'PUSH' | 'REALTIME') =>
    request<{ expiresAt: string | null } | undefined>('POST', `/driver-app/offers/${offerId}/ack`, { channel }),
  progress: (orderId: number, action: ProgressAction, idempotencyKey: string) =>
    request<unknown>('POST', `/driver-app/orders/${orderId}/progress`, { action }, { idempotencyKey, mutation: true }),
  confirmPrice: (orderId: number, agreedPriceAmd: number, idempotencyKey: string) =>
    request<unknown>('POST', `/driver-app/orders/${orderId}/price`, { agreedPriceAmd }, { idempotencyKey, mutation: true }),
  request: (orderId: number, body: { kind: 'CANCEL' | 'PROBLEM'; reason: string; comment: string | null }, idempotencyKey: string) =>
    request<unknown>('POST', `/driver-app/orders/${orderId}/requests`, body, { idempotencyKey, mutation: true }),
  // ─── Wallet (2026-11-12) ───
  wallet: () => request<WalletResponse>('GET', '/driver-app/me/wallet'),
  walletEntries: (before: number) => request<WalletEntry[]>('GET', `/driver-app/me/wallet/entries?before=${before}`),
  /** A new Idram bill; open `payUrl` in the browser to pay it */
  createTopup: (amountAmd: number) => request<WalletTopup & { payUrl: string }>('POST', '/driver-app/me/wallet/topups', { amountAmd }),
  topup: (paymentId: number) => request<WalletTopup>('GET', `/driver-app/me/wallet/topups/${paymentId}`),
  /** Offers he let run out, newest first; `before` = the last item's `offeredAt` */
  missedOffers: (before?: string) => request<MissedOffer[]>('GET', `/driver-app/orders/missed${before ? `?before=${encodeURIComponent(before)}` : ''}`),
  history: (before?: string) => request<HistoryItem[]>('GET', `/driver-app/orders/history${before ? `?before=${encodeURIComponent(before)}` : ''}`),
}

export const newKey = (): string => randomUUID()

/**
 * `POST /images` — multipart, field `file`. Its own function because `request`
 * speaks JSON. 60 s: a photo on a slow mobile connection. 429 is the upload
 * limit (30 a minute per address), reported as such so the screen can say "wait".
 */
/**
 * The multipart body, built by hand. FormData is avoided on purpose: the
 * global fetch is Expo's (expo/fetch), which rejects React Native's
 * `{ uri, name, type }` file descriptor ("Unsupported FormDataPart
 * implementation", 2026-11-12), and which FormData flavour is installed
 * differs between builds. Bytes + an explicit boundary work with any fetch.
 */
export function multipartBody(field: string, fileName: string, mimeType: string, bytes: Uint8Array, boundary: string): Uint8Array {
  const encoder = new TextEncoder()
  const safeName = fileName.replace(/["\r\n\\/]/g, '_')
  const head = encoder.encode(`--${boundary}\r\nContent-Disposition: form-data; name="${field}"; filename="${safeName}"\r\nContent-Type: ${mimeType}\r\n\r\n`)
  const tail = encoder.encode(`\r\n--${boundary}--\r\n`)
  const body = new Uint8Array(head.length + bytes.length + tail.length)
  body.set(head, 0)
  body.set(bytes, head.length)
  body.set(tail, head.length + bytes.length)
  return body
}

async function uploadImage(photo: { uri: string; mimeType: string; fileName: string }): Promise<number> {
  let bytes: Uint8Array
  try {
    bytes = new Uint8Array(await new ExpoFile(photo.uri).arrayBuffer())
  } catch (e) {
    // The picked file is gone (cache purged / app reinstalled) — not the network
    throw new ApiError(0, 'PHOTO_MISSING', e instanceof Error ? e.message : 'photo file missing')
  }
  const boundary = `----evakuators${randomUUID().replace(/-/g, '')}`
  const body = multipartBody('file', photo.fileName, photo.mimeType, bytes, boundary)
  // A dropped mobile upload is retried once before the screen is told: the
  // upload has no side effect until the registration references its id.
  let response: Response | null = null
  let failure = ''
  for (let attempt = 0; attempt < 2 && !response; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 120_000)
    try {
      response = await fetch(`${API_BASE}/images`, {
        method: 'POST',
        headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
        body: body as unknown as BodyInit,
        signal: controller.signal,
      })
    } catch (e) {
      failure = controller.signal.aborted ? 'timeout' : e instanceof Error ? e.message : String(e)
    } finally {
      clearTimeout(timer)
    }
  }
  if (!response) throw new NetworkError(failure || 'network')
  const data = (await response.json().catch(() => ({}))) as { id?: number; message?: string }
  if (!response.ok || typeof data.id !== 'number') {
    throw new ApiError(response.status, response.status === 429 ? 'RATE_LIMITED' : `HTTP_${response.status}`, data.message ?? 'upload failed')
  }
  return data.id
}
