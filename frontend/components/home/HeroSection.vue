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

      <!-- Three buttons above the search (2026-11-12): shared routes (white,
           first), «nearest» (gold) and our own number (outlined). The region
           cards right under this hero are the next way in. -->
      <div class="hero__actions">
        <!-- Shared routes («Պապուտի», 2026-11-12; label = the page's own H1): a driver already heading
             somewhere takes a car on the way, usually cheaper. FIRST and
             solid white (2026-11-12, owner's call): it has to be seen. -->
        <NuxtLinkLocale to="/free-routes" class="hero__routes">
          <AppIcon name="truck" :size="22" />
          {{ t('freeRoutes.h1') }}
        </NuxtLinkLocale>
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

  // A phone: less room above the title, so it sits higher on the first screen
  @media (max-width: 639px) {
    padding-top: var(--space-3);
  }

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
    // 20px since 2026-11-12: a third hero button (shared routes) came in,
    // and the title gave up the room so the search still fits the first screen.
    @media (max-width: 767px) {
      font-size: 22px;
      line-height: 1.28;
      margin-bottom: var(--space-2);
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

    // Wider screens: routes + «nearest» side by side, our phone number on
    // its own row below them, centred (2026-11-12).
    @media (min-width: 640px) {
      flex-direction: row;
      flex-wrap: wrap;
      justify-content: center;
      align-items: center;
      max-width: 960px;
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

    // A phone: a little lower than the two buttons above (2026-11-12)
    @media (max-width: 639px) {
      :deep(.dispatch-cta__call) {
        min-height: 44px;
        padding-block: 8px;
      }
    }

    @media (min-width: 640px) {
      flex-basis: 100%;
      display: flex;
      justify-content: center;
    }
  }

  &__routes {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    min-height: 54px;
    width: 100%;
    padding: 0 var(--space-5);
    border-radius: var(--radius-md);
    background: #fff;
    border: 2px solid #fff;
    color: var(--color-primary-dark);
    font-weight: 700;
    font-size: 1.1rem;
    line-height: 1.2;

    // A phone: as large as still fits on ONE line at 360–390px
    // A phone: scales with the screen so the label stays on one line
    // (≈14.8px at 360px, 16px at 390px+); it may still wrap on a tiny screen.
    @media (max-width: 639px) {
      min-height: 48px;
      font-size: clamp(13.5px, 3.9vw, 15.5px);
      padding: 0 12px;
      gap: 8px;
    }
    text-align: center;
    text-decoration: none;
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.22);
    transition: transform var(--transition), box-shadow var(--transition);
    -webkit-tap-highlight-color: transparent;

    svg {
      color: var(--color-accent-dark, var(--color-accent));
      flex-shrink: 0;

      @media (max-width: 639px) {
        width: 19px;
        height: 19px;
      }
    }

    &:hover,
    &:focus-visible {
      color: var(--color-primary-dark);
      text-decoration: none;
      transform: translateY(-1px);
      box-shadow: 0 8px 22px rgba(0, 0, 0, 0.28);
    }

    &:focus-visible {
      outline: 2px solid var(--color-accent);
      outline-offset: 2px;
    }

    @media (min-width: 640px) {
      width: auto;
      white-space: nowrap;
    }
  }

  &__nearest :deep(.app-button svg) {
    flex-shrink: 0;
    width: 20px;
    height: 20px;

    @media (max-width: 639px) {
      width: 18px;
      height: 18px;
    }
  }

  // The gold «nearest» button: same height, a bolder label. On a phone the
  // label may wrap (large system font, narrow screen) but the icon never
  // shrinks — at 360px a one-line label used to squeeze it to nothing.
  &__nearest :deep(.app-button) {
    min-height: 54px;
    font-size: 1.1rem;
    font-weight: 700;

    @media (max-width: 639px) {
      min-height: 44px;
      padding-block: 10px;
      font-size: clamp(13.5px, 3.9vw, 15.5px);
      padding-inline: 12px;
      gap: 8px;
      white-space: normal;
      line-height: 1.25;
    }
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
