<script setup lang="ts">
import { SITE_NAME, SOCIAL_LINKS } from '~/constants/site'

/**
 * The link-in-bio page — what an Instagram or TikTok profile points at, since
 * those bios allow exactly one URL and we have four destinations.
 *
 * ## Why it has no header
 *
 * Someone arriving here came from a social profile and is deciding where to go
 * next. A site header offering eight more destinations is the one thing that
 * can stop a four-choice page from working, so the `bare` layout drops the
 * header, the footer and the floating call button — see `layouts/bare.vue` for
 * what it deliberately keeps.
 *
 * ## Armenian only
 *
 * `defineI18nRoute` restricts the route, so `/ru/socials` and `/en/socials`
 * do not exist. The page is a list of four links to Armenian-language
 * destinations; translating the two sentences around them would produce two
 * more URLs with nothing different on them, which is the duplicate-content
 * shape `hreflang` exists to prevent rather than create. `useSeoMetaData`'s
 * `locales` option keeps the alternate set off the page for the same reason.
 *
 * ## `noindex`
 *
 * Four links and two sentences is thin by construction, and every destination
 * is already reachable: the homepage from the whole site, the profiles from
 * the footer and from schema.org `sameAs`. This page exists for people who
 * were handed its URL, not for search.
 */
definePageMeta({ layout: 'bare' })
defineI18nRoute({ locales: ['hy'] })

const { t } = useI18n()

useSeoMetaData({
  title: t('socials.title'),
  description: t('socials.description'),
  path: '/socials',
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
      <header class="profile">
        <!-- The square brand mark, which is what `favicon.svg` already is —
             not a crop of the wordmark lockup, which would be unreadable at
             this size. -->
        <span class="profile__avatar">
          <img src="/favicon.svg" alt="" width="76" height="76">
        </span>
        <h1 class="profile__name">{{ SITE_NAME }}</h1>
        <p class="profile__tagline">{{ t('socials.tagline') }}</p>
      </header>

      <!-- The site, given the whole card rather than a row: it is the one
           destination we own, and the picture is what makes "this is the
           website" a thing you see rather than read. -->
      <NuxtLinkLocale to="/" class="site" :aria-label="t('socials.siteOpen', { site: siteHost })">
        <!-- The Open Graph image, reused deliberately: it is already the
             brand's one wide composition, so this page cannot drift from what
             gets shown when the same link is pasted into a chat. Dimensions
             are on the tag so the card does not resize under the thumb after
             the image lands. -->
        <img class="site__shot" src="/og-image.png" alt="" width="1200" height="630" fetchpriority="high">
        <span class="site__bar">
          <span class="site__text">
            <span class="site__label">{{ t('socials.siteLabel') }}</span>
            <span class="site__url">{{ siteHost }}</span>
          </span>
          <span class="site__go" aria-hidden="true">
            <AppIcon name="arrow-right" :size="17" />
          </span>
        </span>
      </NuxtLinkLocale>

      <a
        v-for="social in socials"
        :key="social.url"
        class="row"
        :href="social.url"
        target="_blank"
        rel="noopener noreferrer"
        :aria-label="t('socials.followOn', { network: social.label })"
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

.profile {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  margin-bottom: var(--space-2);

  &__avatar {
    width: 76px;
    height: 76px;
    border-radius: 22px;
    overflow: hidden;
    border: 1px solid rgba(247, 181, 44, 0.45);
    box-shadow:
      0 12px 30px -14px rgba(0, 0, 0, 0.9),
      0 0 0 6px rgba(247, 181, 44, 0.06);

    img {
      display: block;
      width: 100%;
      height: 100%;
    }
  }

  &__name {
    margin: var(--space-3) 0 0;
    font-size: 1.32rem;
    letter-spacing: -0.2px;
  }

  &__tagline {
    margin: var(--space-1) 0 0;
    max-width: 300px;
    font-size: 0.85rem;
    line-height: 1.5;
    color: #9fb3cc;
  }
}

/* Shared by the site card and the profile rows */
@mixin pressable {
  /* Both are whole cards. The underline the browser puts under an anchor is
     for a link inside a sentence, and here it draws a line under the label of
     something that is already unmistakably a button. */
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
