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
</script>

<template>
  <div>
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </div>
</template>
