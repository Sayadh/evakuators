<script setup lang="ts">

/** Static copy lives in i18n/locales — see nuxt.config's i18n block */
const { t } = useI18n()
/**
 * The «Գտնել մոտակա էվակուատորները» call to action.
 *
 * One component, placed on the homepage, the region and city listings, the
 * Yerevan district pages and every driver profile — so the wording, the icon
 * and the destination are the same everywhere by construction. A button copied
 * into six templates is six places for the label to drift and one place for it
 * to be forgotten when a seventh page is added.
 *
 * The header nav carries the same link (`NAV_LINKS`), which covers pages this
 * block is not on. Both are needed: a nav item is discoverable only to someone
 * already scanning the nav, and this block sits in the reading flow of the page
 * a visitor is actually stuck on.
 *
 * Renders nothing but a link — no geolocation, no permission prompt. Asking for
 * a position on a page the visitor did not come to for that would be a prompt
 * out of nowhere; the ask belongs on /evakuator, after they have chosen it.
 */
interface Props {
  /**
   * `banner` (default) is the full-width card used inside page content.
   * `inline` is the compact variant for a spot that already has a heading and
   * its own surface — the driver profile's sidebar, for instance.
   */
  variant?: 'banner' | 'inline'
  /**
   * Shared routes («Պապուտի», 2026-11-12) as a second, navy button ABOVE
   * this one — the listing pages' counterpart of the homepage hero's white
   * button (a white button would vanish on these light pages).
   */
  withRoutes?: boolean
}

withDefaults(defineProps<Props>(), { variant: 'banner', withRoutes: false })
</script>

<template>
  <!-- Rendered unconditionally, including while NEAREST_SEARCH_ENABLED is
       false: this block is how a visitor finds out the feature is coming, and
       the page it links to says so plainly. See constants/features.ts. -->
  <div class="nearest-cta" :class="[`nearest-cta--${variant}`, { 'nearest-cta--with-routes': withRoutes }]">
    <NuxtLinkLocale v-if="withRoutes" to="/free-routes" class="nearest-cta__routes">
      <AppIcon name="truck" :size="20" />
      {{ t('freeRoutes.h1') }}
    </NuxtLinkLocale>
    <AppButton to="/evakuator" variant="accent" :size="variant === 'banner' ? 'lg' : 'md'" :block="variant === 'inline'">
      <AppIcon name="map-pin" :size="18" />
      {{ t('nearest.cta') }}
    </AppButton>
  </div>
</template>

<style scoped lang="scss">
.nearest-cta {
  /**
   * «Գտնել մոտակա էվակուատորները» is the longest button label on the site, and
   * `AppButton` is `white-space: nowrap` — correct for the short labels
   * everywhere else, wrong here: on a narrow card the text runs straight past
   * the edge instead of wrapping.
   *
   * Overridden at this component rather than in `AppButton`, so no other button
   * on the site changes. `line-height` has to come with it: AppButton sets `1`,
   * which is fine on one line and unreadable on two.
   */
  :deep(.app-button) {
    width: 100%;
    white-space: normal;
    line-height: 1.35;
    text-align: center;
  }

  // `lg` is 1.05rem (~16.8px) by default — too large once the button is the
  // only thing in a phone-width row. Scoped to mobile only; the `min-width:
  // 768px` block below already returns the button to its natural size.
  // Phones (2026-11-12): larger and bolder than before (it was 14px), scaled
  // to the screen so the label stays on one line from ~360px; the icon keeps
  // its size whatever the label does.
  @media (max-width: 767px) {
    :deep(.app-button) {
      font-size: clamp(14px, 4.1vw, 16px);
      font-weight: 700;
      min-height: 48px;
      padding-inline: 12px;
      gap: 8px;
    }
  }

  :deep(.app-button svg) {
    flex-shrink: 0;
    width: 20px;
    height: 20px;
  }

  &--with-routes {
    flex-direction: column;
    align-items: stretch;
    gap: var(--space-2);

    // Same height as the routes button above it (2026-11-12)
    :deep(.app-button) {
      min-height: 48px;
      padding-block: 10px;
    }

    @media (min-width: 768px) {
      flex-direction: row;
      justify-content: center;
      align-items: center;
      gap: var(--space-3);
    }
  }

  &__routes {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: 48px;
    padding: 0 var(--space-5);
    border-radius: var(--radius-md);
    background: var(--color-primary);
    color: #fff;
    font-weight: 700;
    font-size: 1.05rem;
    line-height: 1.2;
    text-align: center;
    text-decoration: none;
    transition: background var(--transition);

    svg {
      color: var(--color-accent);
      flex-shrink: 0;
    }

    &:hover,
    &:focus-visible {
      background: var(--color-primary-dark);
      color: #fff;
      text-decoration: none;
    }

    @media (max-width: 767px) {
      font-size: clamp(14px, 4.1vw, 16px);
      padding-inline: 12px;
    }

    @media (min-width: 768px) {
      white-space: nowrap;
    }
  }

  // Just the button now (see the template comment on why the text is gone) —
  // no more white card around it, so this only has to center the button.
  &--banner {
    display: flex;
    justify-content: center;

    @media (min-width: 768px) {
      :deep(.app-button) {
        width: auto;
        white-space: nowrap;
      }
    }
  }

  &--inline {
    display: block;
  }
}
</style>
