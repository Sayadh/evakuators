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
    <!-- Three ways in, in the order someone with a stopped car needs them:
         a person now (hero buttons), their area in one tap (cards), and the
         two specialist trucks the area listings deliberately leave out. The
         FAQ and the SEO text stay last — they are what search engines read,
         and nobody in a hurry has to scroll past them to reach a driver. -->
    <HeroSection />
    <RegionsSection />
    <SpecialVehiclesSection />

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
</style>
