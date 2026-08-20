<script setup lang="ts">
import type { VehicleTypeGeo, VehicleTypePage } from '~/constants/vehicleTypePages'
import { VEHICLE_TYPE_GEOS } from '~/constants/vehicleTypePages'
import { getVehicleTypeGeoRoute, getVehicleTypePageRoute } from '~/utils/routeHelpers'

/**
 * The link hub between a vehicle-type page and its eleven areas.
 *
 * ## Why this is SEO work and not decoration
 *
 * A URL that nothing links to is a URL Google reaches only through the sitemap,
 * and a sitemap entry is a *hint* — internal links are what actually pass
 * authority and establish that these eleven pages are one set about one
 * service. Without this block, `/manipulator/kotayk` would be an orphan with a
 * crawl priority near zero, which is the usual reason a technically-correct
 * set of landing pages never ranks.
 *
 * ## It is a `<nav>` of plain links, not a picker
 *
 * No select, no client-side filtering, no JS. A crawler has to see eleven
 * `<a href>`s in the server-rendered HTML, and a visitor gets a real
 * back button. It also means the block works identically on the country page
 * (eleven links out) and on a geo page (ten siblings plus the way back up),
 * which is what keeps the set fully connected rather than a star with no rim.
 *
 * ## Where it sits
 *
 * Below the cards, with the rest of the prose. The rule these pages are built
 * on is that nothing comes between the visitor and a phone number — see
 * `docs/pages-and-routes.md` — and a row of eleven place names above the
 * drivers is exactly that.
 */
const props = defineProps<{
  page: VehicleTypePage
  /** The area currently being viewed, if this is a geo page */
  current?: VehicleTypeGeo
}>()

const title = computed(() => `${props.page.heading} ըստ մարզերի`)

/**
 * Every area except the one already open — a link to the page you are on is a
 * self-reference that dilutes the block and confuses nobody usefully.
 */
const geos = computed(() =>
  VEHICLE_TYPE_GEOS.filter((geo) => geo.slug !== props.current?.slug),
)
</script>

<template>
  <nav class="geo-links" :aria-label="title">
    <h2 class="geo-links__title">{{ title }}</h2>

    <ul class="geo-links__list">
      <!-- On a geo page this is the way back to the country-wide list. It
           leads rather than trails the marzes: it is the parent of this page,
           and it is the one link here that changes the *scope* rather than the
           place. -->
      <li v-if="current">
        <NuxtLink :to="getVehicleTypePageRoute(page.slug)" class="geo-links__link">
          Ամբողջ Հայաստանում
        </NuxtLink>
      </li>
      <li v-for="geo in geos" :key="geo.slug">
        <NuxtLink :to="getVehicleTypeGeoRoute(page.slug, geo.slug)" class="geo-links__link">
          {{ page.navLabel }} {{ geo.locative }}
        </NuxtLink>
      </li>
    </ul>
  </nav>
</template>

<style scoped lang="scss">
.geo-links {
  &__title {
    font-size: 1.2rem;
    margin-bottom: var(--space-4);
  }

  &__list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  &__link {
    display: inline-flex;
    align-items: center;
    padding: var(--space-2) var(--space-4);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-full);
    background: var(--color-surface);
    color: var(--color-text);
    font-size: 0.9rem;
    font-weight: 600;
    text-decoration: none;
    transition:
      border-color var(--transition),
      color var(--transition);

    &:hover,
    &:focus-visible {
      border-color: var(--color-primary);
      color: var(--color-primary);
    }
  }
}
</style>
