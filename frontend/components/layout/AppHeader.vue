<script setup lang="ts">
import { LOGIN_LINK, NAV_LINKS, REGISTER_LINK } from '~/constants/navigation'

/** Header, drawer and footer all render the same link list — see NavLink.labelKey */
const { t } = useI18n()

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
      <NuxtLinkLocale to="/" class="header__logo" :aria-label="t('a11y.homeLink')">
        <img src="/evakuators-logo-light-bg.svg" alt="Evakuators.am" class="header__logo-img">
      </NuxtLinkLocale>

      <nav class="header__nav" :aria-label="t('a11y.mainNav')">
        <NuxtLinkLocale v-for="link in NAV_LINKS" :key="link.to" :to="link.to" class="header__link">
          {{ t(link.labelKey) }}
        </NuxtLinkLocale>
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
        <NuxtLinkLocale :to="LOGIN_LINK.to" class="header__login">{{ t(LOGIN_LINK.labelKey) }}</NuxtLinkLocale>
        <AppButton :to="REGISTER_LINK.to" variant="accent" size="sm" class="header__register">
          {{ t(REGISTER_LINK.labelKey) }}
        </AppButton>
        <button
          type="button"
          class="header__burger"
          :aria-label="t('a11y.openMenu')"
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
/**
 * The width at which the full nav replaces the burger — one name, because the
 * two rules that read it (`&__nav` showing and `&__burger` hiding) are the
 * same decision and a mismatch between them would leave a width with both, or
 * with neither.
 *
 * Measured, not chosen: the bar's contents on one line are 1365px (logo 97 +
 * nav 777 + the call/login/register group 460, plus the two 16px gaps), and
 * the container adds 48px of padding, so 1413px is the narrowest viewport
 * that fits. Below it the nav used to wrap onto a second line; now the burger
 * takes over instead, which is the honest answer — the drawer carries every
 * one of these links already.
 *
 * Keep this at or above 1413px. If a nav link is ever added, re-measure
 * rather than nudging it.
 */
$nav-breakpoint: 1425px;

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
    // Scaled with `--header-height`, so the logo keeps roughly the same margin
    // above and below it in either bar instead of nearly touching the edges:
    // 30 of 56 on a phone, 46 of 76 on a desktop.
    //
    // A height and `width: auto`, never the reverse — the file is cropped to
    // the artwork (ratio ~2.1), so height is the dimension that has to be
    // predictable inside a bar whose own height is fixed. This broke once, when
    // the SVGs were re-exported on a full A4 canvas: the art then filled 26% of
    // the file's height, so `height: 30px` drew a 8px logo. If it ever looks
    // small again, check the viewBox before touching this number.
    height: 30px;
    width: auto;
    display: block;

    @media (min-width: 1024px) {
      height: 46px;
    }
  }

  &__nav {
    display: none;
    gap: var(--space-4);

    @media (min-width: $nav-breakpoint) {
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

    // Exactly where the nav appears — see $nav-breakpoint.
    @media (min-width: $nav-breakpoint) {
      display: none;
    }
  }
}
</style>
