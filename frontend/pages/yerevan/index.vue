<script setup lang="ts">
import { buildYerevanFaq } from '~/utils/faqContent'
import {
  buildLocationSeo,
  buildTranslitParagraph,
  buildYerevanListingDescription,
  buildYerevanListingTitle,
  summarizeYerevanListing,
} from '~/utils/seoContent'

const { data: districts, pending } = useDistricts()
const { data: towTrucks, pending: towTrucksPending } = useTowTrucksInYerevan()
const { forYerevan } = useBreadcrumbs()

const { t, locale } = useI18n()
const plural = usePlural()

const seoParagraphs = computed(() => [
  t('yerevanPage.intro'),
  buildTranslitParagraph('Երևան', 'erevan', locale.value),
])

const locationSeo = buildLocationSeo('Երևան', 'erevan', locale.value)

useSeoMetaData({
  ...locationSeo,
  path: '/yerevan',
})

// Reactive because the listing is not awaited above: the server resolves it
// before the head is rendered, so the crawler gets the final title.
const listingTitle = computed(
  () =>
    buildYerevanListingTitle(
      towTrucks.value.map((truck) => truck.startingPrice),
      locale.value,
    ) ?? locationSeo.title,
)

const listingStats = computed(() => summarizeYerevanListing(towTrucks.value))
const listingDescription = computed(
  () => buildYerevanListingDescription(listingStats.value, locale.value) ?? locationSeo.description,
)

useSeoMeta({
  title: listingTitle,
  ogTitle: listingTitle,
  twitterTitle: listingTitle,
  description: listingDescription,
  ogDescription: listingDescription,
  twitterDescription: listingDescription,
})

const faqItems = computed(() => buildYerevanFaq(listingStats.value, locale.value))
</script>

<template>
  <div class="container yerevan-page">
    <AppBreadcrumbs :items="forYerevan()" />

    <header class="yerevan-page__header">
      <h1>{{ t('yerevanPage.h1') }}</h1>
      <div class="yerevan-page__stats">
        <AppBadge variant="primary">
          <AppIcon name="map-pin" :size="14" /> {{ t('yerevanPage.districtsBadge', { count: 12 }) }}
        </AppBadge>
        <AppBadge variant="accent">
          <AppIcon name="truck" :size="14" /> {{ plural('card.towTrucks', towTrucks.length) }}
        </AppBadge>
      </div>
    </header>

    <NearestTowTrucksCta with-routes class="yerevan-page__nearest" />

    <div v-if="pending" class="card-grid">
      <LoadingSkeleton variant="card" :count="12" />
    </div>
    <div v-else class="card-grid">
      <DistrictCard v-for="district in districts" :key="district.id" :district="district" />
    </div>

    <section aria-labelledby="yerevan-trucks-title" class="yerevan-page__section">
      <h2 id="yerevan-trucks-title">
        {{ t('yerevanPage.allTrucks', { count: towTrucks.length }) }}
      </h2>
      <TowTruckList :tow-trucks="towTrucks" :pending="towTrucksPending" :skeleton-count="6" />
    </section>

    <!-- Below the listing: it is for search, nobody in a hurry scrolls past it.
         Keyed by the count so its FAQPage JSON-LD follows the numbers it quotes. -->
    <FaqSection
      :key="listingStats.count"
      :items="faqItems"
      class="yerevan-page__section"
    />

    <SeoTextSection
      :title="t('yerevanPage.seoTitle')"
      :paragraphs="seoParagraphs"
      class="yerevan-page__section"
    />
  </div>
</template>

<style scoped lang="scss">
.yerevan-page {
  padding-bottom: var(--space-6);

  &__header {
    margin-bottom: var(--space-5);
  }

  &__nearest {
    margin-bottom: var(--space-5);
  }

  &__stats {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  &__section {
    margin-top: var(--space-6);
  }
}
</style>
