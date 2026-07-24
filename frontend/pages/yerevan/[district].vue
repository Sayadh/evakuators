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

const { filteredTowTrucks, activeFiltersCount } = useTowTruckFilters(towTrucks)
const { visibleItems, hasMore, loadMore } = usePagination(filteredTowTrucks, 9)
const { isDesktop, isDrawerOpen, openDrawer } = useResponsiveFilters()

const { forDistrict } = useBreadcrumbs()
const breadcrumbs = forDistrict(district.value)

const faqItems = buildCityFaq(district.value.name)

const seoParagraphs = [
  `Էվակուատոր Երևանի ${district.value.name} վարչական շրջանում. դիտեք տարածքը սպասարկող բոլոր էվակուատորները, մեքենաների նկարները, գներն ու ծառայությունները և զանգահարեք վարորդին ուղիղ՝ առանց միջնորդների։`,
  buildTranslitParagraph(district.value.name, districtSlug),
]

useSeoMetaData({
  ...buildLocationSeo(district.value.name, districtSlug),
  path: getDistrictRoute(districtSlug),
})

useJsonLd([
  buildTowTruckListSchema(towTrucks.value, `Էվակուատորներ ${district.value.name}ում`),
])
</script>

<template>
  <div v-if="district" class="container district-page">
    <AppBreadcrumbs :items="breadcrumbs" />

    <header class="district-page__header">
      <h1>Էվակուատորներ {{ district.name }}ում</h1>
      <p class="district-page__description">
        Գտեք Երևանի {{ district.name }} վարչական շրջանում աշխատող էվակուատորներ։ Դիտեք մեքենաների
        նկարները, ծառայությունները և անմիջապես զանգահարեք վարորդին։
      </p>
      <div class="district-page__stats">
        <AppBadge variant="primary">
          <AppIcon name="truck" :size="14" /> {{ district.towTruckCount }} հասանելի էվակուատոր
        </AppBadge>
        <AppBadge variant="success">
          <AppIcon name="clock" :size="14" /> {{ district.towTruck24hCount }} աշխատում է 24/7
        </AppBadge>
      </div>
    </header>

    <div class="district-page__toolbar">
      <AppButton v-if="!isDesktop" variant="outline" size="sm" @click="openDrawer">
        <AppIcon name="filter" :size="16" />
        Ֆիլտրեր
        <span v-if="activeFiltersCount > 0" class="district-page__filter-count">
          {{ activeFiltersCount }}
        </span>
      </AppButton>
      <TowTruckSort />
    </div>

    <ActiveFilters class="district-page__active-filters" />

    <div class="district-page__layout">
      <aside v-if="isDesktop" class="district-page__sidebar" aria-label="Ֆիլտրեր">
        <TowTruckFilters />
      </aside>

      <div class="district-page__results">
        <TowTruckList :tow-trucks="visibleItems" :pending="pending">
          <template #empty>
            <EmptyState
              v-if="towTrucks.length === 0"
              title="Այս շրջանում դեռ գրանցված էվակուատոր չկա"
              description="Կարող եք դիտել մոտակա շրջաններում աշխատող ծառայությունները կամ գրանցել ձեր էվակուատորը։"
            >
              <template #actions>
                <AppButton
                  v-if="nearbyDistricts.length > 0"
                  :to="getDistrictRoute(nearbyDistricts[0]!.slug)"
                  variant="primary"
                >
                  Դիտել մոտակա շրջանները
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

        <div v-if="hasMore" class="district-page__more">
          <AppButton variant="outline" @click="loadMore">Ցուցադրել ավելին</AppButton>
        </div>
      </div>
    </div>

    <MobileFilterDrawer v-model="isDrawerOpen" :results-count="filteredTowTrucks.length" />

    <section v-if="nearbyDistricts.length > 0" class="district-page__section">
      <h2>Մոտակա շրջաններ</h2>
      <ul class="district-page__nearby">
        <li v-for="nearby in nearbyDistricts" :key="nearby.id">
          <NuxtLink :to="getDistrictRoute(nearby.slug)" class="district-page__nearby-link">
            <AppIcon name="map-pin" :size="14" />
            {{ nearby.name }}
            <span class="district-page__nearby-count">({{ nearby.towTruckCount }})</span>
          </NuxtLink>
        </li>
      </ul>
    </section>

    <FaqSection :items="faqItems" class="district-page__section" />

    <SeoTextSection
      :title="`Էվակուատորի ծառայություններ ${district.name}ում`"
      :paragraphs="seoParagraphs"
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
