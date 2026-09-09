import { useDriverAuthStore } from '~/stores/driverAuth'

/** Where the header's driver link points, and what it says */
export interface DriverEntry {
  label: string
  to: string
}

/** What a driver who is not signed in sees — and what the server always renders */
export const DRIVER_ENTRY_SIGNED_OUT: DriverEntry = { label: 'Մուտք', to: '/login' }
const DRIVER_ENTRY_SIGNED_IN: DriverEntry = { label: 'Իմ էջը', to: '/dashboard' }

/**
 * The driver's way in, from the header and the mobile menu.
 *
 * ## Why this exists at all
 *
 * Until now `/login` was linked from nowhere. A driver who had registered,
 * closed the tab and come back had no way to reach their own profile except by
 * typing the URL or finding an old email — on a site whose entire paid product
 * is that profile. The register button was in the header the whole time; the
 * door back in was not.
 *
 * ## Why a composable and not two `NuxtLink`s
 *
 * The header and the drawer both show it, and they must never disagree about
 * whether the visitor is signed in. Two copies of that condition is two places
 * for it to drift, and the drawer is the one nobody looks at while testing.
 * The two call sites style it differently — a quiet link in the bar, a block
 * button in the drawer — which is the part that genuinely differs.
 *
 * ## Why it waits for mount
 *
 * The session lives in localStorage and is loaded by `initStores.client.ts`,
 * so during SSR every visitor is signed out. Reading the store straight into
 * the markup would render «Մուտք» on the server and «Իմ էջը» on the client for
 * a signed-in driver — a hydration mismatch on the site's most-rendered
 * component, on every page.
 *
 * So the signed-out label is what the server and the first client tick both
 * produce, and the swap happens after mount. The cost is that a signed-in
 * driver sees «Մուտք» for one frame; the alternative costs a Vue hydration
 * warning and a header that can render twice.
 *
 * Either destination works for either state regardless — `driver-guest` sends
 * a signed-in driver from `/login` to the dashboard, and `driver-auth` sends a
 * signed-out one the other way — so the worst case is one redirect, never a
 * dead end.
 */
export function useDriverEntry(): ComputedRef<DriverEntry> {
  const driverAuth = useDriverAuthStore()
  const mounted = ref(false)

  onMounted(() => {
    mounted.value = true
  })

  return computed(() =>
    mounted.value && driverAuth.isLoggedIn ? DRIVER_ENTRY_SIGNED_IN : DRIVER_ENTRY_SIGNED_OUT,
  )
}
