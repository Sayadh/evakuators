<script setup lang="ts">
import { buildHomeFaq } from '~/utils/faqContent'
import { buildOrganizationSchema, buildWebsiteSchema } from '~/utils/schemaOrg'
import { buildHomeParagraphs, buildHomeSeo } from '~/utils/seoContent'

useSeoMetaData({
  ...buildHomeSeo(),
  path: '/',
})

useJsonLd([buildOrganizationSchema(), buildWebsiteSchema()])

const faqItems = buildHomeFaq()
const seoParagraphs = buildHomeParagraphs()
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
        title="Էվակուատորի ծառայություններ ամբողջ Հայաստանում"
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
