<script setup lang="ts">
import { SITE_NAME, SOCIAL_LINKS } from '~/constants/site'

/**
 * The link-in-bio page — what an Instagram or TikTok profile points at, since
 * those bios allow exactly one URL and we have six destinations.
 *
 * ## Why it has no header
 *
 * Someone arriving here came from a social profile and is deciding where to go
 * next. A site header offering eight more destinations is the one thing that
 * can stop a six-choice page from working, so the `bare` layout drops the
 * header, the footer and the floating call button — see `layouts/bare.vue` for
 * what it deliberately keeps.
 *
 * ## Armenian only
 *
 * `defineI18nRoute` restricts the route, so `/ru/links` and `/en/links`
 * do not exist. The page is a list of six links to Armenian-language
 * destinations; translating the handful of labels around them would produce
 * two more URLs with nothing different on them, which is the
 * duplicate-content shape `hreflang` exists to prevent rather than create. `useSeoMetaData`'s
 * `locales` option keeps the alternate set off the page for the same reason.
 *
 * ## `noindex`
 *
 * Six links and one line of explanation is thin by construction, and every
 * destination is already reachable: the homepage from the whole site,
 * `/evakuator` and `/free-routes` from the nav, the profiles from the footer
 * and from schema.org `sameAs`. This page exists for people who
 * were handed its URL, not for search.
 */
definePageMeta({ layout: 'bare' })
defineI18nRoute({ locales: ['hy'] })

const { t } = useI18n()

useSeoMetaData({
  title: t('links.title'),
  description: t('links.description'),
  path: '/links',
  noindex: true,
  locales: ['hy'],
})

/**
 * The profiles, from the one list that already feeds the footer and the
 * `sameAs` in the Organization schema (`constants/site.ts`). A second copy of
 * three URLs is a second copy that goes stale, and the one that goes stale is
 * always the one nobody is looking at.
 *
 * Order follows that list too — change it there and the footer, this page and
 * the structured data all move together.
 */
const socials = computed(() =>
  SOCIAL_LINKS.map((social) => ({
    ...social,
    // `instagram.com/evakuators.am` rather than the full URL: the scheme and
    // the `www.` are noise on a row whose job is to be recognised at a glance,
    // and the handle is the part someone checks against the profile they came
    // from.
    handle: social.url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, ''),
  })),
)

/** `evakuators.am`, from the name rather than typed again */
const siteHost = SITE_NAME.toLowerCase()
</script>

<template>
  <div class="links">
    <div class="links__inner">
      <!-- The page's heading, present for the document rather than for the
           screen. The brand card that used to sit here is gone: the site card
           below carries the mark and the wordmark, and a page of five links
           does not need to say who it is twice. A page with no <h1> is still
           a page nobody can outline, so the heading stays and the styling
           does not. -->
      <h1 class="visually-hidden">{{ t('links.title') }}</h1>

      <!-- The site, given the whole card rather than a row: it is the one
           destination we own, and the picture is what makes "this is the
           website" a thing you see rather than read. -->
      <NuxtLinkLocale to="/" class="site" :aria-label="t('links.siteOpen', { site: siteHost })">
        <!-- The Open Graph image, reused deliberately: it is already the
             brand's one wide composition, so this page cannot drift from what
             gets shown when the same link is pasted into a chat. Dimensions
             are on the tag so the card does not resize under the thumb after
             the image lands. -->
        <img class="site__shot" src="/og-image.png" alt="" width="1200" height="630" fetchpriority="high">
        <span class="site__bar">
          <span class="site__text">
            <span class="site__label">{{ t('links.siteLabel') }}</span>
            <span class="site__url">{{ siteHost }}</span>
          </span>
          <span class="site__go" aria-hidden="true">
            <AppIcon name="arrow-right" :size="17" />
          </span>
        </span>
      </NuxtLinkLocale>

      <!-- Second, and still the only filled surface on the page: the site
           card above is where someone who came to look at the brand is going,
           and this is where someone who came with a problem is going. Order
           decides which is the default; colour decides which is impossible to
           miss, and that one is this.

           It is a link, not a search. `/evakuator` owns the geolocation
           prompt, the hour-long answer cache and the daily routing allowance
           (`useNearestSearch`), and asking for a position here would raise a
           permission prompt on a page nobody opened for that — the exact
           reason `NearestTowTrucksCta` does not do it either. A browser that
           refuses once remembers, so the ask belongs after the choice.

           Rendered unconditionally, including while NEAREST_SEARCH_ENABLED is
           false: that is the site-wide decision recorded in
           `constants/features.ts` — the entry points stay, and the page they
           lead to says the feature is coming. -->
      <NuxtLinkLocale to="/evakuator" class="near">
        <span class="near__plate" aria-hidden="true">
          <AppIcon name="map-pin" :size="22" />
        </span>
        <span class="near__text">
          <!-- The label every other entry point uses, by key. Six placements
               already share `nearest.cta` through `NearestTowTrucksCta`; this
               page cannot use that component (it is an `AppButton` built for
               the site's light surfaces, and this page is deliberately outside
               them), so it takes the one thing that must never drift — the
               wording — from the same place the component does. -->
          <span class="near__title">{{ t('nearest.cta') }}</span>
          <span class="near__hint">{{ t('links.nearestHint') }}</span>
        </span>
        <span class="near__go" aria-hidden="true">
          <AppIcon name="arrow-right" :size="18" />
        </span>
      </NuxtLinkLocale>

      <!-- The third thing the platform does, and the one nobody arrives
           knowing: a driver heading somewhere empty, who will take a job on
           the way. The other two cards can be understood from their label
           alone; this one cannot, so it is the only card here that explains
           itself.

           The heading comes from `/free-routes` rather than being written
           again, and that heading carries «Պապուտի» — the borrowed «по пути»
           everyone actually says for this. The formal name is what the page is
           called; the borrowed one is what makes someone recognise it, and a
           card that dropped it would be naming a thing its reader has heard of
           under a name they have not. -->
      <NuxtLinkLocale to="/free-routes" class="free">
        <span class="free__plate" aria-hidden="true">
          <AppIcon name="truck" :size="22" />
        </span>
        <span class="free__text">
          <span class="free__title">{{ t('freeRoutes.h1') }}</span>
          <span class="free__hint">{{ t('links.freeRoutesHint') }}</span>
        </span>
        <span class="free__go" aria-hidden="true">
          <AppIcon name="chevron-right" :size="18" />
        </span>
      </NuxtLinkLocale>

      <a
        v-for="social in socials"
        :key="social.url"
        class="row"
        :href="social.url"
        target="_blank"
        rel="noopener noreferrer"
        :aria-label="t('links.followOn', { network: social.label })"
      >
        <!-- Each platform in its own colours. On a page whose whole job is
             "pick one of these", the logo mark is what a thumb aims at — a row
             of identically tinted icons would make someone read three labels
             to find the one they wanted. -->
        <span class="row__chip" :class="`row__chip--${social.icon}`">
          <AppIcon :name="social.icon" :size="22" />
        </span>
        <span class="row__text">
          <span class="row__name">{{ social.label }}</span>
          <span class="row__handle">{{ social.handle }}</span>
        </span>
        <span class="row__chevron" aria-hidden="true">
          <AppIcon name="chevron-right" :size="18" />
        </span>
      </a>

      <p class="links__foot">© {{ new Date().getFullYear() }} {{ SITE_NAME }}</p>
    </div>
  </div>
</template>

<style scoped lang="scss">
/**
 * Self-contained on purpose: this page is the one that does not sit inside the
 * site's surfaces, so it does not read `--color-surface` and friends. The two
 * brand values it does use are written out rather than imported through a
 * token that means "card background" somewhere else.
 */
$accent: #f7b52c;
$navy: #14304f;

.links {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100dvh;
  padding: var(--space-6) var(--space-5);
  overflow: hidden;
  color: #fff;
  background: linear-gradient(165deg, #163456 0%, #0f263f 48%, #091624 100%);

  /* One warm light source, top left, so the cards read as lit rather than as
     flat panels on a flat field. */
  &::before {
    content: '';
    position: absolute;
    left: -18%;
    top: -22%;
    width: 78vmax;
    height: 78vmax;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(247, 181, 44, 0.13) 0%, rgba(247, 181, 44, 0) 62%);
    pointer-events: none;
  }

  /* Road markings as texture. Barely visible by design — at the opacity where
     you can name the pattern, it stops being a surface and starts competing
     with the cards. */
  &::after {
    content: '';
    position: absolute;
    inset: 0;
    opacity: 0.028;
    background: repeating-linear-gradient(115deg, #fff 0 2px, transparent 2px 44px);
    pointer-events: none;
  }

  &__inner {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    width: 100%;
    max-width: 420px;
  }

  &__foot {
    margin: var(--space-4) 0 0;
    text-align: center;
    font-size: 0.75rem;
    color: #6f87a4;
  }
}

/* Shared by every card on the page */
@mixin pressable {
  text-decoration: none;
  transition:
    transform var(--transition),
    background var(--transition),
    border-color var(--transition);

  &:active {
    transform: scale(0.985);
  }

  &:focus-visible {
    outline: 2px solid $accent;
    outline-offset: 3px;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: background var(--transition), border-color var(--transition);

    &:active {
      transform: none;
    }
  }
}

/**
 * The page's one filled surface, and the only thing on it that is not a card
 * of the same family. That is the whole point: a visitor scanning six
 * destinations should not have to read them to find the urgent one.
 *
 * Navy on amber rather than amber on navy — the inverse of everything else
 * here — so it reads as a button in a list of links rather than as a
 * louder link.
 */
.near {
  @include pressable;

  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-4);
  border-radius: var(--radius-lg);
  color: $navy;
  background: linear-gradient(135deg, #ffca4d 0%, #f7b52c 55%, #eda314 100%);
  border: 1px solid rgba(255, 255, 255, 0.28);
  box-shadow:
    0 16px 34px -18px rgba(247, 181, 44, 0.75),
    inset 0 1px 0 rgba(255, 255, 255, 0.45);

  &:hover {
    background: linear-gradient(135deg, #ffd166 0%, #ffbe3d 55%, #f3ab1c 100%);
    border-color: rgba(255, 255, 255, 0.4);
  }

  &__plate {
    flex: none;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 46px;
    height: 46px;
    border-radius: 14px;
    color: $accent;
    background: $navy;
  }

  &__text {
    flex: 1;
    min-width: 0;
  }

  &__title {
    display: block;
    font-size: 0.98rem;
    font-weight: 800;
    line-height: 1.3;
  }

  &__hint {
    display: block;
    margin-top: 3px;
    /* Navy at 72%, not a grey: a neutral secondary colour over amber goes
       muddy, and this stays the same hue as the title it sits under. */
    color: rgba(20, 48, 79, 0.72);
    font-size: 0.76rem;
    font-weight: 600;
    line-height: 1.35;
  }

  &__go {
    flex: none;
    display: flex;
    color: rgba(20, 48, 79, 0.8);
  }
}

.site {
  @include pressable;

  display: block;
  border-radius: var(--radius-lg);
  overflow: hidden;
  color: inherit;
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(255, 255, 255, 0.05);
  box-shadow:
    0 20px 44px -24px rgba(0, 0, 0, 0.95),
    inset 0 1px 0 rgba(255, 255, 255, 0.12);

  &:hover {
    background: rgba(255, 255, 255, 0.085);
    border-color: rgba(255, 255, 255, 0.26);
  }

  &__shot {
    display: block;
    width: 100%;
    height: auto;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }

  &__bar {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
  }

  &__text {
    flex: 1;
    min-width: 0;
  }

  &__label {
    display: block;
    font-size: 0.72rem;
    font-weight: 700;
    color: $accent;
  }

  &__url {
    display: block;
    margin-top: 2px;
    font-size: 1rem;
    font-weight: 700;
    letter-spacing: -0.1px;
  }

  &__go {
    flex: none;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border-radius: var(--radius-full);
    background: $accent;
    color: $navy;
    box-shadow: 0 8px 20px -8px rgba(247, 181, 44, 0.85);
  }
}

/**
 * Quiet on purpose. The amber card above is the urgent one and there can only
 * be one of those; this is the card someone reads rather than reaches for.
 *
 * The one flourish is a road's dashed centre line along the top edge — the
 * same marking as the page background and the brand's own image, inset from
 * the corners and faded at both ends so it reads as a detail rather than as a
 * border that failed to render.
 */
.free {
  @include pressable;

  position: relative;
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-4);
  border-radius: var(--radius-lg);
  overflow: hidden;
  color: inherit;
  background: rgba(255, 255, 255, 0.045);
  border: 1px solid rgba(255, 255, 255, 0.1);

  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: var(--space-4);
    right: var(--space-4);
    height: 2px;
    background: repeating-linear-gradient(90deg, $accent 0 12px, transparent 12px 24px);
    -webkit-mask-image: linear-gradient(90deg, transparent 0%, #000 25%, #000 75%, transparent 100%);
    mask-image: linear-gradient(90deg, transparent 0%, #000 25%, #000 75%, transparent 100%);
    opacity: 0.45;
  }

  &:hover {
    background: rgba(255, 255, 255, 0.085);
    border-color: rgba(255, 255, 255, 0.22);
  }

  /* Outlined rather than filled: a solid amber plate is what the card above
     uses, and two of them would be two primary actions. */
  &__plate {
    flex: none;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 42px;
    height: 42px;
    border-radius: 13px;
    color: $accent;
    background: rgba(247, 181, 44, 0.12);
    border: 1px solid rgba(247, 181, 44, 0.3);
  }

  &__text {
    flex: 1;
    min-width: 0;
  }

  &__title {
    display: block;
    font-size: 0.95rem;
    font-weight: 700;
    line-height: 1.3;
  }

  &__hint {
    display: block;
    margin-top: 4px;
    font-size: 0.76rem;
    line-height: 1.4;
    color: #8fa4be;
  }

  &__go {
    flex: none;
    display: flex;
    color: #7c93b0;
  }
}

.row {
  @include pressable;

  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-lg);
  color: inherit;
  background: rgba(255, 255, 255, 0.055);
  border: 1px solid rgba(255, 255, 255, 0.1);

  &:hover {
    background: rgba(255, 255, 255, 0.095);
    border-color: rgba(255, 255, 255, 0.22);

    .row__chevron {
      transform: translateX(2px);
    }
  }

  &__chip {
    flex: none;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 42px;
    height: 42px;
    border-radius: 13px;
    color: #fff;

    /* Each platform's own mark, with a glow in its own colour. */
    &--facebook {
      background: #1877f2;
      box-shadow: 0 6px 16px -8px #1877f2;
    }

    &--instagram {
      background: linear-gradient(45deg, #f58529, #dd2a7b 45%, #8134af 70%, #515bd4);
      box-shadow: 0 6px 16px -8px #dd2a7b;
    }

    /* TikTok's mark is black on white; the cyan in the glow is the rest of
       its identity, which a flat black square would lose entirely. */
    &--tiktok {
      background: #111;
      box-shadow: 0 6px 16px -8px #25f4ee;
    }
  }

  &__text {
    flex: 1;
    min-width: 0;
  }

  &__name {
    display: block;
    font-size: 0.95rem;
    font-weight: 700;
  }

  &__handle {
    display: block;
    margin-top: 2px;
    font-size: 0.78rem;
    color: #8fa4be;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  &__chevron {
    flex: none;
    display: flex;
    color: #7c93b0;
    transition: transform var(--transition);

    @media (prefers-reduced-motion: reduce) {
      transition: none;
    }
  }
}
</style>
