<script setup lang="ts">
import { NAV_LINKS, REGISTER_LINK } from '~/constants/navigation'

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
        <AppIcon name="truck" :size="26" class="header__logo-icon" />
        <span>Evakuators<span class="header__logo-dot">.am</span></span>
      </NuxtLink>

      <nav class="header__nav" aria-label="Հիմնական նավիգացիա">
        <NuxtLink v-for="link in NAV_LINKS" :key="link.to" :to="link.to" class="header__link">
          {{ link.label }}
        </NuxtLink>
      </nav>

      <div class="header__actions">
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
    gap: var(--space-2);
    font-size: 1.2rem;
    font-weight: 800;
    color: var(--color-primary);
  }

  &__logo-icon {
    color: var(--color-accent);
  }

  &__logo-dot {
    color: var(--color-accent-dark);
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
