<script setup lang="ts">
import { buildRegionFaq } from '~/utils/faqContent'
import { getRegionRoute } from '~/utils/routeHelpers'
import { buildRegionSeo, buildTranslitParagraph } from '~/utils/seoContent'

const route = useRoute()
const regionSlug = route.params.region as string

const { data: region } = await useRegion(regionSlug)

if (!region.value) {
  throw createError({ statusCode: 404, statusMessage: 'Մարզը չի գտնվել', fatal: true })
}

const { data: cities, pending: citiesPending } = useCitiesByRegion(regionSlug)
const { data: towTrucks, pending: towTrucksPending } = useTowTrucksByRegion(regionSlug)
const { data: nearbyRegions } = useNearbyRegions(regionSlug)

const { forRegion } = useBreadcrumbs()
const breadcrumbs = forRegion(region.value)

const faqItems = buildRegionFaq(region.value.name)
const seoParagraphs = [buildTranslitParagraph(region.value.name, regionSlug)]

useSeoMetaData({
  ...buildRegionSeo(region.value.name, regionSlug),
  path: getRegionRoute(regionSlug),
})
</script>

<template>
  <div v-if="region" class="container region-page">
    <AppBreadcrumbs :items="breadcrumbs" />

    <header class="region-page__header">
      <h1>Էվակուատորներ {{ region.name }}ի մարզում</h1>
      <p class="region-page__description">{{ region.description }}</p>
      <div class="region-page__stats">
        <AppBadge variant="primary">
          <AppIcon name="map-pin" :size="14" /> {{ region.cityCount }} քաղաք
        </AppBadge>
        <AppBadge variant="accent">
          <AppIcon name="truck" :size="14" /> {{ region.towTruckCount }} էվակուատոր
        </AppBadge>
      </div>
    </header>

    <section aria-labelledby="cities-title" class="region-page__section">
      <h2 id="cities-title">Քաղաքներ</h2>
      <div v-if="citiesPending" class="card-grid">
        <LoadingSkeleton variant="card" :count="4" />
      </div>
      <div v-else class="card-grid">
        <CityCard v-for="city in cities" :key="city.id" :city="city" />
      </div>
    </section>

    <section aria-labelledby="region-trucks-title" class="region-page__section">
      <h2 id="region-trucks-title">
        Բոլոր էվակուատորները մարզում ({{ towTrucks.length }})
      </h2>
      <TowTruckList :tow-trucks="towTrucks" :pending="towTrucksPending" :skeleton-count="6" />
    </section>

    <section v-if="nearbyRegions.length > 0" class="region-page__section">
      <h2>Այլ մարզեր</h2>
      <ul class="region-page__nearby">
        <li v-for="nearby in nearbyRegions" :key="nearby.slug">
          <NuxtLink :to="getRegionRoute(nearby.slug)" class="region-page__nearby-link">
            <AppIcon name="map-pin" :size="14" /> {{ nearby.name }}
          </NuxtLink>
        </li>
      </ul>
    </section>

    <FaqSection :items="faqItems" class="region-page__section" />

    <SeoTextSection
      :title="`Էվակուատորի ծառայություններ ${region.name}ի մարզում`"
      :paragraphs="seoParagraphs"
      class="region-page__section"
    />
  </div>
</template>

<style scoped lang="scss">
.region-page {
  padding-bottom: var(--space-6);

  &__header {
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
}
</style>
