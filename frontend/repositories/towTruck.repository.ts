import type { TowTruck } from '~/types/towTruck'
import { apiFetch, isNotFoundError } from './apiClient'

/** All tow truck reads from the backend API */
export const towTruckRepository = {
  getAll(): Promise<TowTruck[]> {
    return apiFetch<TowTruck[]>('/tow-trucks')
  },

  getByCity(citySlug: string): Promise<TowTruck[]> {
    return apiFetch<TowTruck[]>('/tow-trucks', { query: { city: citySlug } })
  },

  getByDistrict(districtSlug: string): Promise<TowTruck[]> {
    return apiFetch<TowTruck[]>('/tow-trucks', { query: { district: districtSlug } })
  },

  /** regionCitySlugs come from the frontend static data (backend has no geography) */
  getByRegion(regionSlug: string, regionCitySlugs: string[]): Promise<TowTruck[]> {
    return apiFetch<TowTruck[]>('/tow-trucks', {
      query: { region: regionSlug, regionCities: regionCitySlugs.join(',') },
    })
  },

  // NOTE: the backend also serves `GET /tow-trucks?yerevan=true` (see
  // docs/api-reference.md), but the frontend no longer calls it — every page that
  // wanted it already had the full list loaded for per-district counts, so it is
  // derived in memory by `selectYerevanTowTrucks()` instead of costing a second
  // request. The endpoint stays for other API consumers.

  /** Admin-curated "best tow trucks" — empty array when the admin hasn't marked any */
  getFeatured(): Promise<TowTruck[]> {
    return apiFetch<TowTruck[]>('/tow-trucks/featured')
  },

  async getBySlug(slug: string): Promise<TowTruck | null> {
    try {
      return await apiFetch<TowTruck>(`/tow-trucks/${slug}`)
    } catch (error) {
      if (isNotFoundError(error)) return null
      throw error
    }
  },
}
