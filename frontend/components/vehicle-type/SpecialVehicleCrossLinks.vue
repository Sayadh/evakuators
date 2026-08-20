<script setup lang="ts">
import { VEHICLE_TYPE_PAGE_LIST, findVehicleTypeGeo } from '~/constants/vehicleTypePages'
import { getVehicleTypeGeoRoute, getVehicleTypePageRoute } from '~/utils/routeHelpers'

/**
 * "Do you need a crane, or something that can carry a bus?" — on a geography
 * page.
 *
 * ## Why it belongs on the city and district pages
 *
 * Since `manipulator` and `heavy-duty` became landing-page-only
 * (`docs/taxonomies.md`), the listing a visitor is looking at on
 * `/regions/kotayk/abovyan` genuinely does not contain those trucks. Someone
 * who arrived searching «էվակուատոր Աբովյան» but actually needs a crane sees a
 * list with no answer in it and no hint that the answer exists — a real dead
 * end that this feature created.
 *
 * ## Why it is also the internal-link plan
 *
 * These are the highest-authority pages on the site and there are ~70 of them;
 * the twenty-two vehicle-type URLs are new and have none. Links from here are
 * what stop the new set being orphans reachable only through the sitemap. That
 * the SEO argument and the usability argument point at the same block is why
 * it earns its place — a link block that only served the crawler would not.
 *
 * ## Why it links to the AREA page when it can
 *
 * From a Kotayk page, «Մանիպուլյատոր Կոտայքի մարզում» is a better destination
 * than the country-wide list: it is a shorter path to a phone number and it is
 * the topically closest link, which is what an internal link is worth
 * anything for. `regionSlug` is optional because the caller does not always
 * have one — a road-corridor page passes it, a Yerevan district passes
 * `'yerevan'`, and anything that cannot resolve an area falls back to the
 * country page rather than guessing.
 */
const props = defineProps<{
  /** Where the visitor is, as a `VehicleTypeGeo` slug — a marz or `'yerevan'` */
  regionSlug?: string
  /** «Կոտայքի մարզում» / «Երևանում», for the link text */
  areaLabel?: string
}>()

const geo = computed(() => (props.regionSlug ? findVehicleTypeGeo(props.regionSlug) : undefined))

const links = computed(() =>
  VEHICLE_TYPE_PAGE_LIST.map((page) => ({
    slug: page.slug,
    label: geo.value ? `${page.heading} ${geo.value.locative}` : page.heading,
    description: page.seo.serviceSummary,
    to: geo.value
      ? getVehicleTypeGeoRoute(page.slug, geo.value.slug)
      : getVehicleTypePageRoute(page.slug),
  })),
)

const title = computed(() =>
  props.areaLabel
    ? `Հատուկ տեխնիկա ${props.areaLabel}`
    : 'Ձեզ հատուկ տեխնիկա՞ է պետք',
)
</script>

<template>
  <section class="cross-links" :aria-label="title">
    <h2 class="cross-links__title">{{ title }}</h2>
    <!-- Stated plainly, because it is the thing the visitor cannot see: these
         two types are not in the list above, by design. -->
    <p class="cross-links__intro">
      Այս ցանկում սովորական էվակուատորներն են։ Կռունկով բարձրացում կամ ծանր տեխնիկայի տեղափոխում
      պետք լինելու դեպքում այդ վարորդներն առանձին էջերում են՝
    </p>

    <ul class="cross-links__list">
      <li v-for="link in links" :key="link.slug" class="cross-links__item">
        <NuxtLink :to="link.to" class="cross-links__link">{{ link.label }}</NuxtLink>
        <span class="cross-links__description">{{ link.description }}</span>
      </li>
    </ul>
  </section>
</template>

<style scoped lang="scss">
.cross-links {
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  padding: var(--space-5);

  &__title {
    font-size: 1.2rem;
    margin-bottom: var(--space-3);
  }

  &__intro {
    color: var(--color-text-secondary);
    font-size: 0.95rem;
    line-height: 1.7;
    margin-bottom: var(--space-4);
  }

  &__list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: var(--space-4);
  }

  &__item {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  &__link {
    font-weight: 700;
    color: var(--color-primary);
    text-decoration: none;

    &:hover,
    &:focus-visible {
      text-decoration: underline;
    }
  }

  &__description {
    color: var(--color-text-secondary);
    font-size: 0.9rem;
    line-height: 1.6;
  }
}
</style>
