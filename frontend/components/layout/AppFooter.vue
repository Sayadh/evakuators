<script setup lang="ts">
import { FOOTER_PAGES } from '~/constants/navigation'
import { CONTACT_PHONE, SITE_DESCRIPTION, SOCIAL_LINKS } from '~/constants/site'
import {
  getDistrictRoute,
  getRegionRoute,
  getRegionsRoute,
  getYerevanRoute,
} from '~/utils/routeHelpers'
import { getPhoneHref, getTelegramPhoneUrl } from '~/utils/formatPhone'
import { getStaticDistricts, getStaticRegions } from '~/utils/geography'

/**
 * The footer renders only names and links, so it reads static geography directly
 * — no network at all.
 *
 * It used to call `useRegions()` / `useDistricts()`, which fetch every tow truck
 * in the country to compute counts the footer never displays. Since the footer is
 * in the default layout, that meant *every page on the site* — including
 * `/about` and `/contact` — downloaded the whole fleet twice per render. This one
 * change is why those pages now make zero API requests.
 */
const regions = getStaticRegions()
const districts = getStaticDistricts()

const currentYear = new Date().getFullYear()

/**
 * Drives each column's `open` attribute — see the template comment for why
 * this replaced a CSS-only attempt at the same thing.
 */
const isWideFooter = useMediaQuery('(min-width: 640px)')
</script>

<template>
  <footer class="footer">
    <div class="container">
      <div class="footer__grid">
        <div class="footer__about">
          <NuxtLink to="/" class="footer__logo">
            <img src="/evakuators-logo.svg" alt="Evakuators.am" class="footer__logo-img">
          </NuxtLink>
          <p class="footer__description">{{ SITE_DESCRIPTION }}</p>
          <p class="footer__contacts">
            <a :href="getPhoneHref(CONTACT_PHONE)" class="footer__contact-link">
              <AppIcon name="phone" :size="16" /> {{ CONTACT_PHONE }}
            </a>
            <a
              :href="getTelegramPhoneUrl(CONTACT_PHONE)"
              target="_blank"
              rel="noopener"
              class="footer__contact-link"
            >
              <AppIcon name="telegram" :size="16" /> {{ CONTACT_PHONE }}
            </a>
          </p>
          <ul v-if="SOCIAL_LINKS.length" class="footer__social" aria-label="Սոցիալական ցանցեր">
            <li v-for="social in SOCIAL_LINKS" :key="social.url">
              <a
                :href="social.url"
                target="_blank"
                rel="noopener"
                class="footer__social-link"
                :aria-label="social.label"
                :title="social.label"
              >
                <AppIcon :name="social.icon" :size="20" />
              </a>
            </li>
          </ul>
        </div>

        <!-- The two headings are links, and that is load-bearing rather than
             decorative: `/regions` and `/yerevan` left the header when the two
             vehicle-type pages took their places, and `/regions` is the entry
             point to every marz and city page — most of the site. This is the
             site-wide link that keeps both hubs reachable and crawlable. -->
        <nav aria-label="Մարզեր">
          <!--
            `:open="isWideFooter"` rather than a CSS-only override: a closed
            `<details>` hides its non-`<summary>` content through a mechanism
            some browsers implement as more than a plain overridable
            `display: none` (Chromium's `<details>` uses a `content-visibility`
            based `::details-content`, not a rule an author selector reliably
            wins against) — a `min-width: 640px` rule setting `display: flex`
            on the list compiled and looked correct, but the column stayed
            empty on desktop regardless. Setting the real `open` attribute
            sidesteps the question of which mechanism a given browser uses.

            Still safe for a visitor's manual toggle on mobile: Vue only
            touches the attribute when `isWideFooter` itself changes value, so
            a click that flips the native `open` attribute while `isWideFooter`
            stays `false` is never patched back closed underneath them.

            The heading link inside `<summary>` still navigates instead of
            only toggling: `NuxtLink` calls `preventDefault()` on the click to
            do its own client-side routing, and that cancels every default
            action tied to the same event — including the browser's toggle —
            so a tap on "Մարզեր"/"Երևան" goes straight to the page, and only a
            tap elsewhere in the bar opens or closes the list.
          -->
          <details class="footer__col" :open="isWideFooter">
            <summary class="footer__heading">
              <NuxtLink :to="getRegionsRoute()">Մարզեր</NuxtLink>
            </summary>
            <ul class="footer__list">
              <li v-for="region in regions" :key="region.slug">
                <NuxtLink :to="getRegionRoute(region.slug)">{{ region.name }}</NuxtLink>
              </li>
            </ul>
          </details>
        </nav>

        <nav aria-label="Երևանի շրջաններ">
          <details class="footer__col" :open="isWideFooter">
            <summary class="footer__heading">
              <NuxtLink :to="getYerevanRoute()">Երևան</NuxtLink>
            </summary>
            <ul class="footer__list">
              <li v-for="district in districts" :key="district.slug">
                <NuxtLink :to="getDistrictRoute(district.slug)">{{ district.name }}</NuxtLink>
              </li>
            </ul>
          </details>
        </nav>

        <nav aria-label="Կայքի էջեր">
          <details class="footer__col" :open="isWideFooter">
            <summary class="footer__heading">Կայք</summary>
            <ul class="footer__list">
              <li v-for="page in FOOTER_PAGES" :key="page.to">
                <NuxtLink :to="page.to">{{ page.label }}</NuxtLink>
              </li>
            </ul>
          </details>
        </nav>
      </div>

      <div class="footer__bottom">
        <p>© {{ currentYear }} Evakuators.am</p>
      </div>
    </div>
  </footer>
</template>

<style scoped lang="scss">
.footer {
  background: var(--color-primary-dark);
  color: rgba(255, 255, 255, 0.85);
  padding: var(--space-7) 0 var(--space-5);
  margin-top: var(--space-7);

  &__grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: var(--space-6);

    @media (min-width: 640px) {
      grid-template-columns: repeat(2, 1fr);
    }

    @media (min-width: 1024px) {
      grid-template-columns: 2fr 1fr 1fr 1fr;
    }
  }

  &__logo {
    display: inline-flex;
    align-items: center;
    margin-bottom: var(--space-3);
  }

  &__logo-img {
    height: 32px;
    width: auto;
    display: block;
  }

  &__description {
    font-size: 0.9rem;
    line-height: 1.6;
    color: rgba(255, 255, 255, 0.7);
    max-width: 380px;
  }

  &__contacts {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin-top: var(--space-3);
  }

  &__contact-link {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    color: #fff;
    font-weight: 600;

    &:hover {
      color: var(--color-accent);
    }
  }

  &__social {
    list-style: none;
    display: flex;
    align-items: center;
    gap: var(--space-3);
    margin-top: var(--space-4);
    padding: 0;
  }

  &__social-link {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    color: #fff;
    background: rgba(255, 255, 255, 0.1);
    transition: background 0.2s ease, color 0.2s ease;

    &:hover,
    &:focus-visible {
      background: var(--color-accent);
      color: var(--color-primary-dark);
    }
  }

  // The `<details>` wrapping each column — collapsed accordion under 640px,
  // forced open (and non-interactive) from 640px, where the grid already
  // lays the three columns out side by side and a collapsed one would just
  // be an extra click for no space saved. See the template comment for why
  // native `<details>` rather than a Vue-tracked open flag.
  &__col {
    // The disclosure marker is drawn by `__heading`'s own `::after` instead —
    // this removes the native triangle so there are not two.
    summary {
      list-style: none;

      &::-webkit-details-marker {
        display: none;
      }
    }
  }

  &__heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    color: #fff;
    font-size: 1rem;
    margin-bottom: var(--space-3);
    cursor: pointer;

    // "Մարզեր" and "Երևան" are links (see the template comment on why), so the
    // global `a { color: ... }` rule was winning over this heading's white and
    // making only those two look dimmed next to the plain-text "Կայք" heading.
    a {
      color: inherit;

      &:hover {
        color: var(--color-accent);
      }
    }

    // The chevron. A plain border/rotate shape rather than an icon import —
    // this is the only place on the page that needs one.
    &::after {
      content: '';
      flex-shrink: 0;
      width: 8px;
      height: 8px;
      border-right: 2px solid currentColor;
      border-bottom: 2px solid currentColor;
      transform: rotate(45deg);
      transition: transform var(--transition);
    }
  }

  &__col[open] &__heading::after {
    transform: rotate(225deg);
  }

  &__list {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin-top: var(--space-2);

    a {
      color: rgba(255, 255, 255, 0.7);
      font-size: 0.9rem;

      &:hover {
        color: var(--color-accent);
      }
    }
  }

  @media (min-width: 640px) {
    &__heading {
      cursor: default;
      // The link stays clickable; only the toggle behaviour of the rest of
      // the bar is switched off, so the column reads as a plain static
      // heading again once there is room for all three side by side.
      pointer-events: none;

      a {
        pointer-events: auto;
      }

      &::after {
        display: none;
      }
    }
  }

  &__bottom {
    margin-top: var(--space-6);
    padding-top: var(--space-4);
    border-top: 1px solid rgba(255, 255, 255, 0.12);
    font-size: 0.85rem;
    color: rgba(255, 255, 255, 0.6);

    p {
      margin: 0;
    }
  }
}
</style>
