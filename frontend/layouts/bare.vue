<script setup lang="ts">
/**
 * A page with no chrome around it — no header, no footer, no floating call
 * button. Used by `/links`, the link-in-bio page.
 *
 * ## Why a layout and not `layout: false`
 *
 * `layout: false` would drop `CookieConsentBanner` too, and that is not
 * decoration. `app.vue` counts a site visit on mount for EVERY route, this one
 * included, so a page rendered without the banner would be a page that
 * measures its visitors while giving them nothing to answer — and this is the
 * page an Instagram bio sends people to, so it is the first thing many of them
 * will ever load from this domain. The banner is the only part of the chrome
 * that is not there to help someone navigate.
 *
 * Everything else is deliberately gone. A link-in-bio page exists to offer
 * six destinations; a site header offering eight more is the one thing that
 * can make it fail at that.
 */
</script>

<template>
  <div class="bare">
    <slot />
    <CookieConsentBanner />
  </div>
</template>

<style scoped lang="scss">
.bare {
  min-height: 100dvh;
}
</style>
