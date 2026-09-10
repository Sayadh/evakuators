<script setup lang="ts">
/**
 * "Someone opened the site" — the admin panel's top-line number.
 *
 * Here rather than in a layout or a plugin because this component mounts
 * exactly once per page session, for every route, including ones that opt out
 * of the default layout. onMounted, not setup: a visit is a real browser
 * opening the site, so SSR renders and crawler fetches must never count.
 *
 * Deduplicated twice over — once per session in the composable, and once per
 * visitor per Armenia calendar day in Postgres (see docs/analytics.md) — so
 * this counts people, not page loads.
 */
const { trackSiteVisit } = useAnalyticsTracking()

onMounted(trackSiteVisit)

/**
 * `<html lang>` follows the locale being rendered.
 *
 * Here rather than in a page or a layout, for the same reason the visit
 * counter is: this component renders for every route, including ones that opt
 * out of the default layout, so no page can be served without it.
 *
 * It is not cosmetic. A Russian page announcing `lang="hy"` tells a screen
 * reader to pronounce Russian with Armenian phonetics, tells the browser to
 * hyphenate by Armenian rules, and tells a search engine that the page's
 * language and its `hreflang` entry disagree — which is enough for the
 * alternate set to be ignored, and the alternate set is the whole point of
 * having three versions.
 */
const { locale } = useI18n()

useHead({
  htmlAttrs: computed(() => ({ lang: locale.value })),
})
</script>

<template>
  <div>
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </div>
</template>
