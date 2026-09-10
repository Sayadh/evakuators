<script setup lang="ts">
import { getRegionCities } from '~/utils/geography'
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

const { t, locale } = useI18n()
const placeName = usePlaceName()
const plural = usePlural()

/** The marz's own name, in the language being read */
const regionName = computed(() => placeName('region', regionSlug, region.value?.name ?? ''))

const faqItems = buildRegionFaq(region.value.name, locale.value, regionSlug)
const seoParagraphs = [buildTranslitParagraph(region.value.name, regionSlug, locale.value)]

/**
 * The marz blurb under the heading.
 *
 * Armenian keeps the hand-written sentence from `data/regions.ts`. The other
 * two are composed from the marz's own towns rather than hand-written twenty
 * more times — the Armenian original is that same list in a sentence, so
 * composing it keeps all three saying the same thing when a town is added.
 */
const regionDescription = computed(() => {
  if (locale.value === 'hy') return region.value?.description ?? ''

  const towns = getRegionCities(regionSlug)
    .slice(0, 3)
    .map((city) => placeName('city', city.slug, city.name))
    .join(', ')

  return t('page.regionDescription', { place: regionName.value, towns })
})

useSeoMetaData({
  ...buildRegionSeo(region.value.name, regionSlug, locale.value),
  path: getRegionRoute(regionSlug),
})
</script>

<template>
  <div v-if="region" class="container region-page">
    <AppBreadcrumbs :items="breadcrumbs" />

    <header class="region-page__header">
      <h1>{{ t('page.regionH1', { place: regionName }) }}</h1>
      <p class="region-page__description">{{ regionDescription }}</p>
      <div class="region-page__stats">
        <AppBadge variant="primary">
          <AppIcon name="map-pin" :size="14" /> {{ plural('card.cities', region.cityCount) }}
        </AppBadge>
        <AppBadge variant="accent">
          <AppIcon name="truck" :size="14" /> {{ plural('card.towTrucks', region.towTruckCount) }}
        </AppBadge>
      </div>
    </header>

    <NearestTowTrucksCta class="region-page__nearest" />

    <!-- Beside the «մոտակա» shortcut, both answering the same question a
         stranded visitor arrives with — "I don't know which one to pick".
         Above the listing but below the page heading on purpose: it must not
         be the first thing read on a page whose job is to show drivers. -->
    <DispatchCallCta variant="banner" class="region-page__dispatch" />

    <section aria-labelledby="cities-title" class="region-page__section">
      <h2 id="cities-title">{{ t('page.cities') }}</h2>
      <div v-if="citiesPending" class="card-grid">
        <LoadingSkeleton variant="card" :count="4" />
      </div>
      <div v-else class="card-grid">
        <CityCard v-for="city in cities" :key="city.id" :city="city" />
      </div>
    </section>

    <section aria-labelledby="region-trucks-title" class="region-page__section">
      <h2 id="region-trucks-title">
        {{ t('page.allInRegion', { count: towTrucks.length }) }}
      </h2>
      <TowTruckList :tow-trucks="towTrucks" :pending="towTrucksPending" :skeleton-count="6" />
    </section>

    <section v-if="nearbyRegions.length > 0" class="region-page__section">
      <h2>{{ t('page.otherRegions') }}</h2>
      <ul class="region-page__nearby">
        <li v-for="nearby in nearbyRegions" :key="nearby.slug">
          <NuxtLinkLocale :to="getRegionRoute(nearby.slug)" class="region-page__nearby-link">
            <AppIcon name="map-pin" :size="14" /> {{ placeName('region', nearby.slug, nearby.name) }}
          </NuxtLinkLocale>
        </li>
      </ul>
    </section>

    <FaqSection :items="faqItems" class="region-page__section" />

    <SeoTextSection
      :title="t('page.seoRegionTitle', { place: regionName })"
      :paragraphs="seoParagraphs"
      class="region-page__section"
    />

    <SpecialVehicleCrossLinks
      :region-slug="region.slug"
      :area-label="t('page.inRegion', { place: regionName })"
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

  &__nearest {
    margin-bottom: var(--space-2);
  }

  &__dispatch {
    margin-top: var(--space-5);
    margin-bottom: var(--space-5);
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
