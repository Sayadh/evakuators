<script setup lang="ts">
import { buildHomeFaq } from '~/utils/faqContent'
import { buildWebsiteSchema } from '~/utils/schemaOrg'
import { buildHomeParagraphs, buildHomeSeo } from '~/utils/seoContent'

useSeoMetaData({
  ...buildHomeSeo(),
  path: '/',
})

useJsonLd([buildWebsiteSchema()])

const faqItems = buildHomeFaq()
const seoParagraphs = buildHomeParagraphs()
</script>

<template>
  <div>
    <HeroSection />
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
</style>
