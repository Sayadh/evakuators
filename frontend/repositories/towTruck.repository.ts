import type { TowTruck, TowTruckCard, TowTruckCoverage } from '~/types/towTruck'
import { apiFetch, isNotFoundError } from './apiClient'

/**
 * All tow truck reads from the backend API.
 *
 * Note the return types: every **list** endpoint yields `TowTruckCard`, not
 * `TowTruck`. The backend serves a deliberately smaller shape for lists — no
 * secondary phone, Telegram, email, description, price table, plate number or
 * extra photos — so a listing response can no longer be used to harvest every
 * driver's contact details. Only `getBySlug` returns a full profile.
 */
export const towTruckRepository = {
  getByCity(citySlug: string): Promise<TowTruckCard[]> {
    return apiFetch<TowTruckCard[]>('/tow-trucks', { query: { city: citySlug } })
  },

  getByDistrict(districtSlug: string): Promise<TowTruckCard[]> {
    return apiFetch<TowTruckCard[]>('/tow-trucks', { query: { district: districtSlug } })
  },

  /** Exact corridor match — the backend adds no city fallback for this one */
  getByZone(zoneSlug: string): Promise<TowTruckCard[]> {
    return apiFetch<TowTruckCard[]>('/tow-trucks', { query: { zone: zoneSlug } })
  },

  /**
   * `regionCitySlugs` and `regionZoneSlugs` both come from the frontend static
   * data — the backend has no geography and cannot work out which cities or
   * corridors belong to a marz.
   */
  getByRegion(
    regionSlug: string,
    regionCitySlugs: string[],
    regionZoneSlugs: string[],
  ): Promise<TowTruckCard[]> {
    return apiFetch<TowTruckCard[]>('/tow-trucks', {
      query: {
        region: regionSlug,
        regionCities: regionCitySlugs.join(','),
        ...(regionZoneSlugs.length ? { regionZones: regionZoneSlugs.join(',') } : {}),
      },
    })
  },

  getYerevan(): Promise<TowTruckCard[]> {
    return apiFetch<TowTruckCard[]>('/tow-trucks', { query: { yerevan: true } })
  },

  /** Admin-curated "best tow trucks" — empty array when the admin hasn't marked any */
  getFeatured(): Promise<TowTruckCard[]> {
    return apiFetch<TowTruckCard[]>('/tow-trucks/featured')
  },

  /**
   * Geography footprint of every active truck — the input for every
   * `towTruckCount` on the browse pages. A fraction of the size of the listing
   * it replaced, and it contains no contact details at all.
   */
  getCoverage(): Promise<TowTruckCoverage[]> {
    return apiFetch<TowTruckCoverage[]>('/tow-trucks/coverage')
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
