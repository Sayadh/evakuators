import type { TowTruck, TowTruckCard, TowTruckCoverage } from '~/types/towTruck'
import { apiFetch, isNotFoundError } from './apiClient'

/**
 * All tow truck reads from the backend API.
 *
 * Note the return types: every **list** endpoint yields `TowTruckCard`, not
 * `TowTruck`. The backend serves a deliberately smaller shape for lists — no
 * secondary phone, Telegram, description, price table, plate number or
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

  /**
   * Every truck of one vehicle type, country-wide — the two vehicle-type
   * landing pages.
   *
   * A query parameter on the same endpoint rather than a route of its own, for
   * the same reason `city`, `district`, `region` and `zone` are: this is the
   * card list, narrowed. A second endpoint would be a second place for the card
   * shape, the rating join and the row cap to drift.
   *
   * `manipulator` is answered by the backend as a union of the vehicle type and
   * the equipment checkbox — see `docs/taxonomies.md`. That rule lives there
   * and not here, because the rows it has to cover are the ones written before
   * the column was derived.
   */
  getByVehicleType(vehicleType: string): Promise<TowTruckCard[]> {
    return apiFetch<TowTruckCard[]>('/tow-trucks', { query: { vehicleType } })
  },

  /** Exact corridor match — the backend adds no city fallback for this one */
  getByZone(zoneSlug: string): Promise<TowTruckCard[]> {
    return apiFetch<TowTruckCard[]>('/tow-trucks', { query: { zone: zoneSlug } })
  },

  /**
   * `regionCitySlugs` and `regionZoneSlugs` both come from the frontend static
   * data — the backend has no geography and cannot work out which cities or
   * corridors belong to a marz.
   *
   * `vehicleType` is what `/manipulator/kotayk` adds. The backend ANDs it with
   * the geography rather than replacing it (see its `ListTowTrucksQuery`), and
   * naming a type is also what lifts the landing-page-only exclusion — so this
   * one parameter is the difference between "every driver in Kotayk" and
   * "every crane in Kotayk", which is a set the general listing cannot return
   * at all.
   */
  getByRegion(
    regionSlug: string,
    regionCitySlugs: string[],
    regionZoneSlugs: string[],
    vehicleType?: string,
  ): Promise<TowTruckCard[]> {
    return apiFetch<TowTruckCard[]>('/tow-trucks', {
      query: {
        region: regionSlug,
        regionCities: regionCitySlugs.join(','),
        ...(regionZoneSlugs.length ? { regionZones: regionZoneSlugs.join(',') } : {}),
        ...(vehicleType ? { vehicleType } : {}),
      },
    })
  },

  /** `vehicleType` narrows this to `/manipulator/yerevan` — see getByRegion */
  getYerevan(vehicleType?: string): Promise<TowTruckCard[]> {
    return apiFetch<TowTruckCard[]>('/tow-trucks', {
      query: { yerevan: true, ...(vehicleType ? { vehicleType } : {}) },
    })
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
