/**
 * Concrete routing providers. No SDKs — plain `fetch`, so nothing new is added
 * to package.json and the request each one makes is visible right here.
 */
import { ProviderHttpError, type LatLng, type MatrixResult, type RouteEntry, type RoutingProvider } from './routing-provider'

// ─── Google Routes API: computeRouteMatrix ──────────────────────────────────

interface GoogleMatrixElement {
  originIndex?: number
  destinationIndex?: number
  status?: { code?: number; message?: string }
  condition?: 'ROUTE_EXISTS' | 'ROUTE_NOT_FOUND' | 'ROUTE_MATRIX_ELEMENT_CONDITION_UNSPECIFIED'
  distanceMeters?: number
  duration?: string
}

/** "123.4s" → 123.4 (protobuf Duration JSON form) */
export function parseGoogleDuration(value: string | undefined): number | null {
  if (typeof value !== 'string' || !/^\d+(\.\d+)?s$/.test(value)) return null
  return Number(value.slice(0, -1))
}

export class GoogleRoutesProvider implements RoutingProvider {
  readonly name = 'google-routes'
  // 625 per request (100 with TRAFFIC_AWARE_OPTIMAL). Dispatch batches are
  // ≤ 25 origins × 1 destination, far below either.
  readonly maxElementsPerRequest: number

  constructor(
    private readonly apiKey: string,
    private readonly routingPreference: 'TRAFFIC_UNAWARE' | 'TRAFFIC_AWARE' | 'TRAFFIC_AWARE_OPTIMAL' = 'TRAFFIC_AWARE',
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly baseUrl = 'https://routes.googleapis.com',
  ) {
    this.maxElementsPerRequest = routingPreference === 'TRAFFIC_AWARE_OPTIMAL' ? 100 : 625
  }

  async matrix(origins: LatLng[], destination: LatLng, signal: AbortSignal): Promise<MatrixResult> {
    const waypoint = (point: LatLng) => ({
      waypoint: { location: { latLng: { latitude: point.latitude, longitude: point.longitude } } },
    })
    const response = await this.fetchImpl(`${this.baseUrl}/distanceMatrix/v2:computeRouteMatrix`, {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        // Server-side key: never shipped to a browser or the app bundle.
        'X-Goog-Api-Key': this.apiKey,
        // `status` MUST be in the mask, or failed elements look successful.
        'X-Goog-FieldMask': 'originIndex,destinationIndex,status,condition,distanceMeters,duration',
      },
      body: JSON.stringify({
        origins: origins.map(waypoint),
        destinations: [waypoint(destination)],
        travelMode: 'DRIVE',
        routingPreference: this.routingPreference,
      }),
    })
    if (!response.ok) {
      // Never log the body: it echoes coordinates.
      throw new ProviderHttpError(response.status, response.status === 429 || response.status >= 500)
    }
    const elements = (await response.json()) as GoogleMatrixElement[]
    if (!Array.isArray(elements)) throw new ProviderHttpError(502, true)

    const entries: RouteEntry[] = origins.map(() => ({ ok: false, error: 'ELEMENT_ERROR' }))
    for (const element of elements) {
      // proto3 JSON omits zero values: a missing index IS index 0.
      const index = element.originIndex ?? 0
      if ((element.destinationIndex ?? 0) !== 0 || index < 0 || index >= origins.length) continue
      if (element.status && element.status.code && element.status.code !== 0) {
        entries[index] = { ok: false, error: 'ELEMENT_ERROR' }
        continue
      }
      if (element.condition !== 'ROUTE_EXISTS') {
        entries[index] = { ok: false, error: 'NO_ROUTE' }
        continue
      }
      const seconds = parseGoogleDuration(element.duration)
      const meters = element.distanceMeters ?? 0
      if (seconds === null || !Number.isFinite(meters)) {
        entries[index] = { ok: false, error: 'ELEMENT_ERROR' }
        continue
      }
      entries[index] = { ok: true, meters, seconds }
    }
    return { provider: this.name, computedAt: new Date(), entries, billableElements: origins.length }
  }
}

// ─── OpenRouteService matrix (the provider /evakuator already uses) ─────────

interface OrsMatrixResponse {
  distances?: (number | null)[][]
  durations?: (number | null)[][]
}

export class OrsProvider implements RoutingProvider {
  readonly name = 'openrouteservice'
  readonly maxElementsPerRequest = 3500

  constructor(
    private readonly apiKey: string,
    private readonly baseUrl = 'https://api.openrouteservice.org',
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async matrix(origins: LatLng[], destination: LatLng, signal: AbortSignal): Promise<MatrixResult> {
    // ORS: [longitude, latitude] — X then Y.
    const locations = [...origins, destination].map((p) => [p.longitude, p.latitude])
    const response = await this.fetchImpl(`${this.baseUrl}/v2/matrix/driving-car`, {
      method: 'POST',
      signal,
      headers: { Authorization: this.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        locations,
        sources: origins.map((_, i) => i),
        destinations: [origins.length],
        metrics: ['distance', 'duration'],
        units: 'm',
      }),
    })
    if (!response.ok) throw new ProviderHttpError(response.status, response.status === 429 || response.status >= 500)
    const data = (await response.json()) as OrsMatrixResponse
    const entries: RouteEntry[] = origins.map((_, i) => {
      const meters = data.distances?.[i]?.[0]
      const seconds = data.durations?.[i]?.[0]
      if (typeof meters !== 'number' || typeof seconds !== 'number' || !Number.isFinite(meters) || !Number.isFinite(seconds)) {
        return { ok: false, error: 'NO_ROUTE' }
      }
      return { ok: true, meters, seconds }
    })
    return { provider: this.name, computedAt: new Date(), entries, billableElements: origins.length }
  }
}

// ─── Fake provider: tests, local development, load tests (the DEFAULT) ──────

/**
 * Deterministic: road distance = straight line × `detour`, at `speedKmh`.
 * Can inject latency, whole-request failures and per-origin failures, which
 * is how the "slow provider" load scenario and the partial-failure tests run
 * without a key, without cost, and without network.
 */
export class FakeRoutingProvider implements RoutingProvider {
  readonly name = 'fake'
  readonly maxElementsPerRequest = 625
  calls = 0

  constructor(
    private readonly options: {
      detour?: number
      speedKmh?: number
      latencyMs?: number
      failRequestEvery?: number
      failOrigin?: (origin: LatLng, index: number) => boolean
      httpStatusOnFail?: number
    } = {},
  ) {}

  async matrix(origins: LatLng[], destination: LatLng, signal: AbortSignal): Promise<MatrixResult> {
    this.calls++
    if (this.options.latencyMs) {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, this.options.latencyMs)
        signal.addEventListener('abort', () => {
          clearTimeout(timer)
          reject(new Error('aborted'))
        })
      })
    }
    if (this.options.failRequestEvery && this.calls % this.options.failRequestEvery === 0) {
      const status = this.options.httpStatusOnFail ?? 503
      throw new ProviderHttpError(status, status === 429 || status >= 500)
    }
    const detour = this.options.detour ?? 1.3
    const speed = (this.options.speedKmh ?? 40) / 3.6
    const entries: RouteEntry[] = origins.map((origin, index) => {
      if (this.options.failOrigin?.(origin, index)) return { ok: false, error: 'NO_ROUTE' }
      const meters = Math.round(straightLine(origin, destination) * detour)
      return { ok: true, meters, seconds: Math.round(meters / speed) }
    })
    return { provider: this.name, computedAt: new Date(), entries, billableElements: origins.length }
  }
}

function straightLine(a: LatLng, b: LatLng): number {
  const toRad = Math.PI / 180
  const dLat = (b.latitude - a.latitude) * toRad
  const dLng = (b.longitude - a.longitude) * toRad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * toRad) * Math.cos(b.latitude * toRad) * Math.sin(dLng / 2) ** 2
  return 2 * 6_371_008.8 * Math.asin(Math.min(1, Math.sqrt(h)))
}

export function createRoutingProvider(config: {
  provider: string
  googleApiKey: string
  googleRoutingPreference?: 'TRAFFIC_UNAWARE' | 'TRAFFIC_AWARE' | 'TRAFFIC_AWARE_OPTIMAL'
  orsApiKey: string
  orsBaseUrl?: string
}): RoutingProvider {
  switch (config.provider) {
    case 'google':
      if (!config.googleApiKey) throw new Error('DISPATCH_ROUTING_PROVIDER=google requires GOOGLE_ROUTES_API_KEY')
      return new GoogleRoutesProvider(config.googleApiKey, config.googleRoutingPreference)
    case 'ors':
      if (!config.orsApiKey) throw new Error('DISPATCH_ROUTING_PROVIDER=ors requires ROUTE_MATRIX_API_KEY')
      return new OrsProvider(config.orsApiKey, config.orsBaseUrl)
    case 'fake':
      return new FakeRoutingProvider()
    default:
      throw new Error(`unknown DISPATCH_ROUTING_PROVIDER "${config.provider}"`)
  }
}
