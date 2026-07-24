import { reviewsService } from '~/services'

export function useTowTruckReviews(towTruckId: number) {
  return useAsyncData(`reviews-${towTruckId}`, () => reviewsService.listForTruck(towTruckId), {
    default: () => [],
  })
}
