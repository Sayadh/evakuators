<script setup lang="ts">
import type { VehicleTypeGeo, VehicleTypePage } from '~/constants/vehicleTypePages'
import {
  countryLocative,
  localizedVehicleTypeGeo,
  localizedVehicleTypePage,
} from '~/i18n/vehicleTypeCopy'
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

const { t, locale } = useI18n()

/**
 * Everything below reads these two rather than the props.
 *
 * The route decides WHICH page this is; the language decides what it says. So
 * the config is translated once, here, and the heading, the metadata, the
 * schema, the breadcrumb, the body copy and the FAQ are all built from the
 * translated object — there is no second place where a Russian page could keep
 * an Armenian word. `hy` gets the original object back untouched.
 */
const localPage = computed(() => localizedVehicleTypePage(props.page, locale.value))
const localGeo = computed(() =>
  props.geo ? localizedVehicleTypeGeo(props.geo, locale.value) : undefined,
)

const heading = computed(() =>
  buildVehicleTypeHeading(localPage.value, localGeo.value, locale.value),
)
const seo = computed(() => buildVehicleTypeSeo(localPage.value, localGeo.value, locale.value))
const seoParagraphs = computed(() =>
  buildVehicleTypeParagraphs(localPage.value, localGeo.value, locale.value),
)
const seoTitle = computed(() =>
  buildVehicleTypeSeoTitle(localPage.value, localGeo.value, locale.value),
)

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

/**
 * The empty state names both halves of the question the visitor asked — what
 * they wanted and where — because "nothing found" on a page reached from an
 * ad is otherwise indistinguishable from a broken page.
 */
const emptyTitle = computed(() =>
  t('vehicleType.emptyTitle', {
    what: localPage.value.heading.toLowerCase(),
    place: localGeo.value ? localGeo.value.locative : countryLocative(locale.value),
  }),
)

const { forVehicleType, forVehicleTypeGeo } = useBreadcrumbs()
const breadcrumbs = computed(() =>
  localGeo.value
    ? forVehicleTypeGeo(localPage.value, localGeo.value)
    : forVehicleType(localPage.value),
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
  buildVehicleTypeServiceSchema(localPage.value, localGeo.value, locale.value),
])
</script>

<template>
  <div class="container vehicle-type-page">
    <AppBreadcrumbs :items="breadcrumbs" />

    <h1 class="vehicle-type-page__heading">{{ heading }}</h1>

    <TowTruckList :tow-trucks="visibleItems" :pending="pending">
      <template #empty>
        <EmptyState
          :title="emptyTitle"
          :description="t('vehicleType.emptyText')"
        >
          <template #actions>
            <AppButton :to="getRegionsRoute()" variant="primary">
              {{ t('common.viewRegions') }}
            </AppButton>
            <AppButton :to="getRegisterRoute()" variant="accent">
              {{ t('common.registerTruck') }}
            </AppButton>
          </template>
        </EmptyState>
      </template>
    </TowTruckList>

    <div v-if="hasMore" class="vehicle-type-page__more">
      <AppButton variant="outline" @click="loadMore">{{ t('common.showMore') }}</AppButton>
    </div>

    <!-- Everything from here down is for search and for the visitor who did
         not find what they wanted in the cards. It is all AFTER the drivers,
         on purpose — see the component comment. -->
    <VehicleTypeGeoLinks
      :page="localPage"
      :current="localGeo"
      class="vehicle-type-page__geo-links"
    />

    <SeoTextSection
      :title="seoTitle"
      :paragraphs="seoParagraphs"
      class="vehicle-type-page__seo"
    />

    <FaqSection :items="localPage.faq" class="vehicle-type-page__faq" />
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
