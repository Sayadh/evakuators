<script setup lang="ts">
import type { VehicleTypePage } from '~/constants/vehicleTypePages'
import { getRegisterRoute, getRegionsRoute } from '~/utils/routeHelpers'
import { buildTowTruckListSchema } from '~/utils/schemaOrg'

/**
 * The whole of `/manipulator` and `/tsanr-tehnika`: a heading and the drivers.
 *
 * Both pages are the same page with different words, so they are one component
 * driven by a `VehicleTypePage` config rather than two files that will drift.
 * The page files exist only to say which config — Nuxt routes by filename, and
 * the two slugs are unrelated words, so a single dynamic route would have to
 * sit at the root and swallow every other top-level URL.
 *
 * ## Deliberately not the city page
 *
 * No filter sidebar, no sort control, no active-filter chips, no "find the
 * nearest" banner, no explanatory prose. Someone who lands here has already
 * said what they need — the URL IS the filter — and every control on top of
 * that is one more thing between them and a phone number. The city pages keep
 * all of it because "everyone who covers this town" is a set worth narrowing;
 * "every manipulator in the country" is already the answer.
 *
 * A consequence worth knowing: this page has no `v-if="isDesktop"` child and no
 * grid, so it sidesteps the SSR auto-placement trap the city pages have to pin
 * around (docs/architecture.md). If a sidebar ever comes back here, that rule
 * comes back with it.
 */
const props = defineProps<{ page: VehicleTypePage }>()

useSeoMetaData({
  title: props.page.title,
  // On-page prose was removed; this is the only place the description is used
  // now, and it is what search results show under the title.
  description: props.page.description,
  path: `/${props.page.slug}`,
})

const { data: towTrucks, pending } = await useTowTrucksByVehicleType(props.page.vehicleType)

/**
 * The one control that survives, and it is not a filter — it is how the list
 * stays a reasonable length on a phone. Nothing is hidden by it that scrolling
 * does not reveal.
 */
const { visibleItems, hasMore, loadMore } = usePagination(towTrucks, 9)

const { forVehicleType } = useBreadcrumbs()
const breadcrumbs = computed(() => forVehicleType(props.page))

// Invisible, so it is not part of what was stripped: the ItemList is how the
// listing is legible to a crawler at all now that the prose is gone.
useJsonLd([buildTowTruckListSchema(towTrucks.value, props.page.heading)])
</script>

<template>
  <div class="container vehicle-type-page">
    <AppBreadcrumbs :items="breadcrumbs" />

    <h1 class="vehicle-type-page__heading">{{ page.heading }}</h1>

    <TowTruckList :tow-trucks="visibleItems" :pending="pending">
      <template #empty>
        <EmptyState
          :title="`Դեռ գրանցված ${page.heading.toLowerCase()} չկա`"
          description="Կարող եք դիտել բոլոր էվակուատորները մարզերի էջից կամ գրանցել ձերը։"
        >
          <template #actions>
            <AppButton :to="getRegionsRoute()" variant="primary">Դիտել մարզերը</AppButton>
            <AppButton :to="getRegisterRoute()" variant="accent">Գրանցել էվակուատոր</AppButton>
          </template>
        </EmptyState>
      </template>
    </TowTruckList>

    <div v-if="hasMore" class="vehicle-type-page__more">
      <AppButton variant="outline" @click="loadMore">Ցուցադրել ավելին</AppButton>
    </div>
  </div>
</template>

<style scoped lang="scss">
.vehicle-type-page {
  padding-block: var(--space-5) var(--space-8);

  &__heading {
    margin: 0 0 var(--space-5);
  }

  &__more {
    display: flex;
    justify-content: center;
    margin-top: var(--space-5);
  }
}
</style>
