<script setup lang="ts">
import { SITE_NAME } from '~/constants/site'
import type { ServiceZone } from '~/types/location'
import { buildCityFaq } from '~/utils/faqContent'
import { findStaticRegion, findStaticServiceZone } from '~/utils/geography'
import { isLandingSettlement } from '~/utils/locationSearch'
import { findSettlement, findSettlementTargetCity } from '~/utils/settlements'
import { getCityRoute, getRegisterRoute } from '~/utils/routeHelpers'
import { buildTowTruckListSchema } from '~/utils/schemaOrg'
import { buildLocationSeo, buildTranslitParagraph } from '~/utils/seoContent'

/**
 * One route, two kinds of area: `/regions/:region/:slug` resolves to a city or
 * to one of the marz's road corridors (see `data/serviceZones.ts`).
 *
 * They share a file rather than getting a second route because they share the
 * URL shape, the listing, the filters and the breadcrumb trail — and because
 * two page files cannot match one Nuxt pattern anyway. City and zone slugs live
 * in one namespace and are checked not to collide, so the resolution is
 * unambiguous.
 */
const route = useRoute()
const regionSlug = route.params.region as string
const citySlug = route.params.city as string

const zone = findStaticServiceZone(citySlug)
const region = findStaticRegion(regionSlug)
/** A corridor is only valid under its own marz — kotayk/tatev-halidzor is a 404 */
const isZone = Boolean(zone && region && zone.regionId === region.id)

/**
 * Third case: a settlement with its own page. Only `seoMode: 'landing'`
 * settlements reach here — the ones that redirect are answered with a 301 by
 * `server/middleware/settlement-redirect.ts` before rendering starts, and the
 * 276 with no routing fields have no URL of their own at all.
 */
const settlement = isZone ? undefined : findSettlement(regionSlug, citySlug)
const landing = settlement && isLandingSettlement(settlement) ? settlement : undefined
const landingCity = landing ? findSettlementTargetCity(landing) : undefined
const isLanding = Boolean(landing && landingCity)

const { data: city } = await useCity(regionSlug, citySlug)

if (!isZone && !isLanding && !city.value) {
  throw createError({ statusCode: 404, statusMessage: 'Տարածքը չի գտնվել', fatal: true })
}

// Three sources, one shape. A corridor matches its own slug exactly (see
// servesZone); a landing settlement deliberately reuses its target CITY's
// drivers — there is no settlement-level coverage field and none is being
// invented, so the honest answer is "the drivers who work the nearest town".
const { data: towTrucks, pending } = isZone
  ? await useTowTrucksByZone(citySlug)
  : isLanding
    ? await useTowTrucksByCity(landingCity!.slug)
    : await useTowTrucksByCity(citySlug)
const { data: nearbyCities } = useNearbyCities(regionSlug, citySlug)

const { t, locale } = useI18n()
const plural = usePlural()
const placeName = usePlaceName()

/**
 * What the heading, breadcrumb and metadata call this page.
 *
 * A landing settlement keeps its Armenian name in every language — see
 * `i18n/placeNames.ts` § "What this does NOT translate" — so only the city
 * and zone branches go through the place map.
 */
const areaName = computed(() =>
  isZone
    ? placeName('zone', (zone as ServiceZone).slug, (zone as ServiceZone).name)
    : isLanding
      ? landing!.name
      : placeName('city', citySlug, city.value?.name ?? ''),
)

/**
 * A landing page with no drivers is a thin page: it would rank for a village
 * name and then show an empty list. `noindex, follow` keeps it reachable and
 * lets its links be crawled, while asking not to be listed until it has
 * something to list. The sitemap applies the same rule (see sitemap.xml.ts).
 */
const landingHasDrivers = computed(() => towTrucks.value.length > 0)

/**
 * Armenian takes a different case ending for a place and for a corridor, so the
 * suffix cannot be one shared string. Computed rather than inlined in the
 * template because `city` is null on a zone page — reading `city.name` there
 * was an SSR crash, not a blank heading.
 */
const seoSectionTitle = computed(() =>
  isZone
    ? t('page.seoZoneTitle', { place: areaName.value })
    : isLanding
      ? landing!.seo!.heading
      : t('districtPage.seoTitle', { place: areaName.value }),
)

/**
 * The place THIS listing's drivers are for, so `useTowTruckFilters` can boost
 * whoever is actually based there. A corridor has no base-place concept (see
 * `BasePlace`) — nobody is "based on" a road — so it gets no boost, exactly as
 * before. A landing settlement reuses its target city's drivers (see above),
 * so its base place is that city's slug, not the settlement's own.
 */
const basePlace = computed(() =>
  isZone ? undefined : { citySlug: isLanding ? landingCity!.slug : citySlug },
)

const { filteredTowTrucks, activeFiltersCount } = useTowTruckFilters(towTrucks, basePlace)
const { visibleItems, hasMore, loadMore } = usePagination(filteredTowTrucks, 9)
const { isDesktop, isDrawerOpen, openDrawer } = useResponsiveFilters()

const { forCity, forServiceZone } = useBreadcrumbs()
// A landing settlement sits under its marz like everything else at this depth.
const breadcrumbs =
  isZone || isLanding
    ? forServiceZone(region!.name, region!.slug, areaName.value)
    : forCity(city.value!)

// A corridor has no settlements of its own, so the city FAQ — which is written
// about a town and the places around it — would be answering questions nobody
// asked here. `areaName` is already localized (see above), so it is passed
// with no slug — buildCityFaq would otherwise look a CITY slug up a second
// time and, for a landing settlement, find nothing at all.
const faqItems = computed(() =>
  isZone || isLanding ? [] : buildCityFaq(areaName.value, locale.value),
)

/** The marz this page belongs to, in the language being read */
const cityRegionName = computed(() =>
  city.value
    ? placeName('region', city.value.regionSlug, city.value.regionName)
    : region
      ? placeName('region', region.slug, region.name)
      : '',
)

const seoParagraphs = computed(() => {
  if (isLanding) return [landing!.seo!.intro]

  if (isZone) {
    return [
      t('page.zoneIntro1', { place: areaName.value }),
      t('page.zoneIntro2', { place: areaName.value, region: cityRegionName.value }),
    ]
  }

  return [
    t('page.cityIntro', { place: areaName.value }),
    t('page.cityFilterHint', { region: cityRegionName.value }),
    buildTranslitParagraph(areaName.value, citySlug, locale.value),
  ]
})

useSeoMetaData(
  isLanding
    ? {
        // Straight from the dataset — one authored title/description per
        // landing settlement, not a template with a name substituted in.
        // Armenian only, by design — see `i18n/placeNames.ts`.
        title: landing!.seo!.title,
        description: landing!.seo!.description,
        // Self-referencing: this page is its own canonical, and the hash-free
        // city URL it borrows drivers from is a different page.
        path: getCityRoute(regionSlug, citySlug),
        // Thin until it has drivers to show — see landingHasDrivers.
        noindex: !landingHasDrivers.value,
      }
    : isZone
      ? {
          title: `${t('page.metaZoneTitle', { place: areaName.value })} | ${SITE_NAME}`,
          description: t('page.metaZoneDescription', {
            place: areaName.value,
            region: cityRegionName.value,
          }),
          path: getCityRoute(regionSlug, citySlug),
        }
      : {
          ...buildLocationSeo(areaName.value, citySlug, locale.value),
          path: getCityRoute(regionSlug, citySlug),
        },
)

useJsonLd([
  buildTowTruckListSchema(
    towTrucks.value,
    isZone
      ? t('page.zoneListingTitle', { place: areaName.value })
      : t('districtPage.listingTitle', { place: areaName.value }),
  ),
])
</script>

<template>
  <div v-if="isZone || isLanding || city" class="container city-page">
    <AppBreadcrumbs :items="breadcrumbs" />

    <header class="city-page__header">
      <h1 v-if="isLanding">{{ landing!.seo!.heading }}</h1>
      <h1 v-else-if="isZone">{{ t('page.zoneH1', { place: areaName }) }}</h1>
      <h1 v-else>{{ t('districtPage.h1', { place: areaName }) }}</h1>
      <p v-if="isLanding" class="city-page__description">
        {{ landing!.seo!.intro }}
      </p>
      <p v-else-if="isZone" class="city-page__description">
        {{ t('page.zoneDescription', { place: areaName }) }}
      </p>
      <div v-if="city" class="city-page__stats">
        <AppBadge variant="primary">
          <AppIcon name="truck" :size="14" /> {{ plural('card.towTrucks', city.towTruckCount) }}
        </AppBadge>
        <AppBadge variant="success">
          <AppIcon name="clock" :size="14" /> {{ plural('card.open24', city.towTruck24hCount) }}
        </AppBadge>
      </div>
      <div v-else class="city-page__stats">
        <AppBadge variant="primary">
          <AppIcon name="truck" :size="14" /> {{ plural('card.towTrucks', towTrucks.length) }}
        </AppBadge>
      </div>
    </header>

    <NearestTowTrucksCta class="city-page__nearest" />

    <!-- Beside the «մոտակա» shortcut, both answering the same question a
         stranded visitor arrives with — "I don't know which one to pick".
         Above the listing but below the page heading on purpose: it must not
         be the first thing read on a page whose job is to show drivers. -->
    <DispatchCallCta variant="banner" class="city-page__dispatch" />

    <div class="city-page__toolbar">
      <AppButton v-if="!isDesktop" variant="outline" size="sm" @click="openDrawer">
        <AppIcon name="filter" :size="16" />
        {{ t('common.filters') }}
        <span v-if="activeFiltersCount > 0" class="city-page__filter-count">
          {{ activeFiltersCount }}
        </span>
      </AppButton>
      <TowTruckSort />
    </div>

    <ActiveFilters class="city-page__active-filters" />

    <div class="city-page__layout">
      <aside v-if="isDesktop" class="city-page__sidebar" :aria-label="t('common.filters')">
        <TowTruckFilters />
      </aside>

      <div class="city-page__results">
        <TowTruckList :tow-trucks="visibleItems" :pending="pending">
          <template #empty>
            <EmptyState
              v-if="towTrucks.length === 0"
              :title="isZone ? t('page.emptyZoneTitle') : t('page.emptyCityTitle')"
              :description="t('page.emptyCityText')"
            >
              <template #actions>
                <AppButton
                  v-if="nearbyCities.length > 0"
                  :to="getCityRoute(nearbyCities[0]!.regionSlug, nearbyCities[0]!.slug)"
                  variant="primary"
                >
                  {{ t('common.viewNearbyCities') }}
                </AppButton>
                <AppButton :to="getRegisterRoute()" variant="accent">
                  {{ t('common.registerTruck') }}
                </AppButton>
              </template>
            </EmptyState>
            <EmptyState
              v-else
              :title="t('common.emptyFilteredTitle')"
              :description="t('common.emptyFilteredText')"
              icon="filter"
            />
          </template>
        </TowTruckList>

        <div v-if="hasMore" class="city-page__more">
          <AppButton variant="outline" @click="loadMore">{{ t('common.showMore') }}</AppButton>
        </div>
      </div>
    </div>

    <MobileFilterDrawer v-model="isDrawerOpen" :results-count="filteredTowTrucks.length" />

    <section v-if="nearbyCities.length > 0" class="city-page__section">
      <h2>{{ t('page.nearbyCities') }}</h2>
      <ul class="city-page__nearby">
        <li v-for="nearby in nearbyCities" :key="nearby.id">
          <NuxtLinkLocale
            :to="getCityRoute(nearby.regionSlug, nearby.slug)"
            class="city-page__nearby-link"
          >
            <AppIcon name="map-pin" :size="14" />
            {{ placeName('city', nearby.slug, nearby.name) }}
            <span class="city-page__nearby-count">({{ nearby.towTruckCount }})</span>
          </NuxtLinkLocale>
        </li>
      </ul>
    </section>

    <!-- Skipped for a corridor: an empty FaqSection would still render its
         heading and, worse, emit an FAQPage JSON-LD with no questions. -->
    <FaqSection v-if="faqItems.length > 0" :items="faqItems" class="city-page__section" />

    <SeoTextSection
      :title="seoSectionTitle"
      :paragraphs="seoParagraphs"
      class="city-page__section"
    />

    <!-- The listing above deliberately excludes cranes and heavy-duty trucks
         (docs/taxonomies.md), so this is the only place a visitor who needs one
         learns they exist. Links to the marz-level page, not the country one —
         it is the closer answer. -->
    <SpecialVehicleCrossLinks
      :region-slug="regionSlug"
      :area-label="region?.name ? t('page.inRegion', { place: cityRegionName }) : undefined"
      class="city-page__section"
    />
  </div>
</template>

<style scoped lang="scss">
.city-page {
  padding-bottom: var(--space-6);

  &__header {
    margin-bottom: var(--space-4);
  }

  &__nearest {
    margin-bottom: var(--space-4);
  }

  &__dispatch {
    margin-top: var(--space-5);
    margin-bottom: var(--space-5);
  }

  &__description {
    color: var(--color-text-secondary);
    max-width: 680px;
  }

  &__stats {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  &__toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    margin-bottom: var(--space-3);
  }

  &__filter-count {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 20px;
    height: 20px;
    padding: 0 5px;
    border-radius: var(--radius-full);
    background: var(--color-accent);
    color: var(--color-primary-dark);
    font-size: 0.75rem;
    font-weight: 800;
  }

  &__active-filters {
    margin-bottom: var(--space-4);
  }

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
    background: var(--color-surface);
    border-radius: var(--radius-lg);
    padding: var(--space-4);
    box-shadow: var(--shadow-sm);
  }

  /**
   * Pinned to the second column so the sidebar's absence cannot move it.
   *
   * `<aside v-if="isDesktop">` is necessarily false in the server-rendered HTML
   * and on the first client render: `useMediaQuery` cannot know the viewport
   * until there is a browser. Without this rule the results div is then the
   * grid's ONLY child, so auto-placement drops it into column one — a 300px
   * box containing a three-column card grid, i.e. ~90px cards — and it stays
   * that way for as long as hydration takes. Placing it explicitly makes the
   * server HTML already correct; the sidebar simply appears beside it later.
   */
  &__results {
    @media (min-width: 1024px) {
      grid-column: 2;
    }
  }

  /* With the sidebar the results area is narrower — 2 columns keep cards readable */
  &__results :deep(.card-grid) {
    @media (min-width: 1024px) {
      grid-template-columns: repeat(2, 1fr);
    }

    @media (min-width: 1440px) {
      grid-template-columns: repeat(3, 1fr);
    }
  }

  &__more {
    display: flex;
    justify-content: center;
    margin-top: var(--space-5);
  }

  &__section {
    margin-top: var(--space-6);
  }

  &__nearby {
    list-style: none;
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  &__nearby-link {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    padding: var(--space-2) var(--space-3);
    background: var(--color-surface);
    border-radius: var(--radius-full);
    font-weight: 600;
    font-size: 0.9rem;
    box-shadow: var(--shadow-sm);

    svg {
      color: var(--color-text-muted);
    }
  }

  &__nearby-count {
    color: var(--color-text-muted);
    font-weight: 400;
  }
}
</style>
