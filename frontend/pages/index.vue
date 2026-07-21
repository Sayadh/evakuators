<script setup lang="ts">
import { buildWebsiteSchema } from '~/utils/schemaOrg'
import { buildHomeSeo } from '~/utils/seoContent'

useSeoMetaData({
  ...buildHomeSeo(),
  path: '/',
})

useJsonLd([buildWebsiteSchema()])
</script>

<template>
  <div>
    <HeroSection />
    <PopularLocations />
    <RegionsSection />
    <HowItWorksSection />
    <BenefitsSection />
    <FeaturedTowTrucksSection />
  </div>
</template>
