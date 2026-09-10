<script setup lang="ts">
import { buildHomeFaq } from '~/utils/faqContent'
import { buildSiteIdentitySchema } from '~/utils/schemaOrg'
import { buildHomeParagraphs, buildHomeSeo } from '~/utils/seoContent'

const { t, locale } = useI18n()

useSeoMetaData({
  ...buildHomeSeo(locale.value, t('site.tagline')),
  path: '/',
})

// One graph, one script — Organization and WebSite were two separate blocks
// and a consumer reading only the first saw half the identity. See
// buildSiteIdentitySchema. This is the only page that may emit it.
useJsonLd([buildSiteIdentitySchema()])

const faqItems = computed(() => buildHomeFaq(locale.value))
const seoParagraphs = computed(() => buildHomeParagraphs(locale.value))
</script>

<template>
  <div>
    <HeroSection />

    <!-- Immediately under the hero: someone landing on the homepage with a
         broken car should not have to pick a marz first. The hero's own search
         stays where it is — this is the shortcut for visitors who do not know
         which city they are technically in. -->
    <div class="container home-page__nearest">
      <NearestTowTrucksCta />
    </div>

    <PopularLocations />
    <RegionsSection />
    <HowItWorksSection />
    <BenefitsSection />
    <FeaturedTowTrucksSection />

    <div class="container">
      <FaqSection :items="faqItems" class="home-page__section" />
      <SeoTextSection
        :title="t('home.seoTitle')"
        :paragraphs="seoParagraphs"
        class="home-page__section"
      />
    </div>
  </div>
</template>

<style scoped lang="scss">
.home-page__section {
  margin-top: var(--space-6);
  margin-bottom: var(--space-6);
}

.home-page__nearest {
  margin-top: var(--space-6);
}
</style>
