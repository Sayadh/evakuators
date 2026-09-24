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
      <!--
        The key is explicit because Nuxt's default one can come back
        `undefined`, and an unkeyed page is a page Vue is allowed to patch
        into the next one instead of replacing it.

        What that looked like: a driver logs in, `login.vue` calls
        `navigateTo('/dashboard')`, and the dashboard renders INSIDE the login
        page's root `<div>` — the element is reused, its children are swapped
        for the dashboard's, and its static `class` and scope id are not
        repatched. The browser then lays the whole dashboard out with
        `.login-page { display: flex }`: four blocks side by side, and it stays
        that way until a reload.

        Nuxt derives the key from `route.matched.find(m => m.components
        ?.default === Component.type)` (`generateRouteKey`). On a route whose
        component is still resolving when the navigation happens — a lazily
        loaded, client-only page reached BY navigating, which is exactly
        `/dashboard` — that lookup misses, the key is `undefined`, and
        `RouteProvider` is rendered with no key at all.

        It only ever showed up after a login, so it was invisible to anyone
        already holding a session and constant for anyone signing in fresh.

        `route.path`, not `fullPath`: the listing pages keep their filters in
        the query string, and keying on those would throw the page away on
        every filter change.
      -->
      <NuxtPage :page-key="(route) => route.path" />
    </NuxtLayout>
  </div>
</template>
