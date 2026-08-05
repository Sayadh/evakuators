<script setup lang="ts">
import type { NearestTowTruck } from '~/types/nearest'
import { formatDistanceLine, formatDurationLine } from '~/utils/formatDistance'

/**
 * A search result: the ordinary driver card, with a distance strip above it.
 *
 * ## Why it wraps `TowTruckCard` instead of replacing it
 *
 * The card already renders the photo, the vehicle, the coverage and — crucially
 * — the «Զանգահարել» button, which fires both trackers through
 * `usePhoneActions` (see `docs/analytics.md` § "Side effect: driver contact
 * notices"). A purpose-built card for this page would have had to reimplement
 * that button, and the day it was reimplemented slightly differently is the day
 * a driver stops being notified that someone took their number. Wrapping keeps
 * the analytics correct by not touching them.
 *
 * The distance strip therefore sits *outside* the card rather than inside it:
 * nothing about `TowTruckCard` changes, and every other listing on the site is
 * unaffected by this feature existing.
 */
interface Props {
  result: NearestTowTruck
  /** Whether the response carried real road data — see `NearestSearchResult.routed` */
  routed: boolean
}

const props = defineProps<Props>()

/**
 * Road distance when this particular driver was routable, straight line
 * otherwise — and the label says which. A driver ORS could not reach is shown
 * with an honest «Ուղիղ գծով» even in an otherwise routed response, rather than
 * being given a road figure that was never computed.
 */
const distanceLine = computed(() => {
  const road = props.result.roadMeters
  return road !== undefined
    ? formatDistanceLine(road, true)
    : formatDistanceLine(props.result.straightLineMeters, false)
})

const durationLine = computed(() =>
  props.result.durationSeconds !== undefined
    ? formatDurationLine(props.result.durationSeconds)
    : '',
)
</script>

<template>
  <div class="nearest-result">
    <div class="nearest-result__distance">
      <span class="nearest-result__metric">
        <AppIcon name="map-pin" :size="16" />
        {{ distanceLine }}
      </span>
      <!-- Rendered only when a real routed duration exists. There is deliberately
           no fallback estimate here: a time derived from a straight line would
           mean inventing an average speed, and a made-up arrival time is the one
           number on this page a stranded person would actually plan around. -->
      <span v-if="durationLine" class="nearest-result__metric">
        <AppIcon name="clock" :size="16" />
        {{ durationLine }}
      </span>
    </div>

    <TowTruckCard :tow-truck="result.towTruck" />
  </div>
</template>

<style scoped lang="scss">
.nearest-result {
  display: flex;
  flex-direction: column;

  &__distance {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2) var(--space-4);
    padding: var(--space-3) var(--space-4);
    border: 1px solid var(--color-border);
    border-bottom: none;
    border-radius: var(--radius-lg) var(--radius-lg) 0 0;
    background: var(--color-bg);
  }

  &__metric {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--color-text);

    svg {
      flex-shrink: 0;
      color: var(--color-primary);
    }
  }

  /* The card carries its own radius; square off the edge that now meets the
     strip above, so the two read as one object rather than two stacked ones. */
  :deep(.truck-card) {
    border-radius: 0 0 var(--radius-lg) var(--radius-lg);
  }
}
</style>
