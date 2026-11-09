<script setup lang="ts">
/** Static copy lives in i18n/locales — see nuxt.config's i18n block */
const { t } = useI18n()
</script>

<template>
  <section class="hero">
    <div class="container">
      <div class="hero__content">
        <!-- The brand is IN the H1, not only in the header logo, because this
             is the site's single most authoritative line of text about itself —
             what a crawler, a knowledge panel or an AI assistant reads to
             answer "what is this". A generic H1 («Գտեք մոտակա էվակուատորը»)
             described the service perfectly and named nobody, which is exactly
             the gap a similarly-named competitor gets merged into.

             The service keyword stays in the same sentence on purpose: brand
             first for identity, «էվակուատոր» second for what people search. -->
        <h1 class="hero__title">
          <span class="hero__brand">Evakuators.am</span
          >{{ t('home.heroTitle') }}
        </h1>
        <p class="hero__subtitle">
          {{ t('home.heroSubtitle') }}
        </p>
      </div>

      <!-- The two ways to get a person on the phone fastest, side by side:
           «nearest» (filled — it leads to the drivers) and our own number
           (outlined). Both above the search, because somebody whose car has
           just stopped wants a person before a list. The region cards right
           under this hero are the third way in; there is no fourth. -->
      <div class="hero__actions">
        <NearestTowTrucksCta class="hero__nearest" />
        <DispatchCallCta variant="hero" class="hero__dispatch" />
      </div>

      <!-- Text search only. The marz/city selects that used to sit under it
           duplicated the region cards one scroll below. -->
      <LocationSearch :cascade="false" class="hero__search" />

      <ul class="hero__points">
        <li><AppIcon name="phone" :size="16" /> {{ t('home.heroPointDirect') }}</li>
        <li><AppIcon name="clock" :size="16" /> {{ t('home.heroPointHours') }}</li>
        <li><AppIcon name="check" :size="16" /> {{ t('home.heroPointFree') }}</li>
      </ul>

      <!-- The hero ends at the bottom of a phone screen, so nothing says the
           region cards are right below it. A plain in-page link: works with no
           JavaScript, and the page's global `scroll-behavior: smooth` animates
           it. It lands on the section's heading, which carries a
           `scroll-margin-top` that leaves the whole hero above the fold. -->
      <a href="#areas-title" class="hero__more">
        {{ t('home.chooseArea') }}
        <AppIcon name="chevron-down" :size="30" class="hero__more-icon" />
      </a>
    </div>
  </section>
</template>

<style scoped lang="scss">
.hero {
  background: linear-gradient(160deg, var(--color-primary-dark) 0%, var(--color-primary) 60%, var(--color-primary-light) 100%);
  padding: var(--space-5) 0 var(--space-2);
  color: #fff;

  @media (min-width: 768px) {
    padding: var(--space-7) 0 var(--space-3);
  }

  &__content {
    max-width: 860px;
    margin: 0 auto var(--space-5);
    text-align: center;

    @media (max-width: 639px) {
      margin-bottom: var(--space-4);
    }
  }

  &__title {
    color: #fff;
    margin-bottom: var(--space-3);

    // Overrides the global h1's `clamp(1.7rem, 4vw, 2.4rem)` — on a narrow
    // phone the `vw` term is smaller than the 1.7rem floor, so it was already
    // clamping to ~27px, still taller than this hero wants above the fold.
    @media (max-width: 767px) {
      font-size: 23px;
    }
  }

  /* The brand reads as the subject of the sentence rather than as the first
     two words of it. No colour change — on this gradient the accent gold is
     the CTA's job, and a second gold thing competes with it. */
  &__brand {
    white-space: nowrap;
  }

  &__subtitle {
    font-size: 1.05rem;
    color: rgba(255, 255, 255, 0.85);
    margin: 0;

    @media (max-width: 767px) {
      font-size: 14px;
    }

    // On a phone the H1 already says what this line says, and the three lines
    // it wraps to are what pushed the region cards below the first screen.
    // Hidden by CSS only — it stays in the markup for crawlers and wide screens.
    @media (max-width: 639px) {
      display: none;
    }
  }

  &__actions {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: var(--space-3);
    max-width: 640px;
    margin: 0 auto var(--space-5);

    @media (max-width: 639px) {
      gap: var(--space-2);
      margin-bottom: var(--space-4);
    }

    @media (min-width: 640px) {
      flex-direction: row;
      justify-content: center;
      align-items: center;
    }

    // Both buttons the same height and, on a phone, the same full width — two
    // stacked buttons of different widths read as two different kinds of thing.
    :deep(.app-button),
    :deep(.dispatch-cta__call) {
      min-height: 48px;
      width: 100%;

      @media (min-width: 640px) {
        width: auto;
      }
    }
  }

  // The dispatch block carries vertical margins for its old solo position;
  // two classes so this wins over the child's own scoped rule.
  &__actions &__dispatch {
    margin-block: 0;
  }

  &__search {
    max-width: 640px;
    margin: 0 auto;
  }

  // Text with the chevron under it, no frame: a hint, not a third button.
  // Tight margins so the dark hero ends right after it.
  &__more {
    display: flex;
    flex-direction: column;
    align-items: center;
    width: fit-content;
    margin: var(--space-5) auto 0;
    padding: var(--space-1) var(--space-3) 0;
    color: #fff;
    font-weight: 600;
    font-size: 0.95rem;
    line-height: 1.3;
    text-decoration: none;
    border-radius: var(--radius-md);
    // No background on hover, tap or focus: it stayed lit after a tap and
    // read as a box around the hint. Keyboard users still get an outline.
    -webkit-tap-highlight-color: transparent;

    &:hover,
    &:focus {
      color: #fff;
      text-decoration: none;
      outline: none;
    }

    &:focus-visible {
      outline: 2px solid rgba(255, 255, 255, 0.6);
      outline-offset: 2px;
    }
  }

  &__more-icon {
    color: var(--color-accent);
    animation: hero-more-bounce 1.8s ease-in-out infinite;

    @media (prefers-reduced-motion: reduce) {
      animation: none;
    }
  }

  &__points {
    list-style: none;
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: var(--space-2) var(--space-5);
    margin-top: var(--space-4);

    @media (max-width: 639px) {
      gap: var(--space-1) var(--space-3);
      margin-top: var(--space-3);
    }

    li {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      font-size: 0.9rem;
      color: rgba(255, 255, 255, 0.85);

      @media (max-width: 639px) {
        font-size: 0.8rem;
      }

      svg {
        color: var(--color-accent);
      }
    }
  }
}

@keyframes hero-more-bounce {
  0%,
  100% {
    transform: translateY(0);
  }

  50% {
    transform: translateY(3px);
  }
}
</style>
