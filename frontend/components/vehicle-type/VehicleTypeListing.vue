<script setup lang="ts">
import type { VehicleTypePage } from '~/constants/vehicleTypePages'
import { VehicleType } from '~/types/enums'
import { getRegisterRoute, getRegionsRoute } from '~/utils/routeHelpers'
import { buildTowTruckListSchema } from '~/utils/schemaOrg'

/**
 * The whole of `/manipulator` and `/tsanr-tehnika`.
 *
 * Both pages are the same page with different words, so they are one component
 * driven by a `VehicleTypePage` config rather than two files that will drift.
 * The page files exist only to say which config — Nuxt routes by filename, and
 * the two slugs are unrelated words, so a single dynamic route would have to
 * sit at the root and swallow every other top-level URL.
 *
 * Structurally this is the city page minus the geography: same card list, same
 * filter sidebar, same pagination, same sort. That is deliberate — a visitor
 * who has used one listing already knows this one, and the pieces are shared
 * rather than reimplemented.
 */
const props = defineProps<{ page: VehicleTypePage }>()

useSeoMetaData({
  title: props.page.title,
  description: props.page.description,
  path: `/${props.page.slug}`,
})

const { data: towTrucks, pending } = await useTowTrucksByVehicleType(props.page.vehicleType)

/**
 * No `basePlace` argument: this list is not about a place, so "drivers based
 * here first" has nothing to mean and rating alone decides. See
 * `sortTowTrucks`.
 */
const { filteredTowTrucks, activeFiltersCount } = useTowTruckFilters(towTrucks)
const { visibleItems, hasMore, loadMore } = usePagination(filteredTowTrucks, 9)
const { isDesktop, isDrawerOpen, openDrawer } = useResponsiveFilters()

const { forVehicleType } = useBreadcrumbs()
const breadcrumbs = computed(() => forVehicleType(props.page))

/**
 * The «Մանիպուլյատոր» checkbox is hidden on the manipulator page: every result
 * already matches it, so it is a control that cannot change anything. Left
 * visible it reads as broken — you tick it, nothing moves.
 */
const hideManipulatorFilter = computed(() => props.page.vehicleType === VehicleType.Manipulator)

useJsonLd([buildTowTruckListSchema(towTrucks.value, props.page.heading)])
</script>

<template>
  <div class="container vehicle-type-page">
    <AppBreadcrumbs :items="breadcrumbs" />

    <header class="vehicle-type-page__header">
      <h1>{{ page.heading }}</h1>
      <p class="vehicle-type-page__description">{{ page.description }}</p>
      <div class="vehicle-type-page__stats">
        <AppBadge variant="primary">
          <AppIcon name="truck" :size="14" /> {{ towTrucks.length }} հասանելի էվակուատոր
        </AppBadge>
      </div>
    </header>

    <NearestTowTrucksCta class="vehicle-type-page__nearest" />

    <div class="vehicle-type-page__toolbar">
      <AppButton v-if="!isDesktop" variant="outline" size="sm" @click="openDrawer">
        <AppIcon name="filter" :size="16" />
        Ֆիլտրեր
        <span v-if="activeFiltersCount > 0" class="vehicle-type-page__filter-count">
          {{ activeFiltersCount }}
        </span>
      </AppButton>
      <TowTruckSort />
    </div>

    <ActiveFilters class="vehicle-type-page__active-filters" />

    <div class="vehicle-type-page__layout">
      <aside v-if="isDesktop" class="vehicle-type-page__sidebar" aria-label="Ֆիլտրեր">
        <TowTruckFilters :hide-manipulator="hideManipulatorFilter" />
      </aside>

      <div class="vehicle-type-page__results">
        <TowTruckList :tow-trucks="visibleItems" :pending="pending">
          <template #empty>
            <EmptyState
              v-if="towTrucks.length === 0"
              :title="`Դեռ գրանցված ${page.heading.toLowerCase()} չկա`"
              description="Կարող եք դիտել բոլոր էվակուատորները մարզերի էջից կամ գրանցել ձերը։"
            >
              <template #actions>
                <AppButton :to="getRegionsRoute()" variant="primary">Դիտել մարզերը</AppButton>
                <AppButton :to="getRegisterRoute()" variant="accent">Գրանցել էվակուատոր</AppButton>
              </template>
            </EmptyState>
            <EmptyState
              v-else
              title="Ֆիլտրերին համապատասխանող էվակուատոր չկա"
              description="Փորձեք մեղմել ֆիլտրերը կամ մաքրել դրանք։"
              icon="filter"
            />
          </template>
        </TowTruckList>

        <div v-if="hasMore" class="vehicle-type-page__more">
          <AppButton variant="outline" @click="loadMore">Ցուցադրել ավելին</AppButton>
        </div>
      </div>
    </div>

    <!-- Below the listing, not above it: someone who arrived from a search for
         this exact vehicle wants the drivers first. The prose is for the
         visitor who is not sure this is what they need, and for the crawler. -->
    <section class="vehicle-type-page__seo">
      <h2>{{ page.heading }} — ինչ պետք է իմանալ</h2>
      <p v-for="(paragraph, index) in page.intro" :key="index">{{ paragraph }}</p>
    </section>

    <FaqSection :items="page.faq" />

    <MobileFilterDrawer
      v-model="isDrawerOpen"
      :results-count="filteredTowTrucks.length"
      :hide-manipulator="hideManipulatorFilter"
    />
  </div>
</template>

<style scoped lang="scss">
.vehicle-type-page {
  padding-block: var(--space-5) var(--space-8);

  &__header {
    margin-bottom: var(--space-5);

    h1 {
      margin: 0 0 var(--space-2);
    }
  }

  &__description {
    margin: 0 0 var(--space-3);
    max-width: 70ch;
    color: var(--color-text-secondary);
    line-height: 1.6;
  }

  &__stats {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  &__nearest {
    margin-bottom: var(--space-5);
  }

  &__toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    margin-bottom: var(--space-3);
  }

  &__filter-count {
    margin-inline-start: var(--space-1);
    font-weight: 700;
  }

  &__active-filters {
    margin-bottom: var(--space-4);
  }

  /* Single column until there is room for a sidebar that does not squeeze the
     cards — same breakpoint and same track sizes as the city page, so the two
     listings behave identically as the window changes. */
  &__layout {
    display: grid;
    grid-template-columns: 1fr;
    gap: var(--space-5);

    @media (min-width: 1024px) {
      grid-template-columns: 300px 1fr;
      align-items: start;
    }
  }

  &__sidebar {
    position: sticky;
    top: calc(var(--header-height) + var(--space-4));
  }

  /**
   * Pinned, not auto-placed. The sidebar next to it is `v-if="isDesktop"`, and
   * `isDesktop` is false on the server and on the first paint before hydration
   * — so the server-rendered HTML has exactly one child in this grid. Left to
   * auto-placement that child lands in the FIRST track, the 300px column meant
   * for the sidebar, and the cards render as a ~90px strip until hydration
   * mounts the real sidebar. See docs/architecture.md § "A CSS grid with a
   * viewport-conditional child is an SSR bug waiting to happen".
   */
  &__results {
    @media (min-width: 1024px) {
      grid-column: 2;
    }
  }

  &__more {
    display: flex;
    justify-content: center;
    margin-top: var(--space-5);
  }

  &__seo {
    margin-top: var(--space-7);
    max-width: 75ch;

    h2 {
      margin: 0 0 var(--space-3);
    }

    p {
      margin: 0 0 var(--space-3);
      line-height: 1.7;
      color: var(--color-text-secondary);
    }
  }
}
</style>
