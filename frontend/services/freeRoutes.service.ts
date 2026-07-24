import { mockRequest } from './apiClient'
import { mockFreeRoutes } from '~/mocks/freeRoutes'
import { freeRoutesRepository, isApiEnabled } from '~/repositories'
import type { FreeRoute } from '~/types/freeRoute'

/**
 * Data source switch, same convention as towTrucksService: with a configured
 * API base this hits the backend; otherwise it reads local mock data.
 */
export const freeRoutesService = {
  getActive(): Promise<FreeRoute[]> {
    if (isApiEnabled()) return freeRoutesRepository.getActive()
    return mockRequest(() => mockFreeRoutes)
  },
}
