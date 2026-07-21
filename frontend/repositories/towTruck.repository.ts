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

  getYerevan(): Promise<TowTruck[]> {
    return apiFetch<TowTruck[]>('/tow-trucks', { query: { yerevan: true } })
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
