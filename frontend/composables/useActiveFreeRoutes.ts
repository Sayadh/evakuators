import { freeRoutesService } from '~/services'

/**
 * The public «Ազատ երթուղիներ» list, under one `useAsyncData` key so the page
 * and every button that links to it share a single request.
 */
export function useActiveFreeRoutes() {
  return useAsyncData('free-routes', () => freeRoutesService.getActive(), {
    default: () => [],
  })
}

/**
 * Whether a button to `/free-routes` has anything to lead to. A failed request
 * counts as "no": the button is a shortcut, and the nav link stays either way.
 */
export function useHasActiveFreeRoutes() {
  const { data } = useActiveFreeRoutes()
  return computed(() => data.value.length > 0)
}
