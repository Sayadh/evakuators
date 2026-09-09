<script setup lang="ts">
import { LOGIN_LINK, NAV_LINKS, REGISTER_LINK } from '~/constants/navigation'

const isMobileMenuOpen = ref(false)

const route = useRoute()
watch(
  () => route.fullPath,
  () => {
    isMobileMenuOpen.value = false
  },
)
</script>

<template>
  <header class="header">
    <div class="container header__inner">
      <NuxtLink to="/" class="header__logo" aria-label="Evakuators.am — գլխավոր էջ">
        <img src="/evakuators-logo-light-bg.svg" alt="Evakuators.am" class="header__logo-img">
      </NuxtLink>

      <nav class="header__nav" aria-label="Հիմնական նավիգացիա">
        <NuxtLink v-for="link in NAV_LINKS" :key="link.to" :to="link.to" class="header__link">
          {{ link.label }}
        </NuxtLink>
      </nav>

      <div class="header__actions">
        <!-- Before «Գրանցվել», and deliberately quieter than it: this is the
             one thing on the site a stranded customer needs from every page,
             but the header already has an accent button and a second one would
             leave neither reading as primary. See DispatchCallCta.vue. -->
        <DispatchCallCta variant="header" />
        <!-- The way back IN, next to the way to sign UP. A driver whose profile
             is the thing they pay for had no link to it from anywhere on the
             site; the register button had been there all along. Quiet on
             purpose — signing up is the one the site is asking for. -->
        <NuxtLink :to="LOGIN_LINK.to" class="header__login">{{ LOGIN_LINK.label }}</NuxtLink>
        <AppButton :to="REGISTER_LINK.to" variant="accent" size="sm" class="header__register">
          {{ REGISTER_LINK.label }}
        </AppButton>
        <button
          type="button"
          class="header__burger"
          aria-label="Բացել մենյուն"
          :aria-expanded="isMobileMenuOpen"
          @click="isMobileMenuOpen = true"
        >
          <AppIcon name="menu" :size="24" />
        </button>
      </div>
    </div>

    <MobileMenu v-model="isMobileMenuOpen" />
  </header>
</template>

<style scoped lang="scss">
.header {
  position: sticky;
  top: 0;
  z-index: 50;
  background: var(--color-surface);
  box-shadow: var(--shadow-sm);

  &__inner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
    height: var(--header-height);
  }

  &__logo {
    display: flex;
    align-items: center;
  }

  &__logo-img {
    // Scaled down with `--header-height` (64px → 56px) so the logo keeps the
    // same margin above/below it inside the shorter bar, instead of nearly
    // touching the top/bottom edges.
    height: 30px;
    width: auto;
    display: block;
  }

  &__nav {
    display: none;
    gap: var(--space-4);

    @media (min-width: 1024px) {
      display: flex;
    }
  }

  &__link {
    font-weight: 600;
    font-size: 0.95rem;
    color: var(--color-text);
    padding: var(--space-2);
    border-radius: var(--radius-sm);

    &:hover,
    &.router-link-active {
      color: var(--color-primary-light);
    }
  }

  &__actions {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  &__login {
    display: none;
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-md);
    color: var(--color-primary);
    font-weight: 600;
    white-space: nowrap;
    transition: background var(--transition);

    &:hover {
      background: rgba(20, 48, 79, 0.06);
      color: var(--color-primary);
    }

    /* One step later than «Գրանցվել». At 640px the bar already holds a logo,
       the call number, a long accent button and the burger; the drawer carries
       this link at every width, so the narrow case loses nothing. */
    @media (min-width: 768px) {
      display: inline-flex;
    }
  }

  &__register {
    display: none;

    @media (min-width: 640px) {
      display: inline-flex;
    }
  }

  &__burger {
    display: inline-flex;
    padding: var(--space-2);
    border: none;
    background: none;
    color: var(--color-primary);
    cursor: pointer;
    border-radius: var(--radius-sm);

    &:hover {
      background: var(--color-bg);
    }

    @media (min-width: 1024px) {
      display: none;
    }
  }
}
</style>
