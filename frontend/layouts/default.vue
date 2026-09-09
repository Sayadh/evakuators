<script setup lang="ts">
import { useWindowScroll } from '@vueuse/core'
import { showsDispatchBar } from '~/utils/showsDispatchBar'

const route = useRoute()
const { y } = useWindowScroll()

/**
 * How far down before the sticky call bar appears.
 *
 * Not zero, on purpose. Every page that shows the bar already carries the same
 * offer as a banner near the top, so showing both in the first viewport is the
 * message twice and a strip of the listing covered for nothing. By roughly one
 * screen down the visitor has read the banner, scrolled past the first few
 * drivers and is still looking — which is the moment the offer is worth
 * repeating.
 */
const DISPATCH_BAR_SCROLL_THRESHOLD = 600

const showDispatchBar = computed(
  () => showsDispatchBar(route.path) && y.value > DISPATCH_BAR_SCROLL_THRESHOLD,
)
</script>

<template>
  <div class="layout">
    <AppHeader />
    <main class="layout__main">
      <slot />
    </main>
    <AppFooter />
    <CookieConsentBanner />

    <!-- Rendered here rather than per page so the "which pages" rule lives in
         one tested function — see utils/showsDispatchBar.ts. Client-only in
         effect: `y` is 0 during SSR and on the first client tick, so the bar
         mounts after hydration instead of flashing into place. -->
    <DispatchCallCta v-if="showDispatchBar" variant="bar" />
  </div>
</template>

<style scoped lang="scss">
.layout {
  display: flex;
  flex-direction: column;
  min-height: 100dvh;

  &__main {
    flex: 1;
  }
}
</style>
