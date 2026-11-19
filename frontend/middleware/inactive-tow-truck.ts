import { towTrucksService } from '~/services'
import { getInactiveTowTruckRoute } from '~/utils/inactiveTowTruckRoute'

/**
 * Sends a deactivated driver's profile to the listing of the same area.
 *
 * 302, not 301: deactivation is reversible (an unpaid driver comes back after
 * paying), and the profile must answer at its own URL again when that happens.
 * A slug that never existed still gets the page's normal 404.
 *
 * Server only, because that is where search engines and links from outside
 * arrive; listings inside the site never link to a deactivated truck. If the
 * lookup fails the visitor gets the same 404 as before.
 */
export default defineNuxtRouteMiddleware(async (to) => {
  if (import.meta.client) return

  const placement = await towTrucksService
    .getInactivePlacement(String(to.params.slug))
    .catch(() => null)
  if (!placement) return

  const localePath = useLocalePath()
  return navigateTo(localePath(getInactiveTowTruckRoute(placement)), { redirectCode: 302 })
})
