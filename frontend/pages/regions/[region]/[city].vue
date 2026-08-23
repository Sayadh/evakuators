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

/** What the heading, breadcrumb and metadata call this page */
const areaName = computed(() =>
  isZone ? (zone as ServiceZone).name : isLanding ? landing!.name : (city.value?.name ?? ''),
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
    ? `Էվակուատորի ծառայություններ ${areaName.value} ուղղությունում`
    : isLanding
      ? landing!.seo!.heading
      : `Էվակուատորի ծառայություններ ${areaName.value}ում`,
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
// asked here.
const faqItems = isZone || isLanding ? [] : buildCityFaq(areaName.value)

const seoParagraphs = isLanding
  ? [landing!.seo!.intro]
  : isZone
  ? [
      `Էվակուատոր ${areaName.value} ուղղությունում. այս էջում հավաքված են այն վարորդները, ովքեր հայտարարել են, որ սպասարկում են հենց այս ճանապարհահատվածը։ Դիտեք մեքենաների նկարները, ծառայությունների ցանկը և մեկնարկային գները։`,
      `Ցանկը կազմված է ճշգրիտ համընկմամբ՝ այստեղ երևում են միայն «${areaName.value}» ուղղությունն ընտրած վարորդները։ ${region!.name}ի մարզի քաղաքների ծառայությունները հասանելի են առանձին էջերով։`,
    ]
  : [
      `Էվակուատոր ${areaName.value}ում. այս էջում հավաքված են ${areaName.value}ում և հարակից բնակավայրերում աշխատող էվակուատորները։ Յուրաքանչյուր վարորդի էջում կտեսնեք մեքենայի իրական նկարները, ծառայությունների ցանկը, սպասարկվող տարածքները և մեկնարկային գները։`,
      `Ընտրեք հարմար էվակուատորը ֆիլտրերի օգնությամբ՝ ըստ բեռնատարողության, 24/7 հասանելիության կամ ծառայության տեսակի, և զանգահարեք վարորդին անմիջապես՝ առանց միջնորդների։ ${city.value!.regionName}ի մարզի մյուս քաղաքների ծառայությունները հասանելի են ներքևի հղումներով։`,
      buildTranslitParagraph(areaName.value, citySlug),
    ]

useSeoMetaData(
  isLanding
    ? {
        // Straight from the dataset — one authored title/description per
        // landing settlement, not a template with a name substituted in.
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
        title: `Էվակուատոր ${areaName.value} ուղղությունում | ${SITE_NAME}`,
        description: `Էվակուատոր ${areaName.value} ճանապարհահատվածում՝ ${region!.name}ի մարզ։ Տեսեք այս ուղղությունը սպասարկող վարորդներին և զանգահարեք ուղիղ։`,
        path: getCityRoute(regionSlug, citySlug),
      }
    : {
        ...buildLocationSeo(areaName.value, citySlug),
        path: getCityRoute(regionSlug, citySlug),
      },
)

useJsonLd([
  buildTowTruckListSchema(
    towTrucks.value,
    isZone
      ? `Էվակուատորներ ${areaName.value} ուղղությունում`
      : `Էվակուատորներ ${areaName.value}ում`,
  ),
])
</script>

<template>
  <div v-if="isZone || isLanding || city" class="container city-page">
    <AppBreadcrumbs :items="breadcrumbs" />

    <header class="city-page__header">
      <h1 v-if="isLanding">{{ landing!.seo!.heading }}</h1>
      <h1 v-else>Էվակուատորներ {{ areaName }}{{ isZone ? ' ուղղությունում' : 'ում' }}</h1>
      <p v-if="isLanding" class="city-page__description">
        {{ landing!.seo!.intro }}
      </p>
      <p v-else-if="isZone" class="city-page__description">
        Այս ցանկում միայն այն վարորդներն են, ովքեր նշել են «{{ areaName }}» ուղղությունը որպես
        սպասարկվող տարածք։ Ցանկը չի ներառում ճանապարհին գտնվող առանձին բնակավայրերը՝ դրանք
        փնտրեք համապատասխան քաղաքի էջում։
      </p>
      <div v-if="city" class="city-page__stats">
        <AppBadge variant="primary">
          <AppIcon name="truck" :size="14" /> {{ city.towTruckCount }} հասանելի էվակուատոր
        </AppBadge>
        <AppBadge variant="success">
          <AppIcon name="clock" :size="14" /> {{ city.towTruck24hCount }} աշխատում է 24/7
        </AppBadge>
      </div>
      <div v-else class="city-page__stats">
        <AppBadge variant="primary">
          <AppIcon name="truck" :size="14" /> {{ towTrucks.length }} հասանելի էվակուատոր
        </AppBadge>
      </div>
    </header>

    <NearestTowTrucksCta class="city-page__nearest" />

    <div class="city-page__toolbar">
      <AppButton v-if="!isDesktop" variant="outline" size="sm" @click="openDrawer">
        <AppIcon name="filter" :size="16" />
        Ֆիլտրեր
        <span v-if="activeFiltersCount > 0" class="city-page__filter-count">
          {{ activeFiltersCount }}
        </span>
      </AppButton>
      <TowTruckSort />
    </div>

    <ActiveFilters class="city-page__active-filters" />

    <div class="city-page__layout">
      <aside v-if="isDesktop" class="city-page__sidebar" aria-label="Ֆիլտրեր">
        <TowTruckFilters />
      </aside>

      <div class="city-page__results">
        <TowTruckList :tow-trucks="visibleItems" :pending="pending">
          <template #empty>
            <EmptyState
              v-if="towTrucks.length === 0"
              :title="
                isZone
                  ? 'Այս ուղղությունը դեռ ոչ մի վարորդ չի նշել'
                  : 'Այս քաղաքում դեռ գրանցված էվակուատոր չկա'
              "
              description="Կարող եք դիտել մոտակա քաղաքներում աշխատող ծառայությունները կամ գրանցել ձեր էվակուատորը։"
            >
              <template #actions>
                <AppButton
                  v-if="nearbyCities.length > 0"
                  :to="getCityRoute(nearbyCities[0]!.regionSlug, nearbyCities[0]!.slug)"
                  variant="primary"
                >
                  Դիտել մոտակա քաղաքները
                </AppButton>
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

        <div v-if="hasMore" class="city-page__more">
          <AppButton variant="outline" @click="loadMore">Ցուցադրել ավելին</AppButton>
        </div>
      </div>
    </div>

    <MobileFilterDrawer v-model="isDrawerOpen" :results-count="filteredTowTrucks.length" />

    <section v-if="nearbyCities.length > 0" class="city-page__section">
      <h2>Մոտակա քաղաքներ</h2>
      <ul class="city-page__nearby">
        <li v-for="nearby in nearbyCities" :key="nearby.id">
          <NuxtLink
            :to="getCityRoute(nearby.regionSlug, nearby.slug)"
            class="city-page__nearby-link"
          >
            <AppIcon name="map-pin" :size="14" />
            {{ nearby.name }}
            <span class="city-page__nearby-count">({{ nearby.towTruckCount }})</span>
          </NuxtLink>
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
      :area-label="region?.name ? `${region.name}ի մարզում` : undefined"
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
