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
          >՝ էվակուատոր գտնելու հարթակ ամբողջ Հայաստանում
        </h1>
        <p class="hero__subtitle">
          Ընտրեք մարզը կամ քաղաքը, տեսեք հասանելի մեքենաները և անմիջապես զանգահարեք վարորդին։
        </p>
      </div>
      <LocationSearch class="hero__search" />
      <ul class="hero__points">
        <li><AppIcon name="check" :size="16" /> Ամբողջ Հայաստանում</li>
        <li><AppIcon name="clock" :size="16" /> 24/7 ծառայություններ</li>
        <li><AppIcon name="phone" :size="16" /> Ուղիղ կապ վարորդի հետ</li>
      </ul>
    </div>
  </section>
</template>

<style scoped lang="scss">
.hero {
  background: linear-gradient(160deg, var(--color-primary-dark) 0%, var(--color-primary) 60%, var(--color-primary-light) 100%);
  // Top and bottom split rather than a shorthand: the gap ABOVE the heading is
  // dead air a phone can't spare above the fold, while the bottom padding still
  // needs to breathe before the next section. `--space-7` on both was fine on
  // desktop's slower scroll pace, too tall on a phone that opens straight into it.
  padding: var(--space-5) 0 var(--space-7);
  color: #fff;

  @media (min-width: 768px) {
    padding: var(--space-8) 0;
  }

  &__content {
    max-width: 640px;
    margin: 0 auto var(--space-5);
    text-align: center;
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
  }

  &__search {
    max-width: 860px;
    margin: 0 auto;
  }

  &__points {
    list-style: none;
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: var(--space-3) var(--space-5);
    margin-top: var(--space-5);

    li {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      font-size: 0.92rem;
      color: rgba(255, 255, 255, 0.85);

      svg {
        color: var(--color-accent);
      }
    }
  }
}
</style>
