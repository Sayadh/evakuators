/**
 * Firebase Cloud Messaging, HTTP v1 API, without `firebase-admin`.
 *
 * Auth is the documented service-account flow: a JWT signed RS256 with the
 * account's private key is exchanged at Google's token endpoint for a
 * short-lived OAuth access token (scope firebase.messaging), cached until a
 * minute before it expires. iOS delivery goes through FCM to APNs — the APNs
 * key is uploaded to the Firebase project, not configured here.
 *
 * The credentials are read from the environment (FCM_SERVICE_ACCOUNT_JSON or
 * a path), never logged, never sent anywhere but Google.
 */
import { createSign } from 'node:crypto'

export interface ServiceAccount {
  project_id: string
  client_email: string
  private_key: string
  token_uri?: string
}

export interface PushMessage {
  token: string
  title: string
  body: string
  /** FCM data values must be strings */
  data: Record<string, string>
  /** Seconds; the message is dropped by FCM/APNs after this */
  ttlSeconds: number
  /** Newer message with the same key replaces an undelivered older one */
  collapseKey: string
  highPriority: boolean
}

export type PushSendResult =
  | { ok: true; messageId: string }
  | { ok: false; invalidToken: boolean; retryable: boolean; error: string }

export interface PushSender {
  send(message: PushMessage): Promise<PushSendResult>
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
}

export function signServiceAccountJwt(account: ServiceAccount, nowSeconds: number): string {
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claims = base64url(
    JSON.stringify({
      iss: account.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: account.token_uri ?? 'https://oauth2.googleapis.com/token',
      iat: nowSeconds,
      exp: nowSeconds + 3600,
    }),
  )
  const signer = createSign('RSA-SHA256')
  signer.update(`${header}.${claims}`)
  return `${header}.${claims}.${base64url(signer.sign(account.private_key))}`
}

export class FcmSender implements PushSender {
  private accessToken: { value: string; expiresAt: number } | null = null

  constructor(
    private readonly account: ServiceAccount,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly timeoutMs = 5000,
  ) {}

  private async token(): Promise<string> {
    const now = Math.floor(Date.now() / 1000)
    if (this.accessToken && this.accessToken.expiresAt - 60 > now) return this.accessToken.value
    const assertion = signServiceAccountJwt(this.account, now)
    const response = await this.fetchImpl(this.account.token_uri ?? 'https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }).toString(),
      signal: AbortSignal.timeout(this.timeoutMs),
    })
    if (!response.ok) throw new Error(`FCM auth failed: HTTP ${response.status}`)
    const data = (await response.json()) as { access_token: string; expires_in: number }
    this.accessToken = { value: data.access_token, expiresAt: now + data.expires_in }
    return data.access_token
  }

  async send(message: PushMessage): Promise<PushSendResult> {
    let accessToken: string
    try {
      accessToken = await this.token()
    } catch (error) {
      return { ok: false, invalidToken: false, retryable: true, error: (error as Error).message }
    }
    const ttl = Math.max(1, Math.floor(message.ttlSeconds))
    const body = {
      message: {
        token: message.token,
        notification: { title: message.title, body: message.body },
        data: message.data,
        android: {
          ttl: `${ttl}s`,
          priority: message.highPriority ? 'HIGH' : 'NORMAL',
          collapse_key: message.collapseKey,
          notification: { channel_id: message.highPriority ? 'offers' : 'orders', tag: message.collapseKey },
        },
        apns: {
          headers: {
            // Absolute UNIX time after which APNs stops trying.
            'apns-expiration': String(Math.floor(Date.now() / 1000) + ttl),
            'apns-priority': message.highPriority ? '10' : '5',
            'apns-push-type': 'alert',
            'apns-collapse-id': message.collapseKey.slice(0, 64),
          },
          payload: { aps: { sound: 'default', 'thread-id': 'evakuators' } },
        },
      },
    }
    let response: Response
    try {
      response = await this.fetchImpl(`https://fcm.googleapis.com/v1/projects/${this.account.project_id}/messages:send`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      })
    } catch (error) {
      return { ok: false, invalidToken: false, retryable: true, error: `network: ${(error as Error).name}` }
    }
    if (response.ok) {
      const data = (await response.json()) as { name: string }
      return { ok: true, messageId: data.name }
    }
    const error = (await response.json().catch(() => ({}))) as {
      error?: { status?: string; details?: { errorCode?: string }[] }
    }
    const code = error.error?.details?.find((d) => d.errorCode)?.errorCode ?? error.error?.status ?? `HTTP_${response.status}`
    // UNREGISTERED: the app was uninstalled or the token rotated.
    // INVALID_ARGUMENT on a token-only message: a malformed/foreign token.
    const invalidToken = code === 'UNREGISTERED' || (code === 'INVALID_ARGUMENT' && response.status === 400) || code === 'SENDER_ID_MISMATCH'
    const retryable = response.status === 429 || response.status >= 500
    if (response.status === 401) this.accessToken = null
    return { ok: false, invalidToken, retryable: retryable || response.status === 401, error: code }
  }
}

/** Records instead of sending. The DEFAULT outside production, and in load tests. */
export class RecordingPushSender implements PushSender {
  readonly sent: PushMessage[] = []
  constructor(private readonly behaviour: (message: PushMessage) => PushSendResult = () => ({ ok: true, messageId: `fake-${Date.now()}` })) {}

  async send(message: PushMessage): Promise<PushSendResult> {
    this.sent.push(message)
    return this.behaviour(message)
  }
}
