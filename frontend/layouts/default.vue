<script setup lang="ts">
import { showsDispatchBar } from '~/utils/showsDispatchBar'

const route = useRoute()

/**
 * The floating call button, from the first screen.
 *
 * It used to appear only after ~600px of scrolling, because every listing page
 * also carried the same offer as a banner near the top and both together were
 * the message twice. The banner is gone, so the button is now the one offer on
 * those pages and has no reason to wait.
 */
const showDispatchBar = computed(() => showsDispatchBar(route.path))
</script>

<template>
  <div class="layout">
    <AppHeader />
    <main class="layout__main">
      <slot />
    </main>
    <AppFooter />
    <CookieConsentBanner />
    <!-- Asks a visitor who landed on a Russian/English page whether they
         would rather read in Armenian. Once per browser; see the component. -->
    <LanguagePrompt />

    <!-- Rendered here rather than per page so the "which pages" rule lives in
         one tested function — see utils/showsDispatchBar.ts. -->
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
