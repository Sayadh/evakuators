import { apiFetch } from './apiClient'
import type { FreeRoute } from '~/types/freeRoute'

/** Public read — anonymous customers browsing "Ազատ երթուղիներ" */
export const freeRoutesRepository = {
  getActive(): Promise<FreeRoute[]> {
    return apiFetch<FreeRoute[]>('/free-routes')
  },
}
