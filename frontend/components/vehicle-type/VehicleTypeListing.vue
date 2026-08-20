<script setup lang="ts">
import type { VehicleTypeGeo, VehicleTypePage } from '~/constants/vehicleTypePages'
import { getRegisterRoute, getRegionsRoute, getVehicleTypePageRoute } from '~/utils/routeHelpers'
import { buildTowTruckListSchema, buildVehicleTypeServiceSchema } from '~/utils/schemaOrg'
import {
  buildVehicleTypeHeading,
  buildVehicleTypeParagraphs,
  buildVehicleTypeSeo,
  buildVehicleTypeSeoTitle,
} from '~/utils/vehicleTypeSeo'

/**
 * `/manipulator`, `/tsanr-tehnika` and their eleven area pages each.
 *
 * Both vehicle types and all twelve scopes are the same page with different
 * words, so they are one component driven by a `VehicleTypePage` config and an
 * optional `VehicleTypeGeo`, rather than twenty-two files that will drift. The
 * page files exist only to say which config — Nuxt routes by filename, and the
 * two slugs are unrelated words, so a single dynamic route would have to sit at
 * the root and swallow every other top-level URL.
 *
 * ## Deliberately not the city page — above the fold
 *
 * No filter sidebar, no sort control, no active-filter chips, no "find the
 * nearest" banner, no intro prose. Someone who lands here has already said what
 * they need — the URL IS the filter — and every control on top of that is one
 * more thing between them and a phone number. The city pages keep all of it
 * because "everyone who covers this town" is a set worth narrowing; "every
 * manipulator in Kotayk" is already the answer.
 *
 * ## Below the listing, that rule stops applying
 *
 * The FAQ, the body copy and the area links all live after the cards. The
 * original rule was written as "no prose", and the reasoning behind it was
 * about ORDER: nothing may delay the visitor who came to call someone. A page
 * whose only text is its `<h1>` is also thin content that cannot rank for the
 * query it exists to answer, so the copy is here — underneath, where it costs
 * that visitor nothing and earns the page its traffic. See
 * `utils/vehicleTypeSeo.ts` and `docs/pages-and-routes.md`.
 *
 * A consequence worth knowing: this page has no `v-if="isDesktop"` child and no
 * grid, so it sidesteps the SSR auto-placement trap the city pages have to pin
 * around (docs/architecture.md). If a sidebar ever comes back here, that rule
 * comes back with it.
 */
const props = defineProps<{
  page: VehicleTypePage
  /** Set on `/manipulator/kotayk` and friends; absent on the country page */
  geo?: VehicleTypeGeo
}>()

const heading = computed(() => buildVehicleTypeHeading(props.page, props.geo))
const seo = computed(() => buildVehicleTypeSeo(props.page, props.geo))
const seoParagraphs = computed(() => buildVehicleTypeParagraphs(props.page, props.geo))
const seoTitle = computed(() => buildVehicleTypeSeoTitle(props.page, props.geo))

const path = computed(() =>
  props.geo
    ? `${getVehicleTypePageRoute(props.page.slug)}/${props.geo.slug}`
    : getVehicleTypePageRoute(props.page.slug),
)

const { data: towTrucks, pending } = props.geo
  ? await useTowTrucksByVehicleTypeInGeo(props.page.vehicleType, props.geo)
  : await useTowTrucksByVehicleType(props.page.vehicleType)

/**
 * An area page with no drivers is a thin page: it would rank for «մանիպուլյատոր
 * Տավուշ» and then show an empty list. `noindex, follow` keeps it reachable
 * and lets its links be crawled, while asking not to be listed until it has
 * something to list — the same rule the landing settlements follow
 * (`pages/regions/[region]/[city].vue`), and the same one the sitemap applies.
 *
 * The country page is never noindexed. It is the parent of the set and the
 * page the nav links to; if it is empty the honest answer is an empty state on
 * an indexable page, not a hole in the site.
 */
const isThinAreaPage = computed(() => Boolean(props.geo) && towTrucks.value.length === 0)

useSeoMetaData({
  title: seo.value.title,
  description: seo.value.description,
  keywords: seo.value.keywords,
  path: path.value,
  noindex: isThinAreaPage.value,
})

/**
 * The one control that survives, and it is not a filter — it is how the list
 * stays a reasonable length on a phone. Nothing is hidden by it that scrolling
 * does not reveal.
 */
const { visibleItems, hasMore, loadMore } = usePagination(towTrucks, 9)

const { forVehicleType, forVehicleTypeGeo } = useBreadcrumbs()
const breadcrumbs = computed(() =>
  props.geo ? forVehicleTypeGeo(props.page, props.geo) : forVehicleType(props.page),
)

/**
 * Two nodes, and they answer different questions. `ItemList` is how the
 * listing is legible to a crawler at all; `Service` is what the page is
 * offering and where it is offered, which is what a local query is matched
 * against. The FAQ's own `FAQPage` is emitted by `FaqSection` from the same
 * array it renders.
 */
useJsonLd([
  buildTowTruckListSchema(towTrucks.value, heading.value),
  buildVehicleTypeServiceSchema(props.page, props.geo),
])
</script>

<template>
  <div class="container vehicle-type-page">
    <AppBreadcrumbs :items="breadcrumbs" />

    <h1 class="vehicle-type-page__heading">{{ heading }}</h1>

    <TowTruckList :tow-trucks="visibleItems" :pending="pending">
      <template #empty>
        <EmptyState
          :title="`Դեռ գրանցված ${page.heading.toLowerCase()} չկա ${geo ? geo.locative : 'Հայաստանում'}`"
          description="Կարող եք դիտել այլ մարզերի ցանկը կամ գրանցել ձերը։"
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

    <!-- Everything from here down is for search and for the visitor who did
         not find what they wanted in the cards. It is all AFTER the drivers,
         on purpose — see the component comment. -->
    <VehicleTypeGeoLinks :page="page" :current="geo" class="vehicle-type-page__geo-links" />

    <SeoTextSection
      :title="seoTitle"
      :paragraphs="seoParagraphs"
      class="vehicle-type-page__seo"
    />

    <FaqSection :items="page.faq" class="vehicle-type-page__faq" />
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

  &__geo-links,
  &__seo,
  &__faq {
    display: block;
    margin-top: var(--space-7);
  }
}
</style>
