import { apiFetch } from './apiClient'
import { useDriverAuthStore } from '~/stores/driverAuth'
import type { MyFreeRoute } from '~/types/freeRoute'

/** Fields the driver sets when posting/editing a free route (mirrors backend DTOs) */
export interface FreeRoutePayload {
  startRegionSlug: string
  startCitySlug: string
  endRegionSlug: string
  endCitySlug: string
  /** ISO 8601 datetime — combine the day + time pickers before calling */
  departureAt: string
  description?: string
}

/** Driver self-service — always operates on the caller's own routes (JWT-scoped) */
export const myFreeRoutesRepository = {
  getMine(): Promise<MyFreeRoute[]> {
    return apiFetch<MyFreeRoute[]>('/my/free-routes', {
      headers: useDriverAuthStore().authHeader,
    })
  },

  create(payload: FreeRoutePayload): Promise<MyFreeRoute> {
    return apiFetch<MyFreeRoute>('/my/free-routes', {
      method: 'POST',
      body: payload as unknown as Record<string, unknown>,
      headers: useDriverAuthStore().authHeader,
    })
  },

  update(id: number, payload: Partial<FreeRoutePayload>): Promise<MyFreeRoute> {
    return apiFetch<MyFreeRoute>(`/my/free-routes/${id}`, {
      method: 'PATCH',
      body: payload as unknown as Record<string, unknown>,
      headers: useDriverAuthStore().authHeader,
    })
  },

  remove(id: number): Promise<{ id: number }> {
    return apiFetch<{ id: number }>(`/my/free-routes/${id}`, {
      method: 'DELETE',
      headers: useDriverAuthStore().authHeader,
    })
  },
}
