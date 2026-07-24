<script setup lang="ts">
import { buildCityFaq } from '~/utils/faqContent'
import { getCityRoute, getRegisterRoute } from '~/utils/routeHelpers'
import { buildTowTruckListSchema } from '~/utils/schemaOrg'
import { buildLocationSeo, buildTranslitParagraph } from '~/utils/seoContent'

const route = useRoute()
const regionSlug = route.params.region as string
const citySlug = route.params.city as string

const { data: city } = await useCity(regionSlug, citySlug)

if (!city.value) {
  throw createError({ statusCode: 404, statusMessage: 'Քաղաքը չի գտնվել', fatal: true })
}

const { data: towTrucks, pending } = await useTowTrucksByCity(citySlug)
const { data: nearbyCities } = useNearbyCities(regionSlug, citySlug)

const { filteredTowTrucks, activeFiltersCount } = useTowTruckFilters(towTrucks)
const { visibleItems, hasMore, loadMore } = usePagination(filteredTowTrucks, 9)
const { isDesktop, isDrawerOpen, openDrawer } = useResponsiveFilters()

const { forCity } = useBreadcrumbs()
const breadcrumbs = forCity(city.value)

const faqItems = buildCityFaq(city.value.name)

const seoParagraphs = [
  `Էվակուատոր ${city.value.name}ում. այս էջում հավաքված են ${city.value.name}ում և հարակից բնակավայրերում աշխատող էվակուատորները։ Յուրաքանչյուր վարորդի էջում կտեսնեք մեքենայի իրական նկարները, ծառայությունների ցանկը, սպասարկվող տարածքները և մեկնարկային գները։`,
  `Ընտրեք հարմար էվակուատորը ֆիլտրերի օգնությամբ՝ ըստ բեռնատարողության, 24/7 հասանելիության կամ ծառայության տեսակի, և զանգահարեք վարորդին անմիջապես՝ առանց միջնորդների։ ${city.value.regionName}ի մարզի մյուս քաղաքների ծառայությունները հասանելի են ներքևի հղումներով։`,
  buildTranslitParagraph(city.value.name, citySlug),
]

useSeoMetaData({
  ...buildLocationSeo(city.value.name, citySlug),
  path: getCityRoute(regionSlug, citySlug),
})

useJsonLd([buildTowTruckListSchema(towTrucks.value, `Էվակուատորներ ${city.value.name}ում`)])
</script>

<template>
  <div v-if="city" class="container city-page">
    <AppBreadcrumbs :items="breadcrumbs" />

    <header class="city-page__header">
      <h1>Էվակուատորներ {{ city.name }}ում</h1>
      <p class="city-page__description">
        Գտեք {{ city.name }}ում և հարակից բնակավայրերում աշխատող էվակուատորներ։ Դիտեք մեքենաների
        նկարները, ծառայությունների տեսակները և անմիջապես զանգահարեք վարորդին։
      </p>
      <div class="city-page__stats">
        <AppBadge variant="primary">
          <AppIcon name="truck" :size="14" /> {{ city.towTruckCount }} հասանելի էվակուատոր
        </AppBadge>
        <AppBadge variant="success">
          <AppIcon name="clock" :size="14" /> {{ city.towTruck24hCount }} աշխատում է 24/7
        </AppBadge>
      </div>
    </header>

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
              title="Այս քաղաքում դեռ գրանցված էվակուատոր չկա"
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

    <FaqSection :items="faqItems" class="city-page__section" />

    <SeoTextSection
      :title="`Էվակուատորի ծառայություններ ${city.name}ում`"
      :paragraphs="seoParagraphs"
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
