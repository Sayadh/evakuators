import {
  NEAREST_CACHE_STORAGE_KEY,
  NEAREST_DAILY_SEARCH_LIMIT,
  NEAREST_QUOTA_STORAGE_KEY,
  NEAREST_RESULT_CACHE_TTL_MS,
} from '~/constants/nearest'
import type { NearestSearchResult } from '~/types/nearest'
import { yerevanDateKey } from '~/utils/formatters'

/**
 * The remembered half of «Գտնել մոտակա էվակուատորները»: an hour-long cache of
 * the last answer, and a per-day allowance of **detailed** ones.
 *
 * ## The allowance limits road data, not the search
 *
 * Spending it does not take the feature away. Past it the page keeps
 * searching — it asks the backend for straight-line distances only
 * (`skipRouting`), which costs the platform nothing because the expensive half
 * is the external routing call, not PostGIS. So `limitReached` means "no more
 * road distances and times today", never "no more answers today", and the
 * counter below is only ever charged for a search that actually bought road
 * data.
 *
 * ## Why the page does not do this itself
 *
 * Both rules are read in several places and in a specific order (cache first,
 * then allowance, then the request), and every one of those reads has to be
 * client-only. Spread across a page's `setup()` they become four `if
 * (import.meta.client)` checks that are each individually easy to forget.
 *
 * ## What is stored, and what deliberately is not
 *
 * The **answer** and a **counter**. Never the coordinates. `/evakuator`
 * promises the visitor's position is not stored, and `docs/nearest-search.md`
 * says the rounded server-side cache key is the only form it exists in
 * anywhere — caching the result rather than the query is what keeps both true.
 * Serving a remembered list needs the list, not the place it was computed
 * from, so there is no reason to write one and a standing promise not to.
 *
 * ## Neither rule is a security boundary
 *
 * `localStorage` can be cleared and incognito starts fresh. That is fine and
 * expected: this shapes the behaviour of the overwhelming majority who never
 * try, and the backend's global daily ORS budget (see
 * `backend/src/nearest/nearest-quota.service.ts`) is what actually protects
 * the metered routing quota, whatever any one browser claims. Do not "harden"
 * this by fingerprinting the browser — that would turn an anonymous page into
 * a tracking one, which is the trade `docs/nearest-search.md` § "What is
 * deliberately not here" already refused.
 */

interface CachedSearch {
  /** Epoch ms of when the search was performed — not the visitor's position */
  savedAt: number
  result: NearestSearchResult
}

interface DailyQuota {
  /** Armenia calendar day, `YYYY-MM-DD`; a count without one is meaningless */
  dateKey: string
  used: number
}

/**
 * Reads JSON out of `localStorage`, treating every failure as "nothing stored".
 *
 * The failures are real rather than theoretical: Safari throws on any access
 * in private mode, a quota-full origin throws on write, and a half-written or
 * hand-edited entry throws on parse. In all of them the correct behaviour is
 * identical — behave as though this is a first visit — so they are collapsed
 * rather than distinguished.
 */
function readStored<T>(key: string): T | null {
  if (!import.meta.client) return null
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function writeStored(key: string, value: unknown): void {
  if (!import.meta.client) return
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage full or blocked. The search still worked and the results are on
    // screen; losing only the ability to remember them is the mild failure,
    // and surfacing it would explain a problem the visitor cannot act on.
  }
}

export function useNearestSearch() {
  /** Null until `restore()` runs on the client — see the SSR note in the page */
  const cached = ref<CachedSearch | null>(null)
  const searchesUsedToday = ref(0)
  /**
   * False until storage has been read. The page gates the "N searches left"
   * hint on this so the number is never rendered before it is known: the
   * server and the pre-mount client both start at "none used", so showing it
   * unguarded would print the full allowance and then correct itself to the
   * real figure a moment later — a flash that reads as a bug on the one page
   * whose whole job is to be trusted in a hurry.
   */
  const restored = ref(false)

  const searchesLeftToday = computed(() =>
    Math.max(0, NEAREST_DAILY_SEARCH_LIMIT - searchesUsedToday.value),
  )
  const limitReached = computed(() => searchesLeftToday.value === 0)

  /**
   * Whether the remembered answer is still inside its hour.
   *
   * A getter rather than a stored flag, because "is it still fresh" is a
   * question about *now* — a value computed at restore time would go on
   * claiming freshness for as long as the tab stayed open.
   */
  const isCacheFresh = computed(
    () => cached.value !== null && Date.now() - cached.value.savedAt < NEAREST_RESULT_CACHE_TTL_MS,
  )

  /** The remembered answer regardless of age — what the page shows a visitor who is out of searches */
  const cachedResult = computed<NearestSearchResult | null>(() => cached.value?.result ?? null)
  const cachedAt = computed<Date | null>(() =>
    cached.value ? new Date(cached.value.savedAt) : null,
  )

  /**
   * Loads both values from storage. Must be called from `onMounted`, never
   * during setup: `localStorage` does not exist on the server, so reading it
   * while rendering would either crash SSR or — worse — render one thing on
   * the server and another in the browser and trip hydration.
   */
  function restore(): void {
    cached.value = readStored<CachedSearch>(NEAREST_CACHE_STORAGE_KEY)

    const quota = readStored<DailyQuota>(NEAREST_QUOTA_STORAGE_KEY)
    // A counter from a previous day is not a smaller number, it is a number
    // about something else — so it is discarded rather than carried forward.
    searchesUsedToday.value = quota?.dateKey === yerevanDateKey(new Date()) ? quota.used : 0
    restored.value = true
  }

  /**
   * Remembers an answer, and — unless told otherwise — charges it against
   * today's allowance.
   *
   * Called **after** a successful search, never before: a visitor who was
   * refused by the browser's permission prompt, or whose request failed, has
   * had nothing delivered and must not be charged for it.
   *
   * @param charge `false` for a straight-line-only answer served after the
   *   allowance was already spent. It is still worth remembering — it is the
   *   newest thing we know, and the hour-long cache is what spares the next
   *   press a geolocation prompt — but there is nothing left to charge, and
   *   incrementing past the limit would make a "used N of 2" figure nonsense.
   */
  function remember(result: NearestSearchResult, charge = true): void {
    const entry: CachedSearch = { savedAt: Date.now(), result }
    cached.value = entry
    writeStored(NEAREST_CACHE_STORAGE_KEY, entry)

    if (!charge) return

    searchesUsedToday.value += 1
    writeStored(NEAREST_QUOTA_STORAGE_KEY, {
      dateKey: yerevanDateKey(new Date()),
      used: searchesUsedToday.value,
    } satisfies DailyQuota)
  }

  return {
    restore,
    restored,
    remember,
    cachedResult,
    cachedAt,
    isCacheFresh,
    searchesLeftToday,
    limitReached,
  }
}
