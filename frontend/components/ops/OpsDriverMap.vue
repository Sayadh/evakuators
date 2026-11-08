<script setup lang="ts">
/**
 * A schematic, tile-free map of driver positions for the dispatch console.
 *
 * Deliberately NOT an embedded Google/OSM map yet: this codebase has no map
 * SDK, its CSP allows no tile host, and choosing one is a product + privacy +
 * billing decision (docs/live-dispatch/07-admin-console.md § "Map"). Until
 * then this answers the operator's real question — who is where, and how
 * fresh is that — and every point opens the exact spot in Google Maps.
 *
 * A stale fix is drawn HOLLOW and grey, never like a fresh one.
 */
import { computed, ref } from 'vue'
import type { OpsMapDriver } from '~/types/opsDispatch'
import { availabilitySummary, formatAge } from '~/utils/opsDispatchLabels'

const props = defineProps<{
  drivers: OpsMapDriver[]
  gpsMaxAgeSeconds: number
  pickup?: { latitude: number; longitude: number } | null
  selectedId?: number | null
}>()
const emit = defineEmits<{ select: [towTruckId: number]; viewport: [bbox: string | null] }>()

const VIEWS = {
  armenia: { minLat: 38.8, maxLat: 41.35, minLng: 43.4, maxLng: 46.7, label: 'Ամբողջ Հայաստան' },
  yerevan: { minLat: 40.06, maxLat: 40.27, minLng: 44.38, maxLng: 44.66, label: 'Երևան' },
} as const
const view = ref<keyof typeof VIEWS>('armenia')
const W = 640
const H = 420

const box = computed(() => VIEWS[view.value])

function project(lat: number, lng: number): { x: number; y: number } {
  const b = box.value
  return {
    x: ((lng - b.minLng) / (b.maxLng - b.minLng)) * W,
    y: H - ((lat - b.minLat) / (b.maxLat - b.minLat)) * H,
  }
}

const points = computed(() =>
  props.drivers
    .filter((d) => d.position)
    .map((d) => {
      const { x, y } = project(d.position!.latitude, d.position!.longitude)
      const fresh = d.availability.gps === 'FRESH'
      const tone = d.availability.eligible ? 'free' : d.availability.occupancy === 'ON_ORDER' ? 'busy' : d.availability.occupancy === 'RESERVED' ? 'reserved' : 'off'
      return { d, x, y, fresh, tone }
    })
    .filter((p) => p.x >= -10 && p.x <= W + 10 && p.y >= -10 && p.y <= H + 10),
)

const pickupPoint = computed(() => (props.pickup ? project(props.pickup.latitude, props.pickup.longitude) : null))

function setView(next: keyof typeof VIEWS) {
  view.value = next
  const b = VIEWS[next]
  emit('viewport', next === 'armenia' ? null : `${b.minLat},${b.minLng},${b.maxLat},${b.maxLng}`)
}

function mapsLink(d: OpsMapDriver): string {
  return `https://maps.google.com/?q=${d.position!.latitude},${d.position!.longitude}`
}
</script>

<template>
  <div class="ops-map">
    <div class="ops-map__toolbar">
      <button v-for="(v, key) in VIEWS" :key="key" type="button" class="ops-map__view" :class="{ 'ops-map__view--active': view === key }" @click="setView(key)">
        {{ v.label }}
      </button>
      <span class="ops-map__legend">
        <i class="dot dot--free" /> ազատ <i class="dot dot--reserved" /> առաջարկ <i class="dot dot--busy" /> պատվերով
        <i class="dot dot--off" /> անհասանելի <i class="dot dot--stale" /> GPS &gt; {{ Math.round(gpsMaxAgeSeconds / 60) }} ր
      </span>
    </div>
    <svg :viewBox="`0 0 ${W} ${H}`" class="ops-map__svg" role="img" aria-label="Վարորդների դիրքերի սխեմատիկ քարտեզ">
      <rect x="0" y="0" :width="W" :height="H" class="ops-map__bg" />
      <g v-for="p in points" :key="p.d.towTruckId" class="ops-map__point" @click="emit('select', p.d.towTruckId)">
        <circle
          :cx="p.x"
          :cy="p.y"
          :r="selectedId === p.d.towTruckId ? 8 : 5"
          :class="[p.fresh ? `dot--${p.tone}` : 'dot--stale', { 'is-selected': selectedId === p.d.towTruckId }]"
        />
        <title>
          {{ p.d.driverName }} · {{ availabilitySummary(p.d.availability).text }} · GPS {{ formatAge(p.d.availability.gpsAgeSeconds) }}
        </title>
      </g>
      <g v-if="pickupPoint" class="ops-map__pickup">
        <path :d="`M ${pickupPoint.x} ${pickupPoint.y} l -7 -16 a 8 8 0 1 1 14 0 z`" />
      </g>
    </svg>
    <p class="ops-map__note">
      Սխեմատիկ պատկեր՝ առանց ճանապարհների։ Ճշգրիտ կետը բացելու համար ընտրեք վարորդին ցուցակում ու սեղմեք «Google Maps»։
    </p>
    <ul v-if="selectedId" class="ops-map__selected">
      <li v-for="d in drivers.filter((x) => x.towTruckId === selectedId && x.position)" :key="d.towTruckId">
        <a :href="mapsLink(d)" target="_blank" rel="noopener">Google Maps</a>
      </li>
    </ul>
  </div>
</template>

<style scoped lang="scss">
.ops-map {
  &__toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    align-items: center;
    margin-bottom: var(--space-2);
  }
  &__view {
    border: 1px solid var(--color-border);
    background: var(--color-surface);
    border-radius: var(--radius-full);
    padding: 4px 12px;
    cursor: pointer;
    &--active {
      background: var(--color-primary);
      color: #fff;
    }
  }
  &__legend {
    font-size: 0.8rem;
    color: var(--color-text-secondary);
    display: inline-flex;
    gap: 6px;
    align-items: center;
    flex-wrap: wrap;
  }
  &__svg {
    width: 100%;
    height: auto;
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border);
  }
  &__bg {
    fill: #eef2f7;
  }
  &__point {
    cursor: pointer;
  }
  &__pickup path {
    fill: var(--color-danger);
    stroke: #fff;
    stroke-width: 1.5;
  }
  &__note {
    font-size: 0.8rem;
    color: var(--color-text-muted);
    margin: var(--space-1) 0 0;
  }
}
.dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
}
.dot--free {
  fill: var(--color-success);
  background: var(--color-success);
}
.dot--reserved {
  fill: var(--color-primary-light);
  background: var(--color-primary-light);
}
.dot--busy {
  fill: var(--color-accent);
  background: var(--color-accent);
}
.dot--off {
  fill: var(--color-text-muted);
  background: var(--color-text-muted);
}
.dot--stale {
  fill: none;
  stroke: var(--color-text-muted);
  stroke-width: 2;
  stroke-dasharray: 2 2;
  background: transparent;
  border: 2px dashed var(--color-text-muted);
}
.is-selected {
  stroke: var(--color-text);
  stroke-width: 2;
}
</style>
