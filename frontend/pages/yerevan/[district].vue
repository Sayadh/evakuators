<script setup lang="ts">
import { buildCityFaq } from '~/utils/faqContent'
import { getDistrictRoute, getRegisterRoute } from '~/utils/routeHelpers'
import { buildTowTruckListSchema } from '~/utils/schemaOrg'
import { buildLocationSeo, buildTranslitParagraph } from '~/utils/seoContent'

const route = useRoute()
const districtSlug = route.params.district as string

const { data: district } = await useDistrict(districtSlug)

if (!district.value) {
  throw createError({ statusCode: 404, statusMessage: 'Շրջանը չի գտնվել', fatal: true })
}

const { data: towTrucks, pending } = await useTowTrucksByDistrict(districtSlug)
const { data: nearbyDistricts } = useNearbyDistricts(districtSlug)

const { filteredTowTrucks, activeFiltersCount } = useTowTruckFilters(towTrucks, {
  districtSlug,
})
const { visibleItems, hasMore, loadMore } = usePagination(filteredTowTrucks, 9)
const { isDesktop, isDrawerOpen, openDrawer } = useResponsiveFilters()

const { forDistrict } = useBreadcrumbs()
const breadcrumbs = forDistrict(district.value)

const { t, locale } = useI18n()
const plural = usePlural()
const placeName = usePlaceName()

/** The district's own name, in the language being read */
const districtName = computed(() => placeName('district', districtSlug, district.value?.name ?? ''))

// `buildCityFaq` looks a slug up in the CITY name map, so a district slug
// passed straight through would silently miss and fall back to Armenian.
// The name is translated here instead, and handed over with no slug.
const faqItems = computed(() => buildCityFaq(districtName.value, locale.value))

const seoParagraphs = computed(() => [
  t('districtPage.intro', { place: districtName.value }),
  buildTranslitParagraph(district.value!.name, districtSlug, locale.value, 'district'),
])

useSeoMetaData({
  ...buildLocationSeo(district.value.name, districtSlug, locale.value, 'district'),
  path: getDistrictRoute(districtSlug),
})

useJsonLd([
  buildTowTruckListSchema(
    towTrucks.value,
    t('districtPage.listingTitle', { place: districtName.value }),
  ),
])
</script>

<template>
  <div v-if="district" class="container district-page">
    <AppBreadcrumbs :items="breadcrumbs" />

    <header class="district-page__header">
      <h1>{{ t('districtPage.h1', { place: districtName }) }}</h1>
      <div class="district-page__stats">
        <AppBadge variant="primary">
          <AppIcon name="truck" :size="14" /> {{ plural('card.towTrucks', district.towTruckCount) }}
        </AppBadge>
        <AppBadge variant="success">
          <AppIcon name="clock" :size="14" /> {{ plural('card.open24', district.towTruck24hCount) }}
        </AppBadge>
      </div>
    </header>

    <NearestTowTrucksCta class="district-page__nearest" />

    <!-- Beside the «մոտակա» shortcut, both answering the same question a
         stranded visitor arrives with — "I don't know which one to pick".
         Above the listing but below the page heading on purpose: it must not
         be the first thing read on a page whose job is to show drivers. -->
    <DispatchCallCta variant="banner" class="district-page__dispatch" />

    <div class="district-page__toolbar">
      <AppButton v-if="!isDesktop" variant="outline" size="sm" @click="openDrawer">
        <AppIcon name="filter" :size="16" />
        {{ t('common.filters') }}
        <span v-if="activeFiltersCount > 0" class="district-page__filter-count">
          {{ activeFiltersCount }}
        </span>
      </AppButton>
      <TowTruckSort />
    </div>

    <ActiveFilters class="district-page__active-filters" />

    <div class="district-page__layout">
      <aside v-if="isDesktop" class="district-page__sidebar" :aria-label="t('common.filters')">
        <TowTruckFilters />
      </aside>

      <div class="district-page__results">
        <TowTruckList :tow-trucks="visibleItems" :pending="pending">
          <template #empty>
            <EmptyState
              v-if="towTrucks.length === 0"
              :title="t('page.emptyDistrictTitle')"
              :description="t('page.emptyDistrictText')"
            >
              <template #actions>
                <AppButton
                  v-if="nearbyDistricts.length > 0"
                  :to="getDistrictRoute(nearbyDistricts[0]!.slug)"
                  variant="primary"
                >
                  {{ t('common.viewNearbyDistricts') }}
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

        <div v-if="hasMore" class="district-page__more">
          <AppButton variant="outline" @click="loadMore">{{ t('common.showMore') }}</AppButton>
        </div>
      </div>
    </div>

    <MobileFilterDrawer v-model="isDrawerOpen" :results-count="filteredTowTrucks.length" />

    <section v-if="nearbyDistricts.length > 0" class="district-page__section">
      <h2>{{ t('page.nearbyDistricts') }}</h2>
      <ul class="district-page__nearby">
        <li v-for="nearby in nearbyDistricts" :key="nearby.id">
          <NuxtLinkLocale :to="getDistrictRoute(nearby.slug)" class="district-page__nearby-link">
            <AppIcon name="map-pin" :size="14" />
            {{ placeName('district', nearby.slug, nearby.name) }}
            <span class="district-page__nearby-count">({{ nearby.towTruckCount }})</span>
          </NuxtLinkLocale>
        </li>
      </ul>
    </section>

    <FaqSection :items="faqItems" class="district-page__section" />

    <SeoTextSection
      :title="t('districtPage.seoTitle', { place: districtName })"
      :paragraphs="seoParagraphs"
      class="district-page__section"
    />

    <!-- `yerevan` rather than a district slug: the vehicle-type pages split by
         marz, and Yerevan is one area there (there is no
         `/manipulator/ajapnyak`). See VEHICLE_TYPE_GEOS for why the split is
         that coarse. -->
    <SpecialVehicleCrossLinks
      region-slug="yerevan"
      :area-label="t('districtPage.inYerevan')"
      class="district-page__section"
    />
  </div>
</template>

<style scoped lang="scss">
.district-page {
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
   * Pinned to the second column so the sidebar's absence cannot move it — the
   * same rule, and the same reason, as on the city page: `isDesktop` is false
   * in the server-rendered HTML, and an unplaced lone child lands in the 300px
   * sidebar column, squeezing the cards to ~90px until hydration runs.
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
