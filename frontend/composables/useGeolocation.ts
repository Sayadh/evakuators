/**
 * One-shot browser geolocation, with every failure turned into an Armenian
 * sentence a visitor can act on.
 *
 * ## One reading, not a watch
 *
 * `getCurrentPosition`, never `watchPosition`. The visitor is standing next to
 * a broken car; their position is not going to change in a way that matters,
 * and a watch would keep the GPS radio awake, keep the permission indicator
 * lit, and re-run the search every time the reading drifted by a few metres.
 * They press the button, they get an answer.
 *
 * ## Why the errors are enumerated
 *
 * `PERMISSION_DENIED` and `POSITION_UNAVAILABLE` need completely different
 * advice — one is a browser setting the visitor controls, the other usually
 * means indoors with no GPS fix — and a single "could not get your location"
 * for both leaves them with nothing to try. The codes are compared as numbers
 * rather than against `GeolocationPositionError.PERMISSION_DENIED`, because that
 * constant does not exist on the server and this file is imported during SSR.
 */
export interface GeolocationCoordinates {
  latitude: number
  longitude: number
}

/** Matches the spec's numeric codes — see the note above on why they are literals */
const PERMISSION_DENIED = 1
const POSITION_UNAVAILABLE = 2
const TIMEOUT = 3

export const GEOLOCATION_MESSAGES = {
  unsupported:
    'Ձեր browser-ը չի աջակցում տեղադրության որոշմանը։ Օգտվեք ստորև՝ մարզերի և քաղաքների որոնումից։',
  denied:
    'Տեղադրության թույլտվությունը մերժվել է։ Կարող եք թույլատրել այն browser-ի հասցեագոտու կողքի կողպեքի պատկերակից, կամ օգտվել մարզերի և քաղաքների որոնումից։',
  unavailable:
    'Չհաջողվեց որոշել Ձեր տեղադրությունը։ Փորձեք դուրս գալ բաց տարածք և կրկնել, կամ օգտվել մարզերի և քաղաքների որոնումից։',
  timeout: 'Տեղադրության որոշումը շատ երկար տևեց։ Փորձեք կրկին։',
} as const

/**
 * Timeout for the browser's own lookup.
 *
 * 15s is generous on purpose: a cold GPS fix outdoors genuinely takes ten
 * seconds or more, and giving up at five would push a visitor with a real,
 * working device onto the error path.
 */
const GEOLOCATION_TIMEOUT_MS = 15_000

/**
 * A cached fix is fine within a minute.
 *
 * The alternative, `maximumAge: 0`, forces a fresh hardware fix on every press,
 * including the one a visitor makes ten seconds after the first. This is a
 * parked car, not a moving vehicle.
 */
const GEOLOCATION_MAX_AGE_MS = 60_000

export function useGeolocation() {
  const locating = ref(false)
  const error = ref('')

  /**
   * Resolves with a position, or `null` after setting `error` to a message the
   * page can show as-is.
   *
   * Deliberately does not throw: every caller would wrap it in a try/catch that
   * did exactly this, and a rejected promise for "the visitor said no" treats a
   * normal, expected answer as an exception.
   */
  async function locate(): Promise<GeolocationCoordinates | null> {
    error.value = ''

    // Guards SSR as well as genuinely unsupported browsers — `navigator` does
    // not exist while the page is being rendered on the server.
    if (!import.meta.client || !('geolocation' in navigator)) {
      error.value = GEOLOCATION_MESSAGES.unsupported
      return null
    }

    locating.value = true
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: GEOLOCATION_TIMEOUT_MS,
          maximumAge: GEOLOCATION_MAX_AGE_MS,
        })
      })

      return {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      }
    } catch (caught) {
      error.value = messageFor(caught)
      return null
    } finally {
      locating.value = false
    }
  }

  return { locating, error, locate }
}

function messageFor(caught: unknown): string {
  const code = (caught as { code?: number } | null)?.code
  if (code === PERMISSION_DENIED) return GEOLOCATION_MESSAGES.denied
  if (code === POSITION_UNAVAILABLE) return GEOLOCATION_MESSAGES.unavailable
  if (code === TIMEOUT) return GEOLOCATION_MESSAGES.timeout
  // Anything without a recognised code is, from the visitor's side, the same
  // situation as "no fix" — and the advice that goes with it is still useful.
  return GEOLOCATION_MESSAGES.unavailable
}
