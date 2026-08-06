<script setup lang="ts">
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
}

withDefaults(defineProps<Props>(), { variant: 'banner' })
</script>

<template>
  <div class="nearest-cta" :class="`nearest-cta--${variant}`">
    <div v-if="variant === 'banner'" class="nearest-cta__text">
      <p class="nearest-cta__title">Չգիտե՞ք որ էվակուատորն է Ձեզ ամենամոտը</p>
      <p class="nearest-cta__subtitle">
        Թույլատրեք տեղադրության որոշումը, և մենք ցույց կտանք Ձեզ ամենամոտ գտնվող վարորդներին՝
        հեռավորությամբ և մոտավոր ժամանակով։
      </p>
    </div>

    <AppButton to="/evakuator" variant="accent" :size="variant === 'banner' ? 'lg' : 'md'" :block="variant === 'inline'">
      <AppIcon name="map-pin" :size="18" />
      Գտնել մոտակա էվակուատորները
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

  &--banner {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-4);
    padding: var(--space-5);
    border-radius: var(--radius-lg);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    box-shadow: var(--shadow-sm);

    // Text and button side by side once there is room; stacked on a phone, where
    // a button squeezed next to two lines of copy becomes a tap target nobody
    // hits on the first try.
    @media (min-width: 768px) {
      flex-direction: row;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-5);

      // Side by side now, so the button goes back to its natural width and one
      // line. It is `__text` that gives way when the row gets tight — it has
      // `min-width: 0` for exactly that, and shrinking a paragraph is better
      // than shrinking the thing being clicked.
      :deep(.app-button) {
        width: auto;
        white-space: nowrap;
        flex-shrink: 0;
      }
    }
  }

  &--inline {
    display: block;
  }

  &__text {
    min-width: 0;
  }

  &__title {
    margin: 0 0 var(--space-1);
    font-size: 1.05rem;
    font-weight: 700;
  }

  &__subtitle {
    margin: 0;
    font-size: 0.9rem;
    line-height: 1.55;
    color: var(--color-text-secondary);
  }
}
</style>
