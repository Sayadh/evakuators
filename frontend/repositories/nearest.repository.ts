import { apiFetch } from './apiClient'
import type { NearestSearchResult } from '~/types/nearest'

/**
 * The nearest-evacuator search.
 *
 * POST with the coordinates in the body, not a GET with them in the query
 * string — a query string ends up in nginx's `access.log`, which would write a
 * visitor's exact position to disk next to their IP and a timestamp, for a value
 * this platform deliberately never stores. See the backend's `FindNearestDto`.
 *
 * No auth: the search is public, exactly like the listing endpoints. The
 * backend throttles it more tightly than the global default because a cache
 * miss costs an external routing request.
 */
export const nearestRepository = {
  findNearest(latitude: number, longitude: number): Promise<NearestSearchResult> {
    return apiFetch<NearestSearchResult>('/nearest-tow-trucks', {
      method: 'POST',
      body: { latitude, longitude },
    })
  },
}
