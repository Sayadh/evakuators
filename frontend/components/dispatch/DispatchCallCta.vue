<script setup lang="ts">
import { CONTACT_PHONE } from '~/constants/site'
import { trackDispatchCallClick } from '~/utils/analytics'
import { getPhoneHref } from '~/utils/formatPhone'

/**
 * «Զանգահարեք մեզ, մենք կգտնենք ձեզ համար» — the operator's own number.
 *
 * ## What this is for
 *
 * Most people who need a tow truck do not want to compare six listings; they
 * want one number. Until now the site had no answer for them — the whole page
 * is a chooser — so they either picked at random or left. This is the other
 * door: the dispatcher takes the call, and rings the right driver himself from
 * `/admin/dispatch`.
 *
 * ## Why one component with variants rather than four buttons
 *
 * Same reason `usePhoneActions` exists. Four copies of a `tel:` link means
 * four places for the wording to drift, and — the part that actually bites —
 * four chances to forget the tracking, or the `dispatch-cta__call` class the
 * Meta Pixel buckets on (`utils/pixelContactSource.ts`). Here a new placement
 * is one more `variant`, counted and bucketed by construction.
 *
 * ## Why it is careful not to shout
 *
 * The site's promise, printed in the hero, is «Ուղիղ կապ վարորդի հետ», and
 * that promise is what drivers pay for. A louder «call us» than the driver
 * cards themselves would be selling the subscription and undercutting it in
 * the same viewport. So: an outline button on the hero rather than a second
 * filled one, a band that sits BESIDE the listing instead of above its
 * heading, and a sticky bar that stays out of the way until the visitor has
 * scrolled past the first few drivers.
 *
 * What keeps that honest is `DispatchReferral`: every call the dispatcher
 * passes on is recorded against a driver, so "we answer the phone for you" is
 * a number a driver can be shown, not a claim.
 *
 * ## No Meta Pixel call here
 *
 * `plugins/meta-pixel.client.ts` already tracks every `tel:` click through one
 * document-level listener, and it will find this anchor's class on its own.
 * Firing `trackMetaPixelContact` here as well would send Meta two `Contact`
 * events for one press — the same trap documented in `usePhoneActions`.
 */
interface Props {
  /**
   * Where this instance sits. Decides the layout AND travels with the
   * analytics event, which is the only way to learn which placements are worth
   * the space they take.
   *
   * - `header` — icon + number in the top bar, on every page.
   * - `hero`   — under the homepage search, on the dark gradient.
   * - `banner` — a card in the reading flow of a listing page.
   * - `bar`    — the floating call button on listing pages, phones only.
   */
  variant: 'header' | 'hero' | 'banner' | 'bar'
}

const props = defineProps<Props>()

const phoneHref = getPhoneHref(CONTACT_PHONE)

function onClick(): void {
  trackDispatchCallClick(props.variant)
}
</script>

<template>
  <!-- Header: the number itself is the label. No «Զանգահարել» word — the bar
       already carries an accent «Գրանցվել», and two competing calls to action
       in a 64px row means neither reads as the primary one. -->
  <a
    v-if="variant === 'header'"
    :href="phoneHref"
    class="dispatch-cta__call dispatch-cta__call--header"
    :aria-label="`Զանգահարել մեզ՝ ${CONTACT_PHONE}`"
    @click="onClick"
  >
    <AppIcon name="phone" :size="18" />
    <span class="dispatch-cta__number">{{ CONTACT_PHONE }}</span>
  </a>

  <!-- One thumb, one target. A full-width strip with a sentence in it was
       covering a band of the listing on every phone, at a moment when the
       reader is one-handed and in a hurry — and the sentence was doing no work
       a round green phone button does not do. The words live on the banner
       further up the same page, where there is room to read them. -->
  <a
    v-else-if="variant === 'bar'"
    :href="phoneHref"
    class="dispatch-cta__call dispatch-cta__fab"
    :aria-label="`Զանգահարել մեզ՝ ${CONTACT_PHONE}`"
    :title="`Զանգահարել մեզ՝ ${CONTACT_PHONE}`"
    @click="onClick"
  >
    <AppIcon name="phone" :size="26" />
  </a>

  <div v-else class="dispatch-cta" :class="`dispatch-cta--${variant}`">
    <div class="dispatch-cta__text">
      <strong class="dispatch-cta__title">Չգիտե՞ք որ մեքենան ընտրել</strong>
      <span class="dispatch-cta__subtitle">
        Զանգահարեք մեզ՝ մեր մասնագետը ձեզ համար կընտրի համապատասխան էվակուատորը
      </span>
    </div>

    <!-- The number IS the label. «Զանգահարել մեզ» was already said one line
         above it, in the subtitle, and a button that repeats the sentence
         above it reads as filler; the number reads as a phone call. -->
    <a
      :href="phoneHref"
      class="dispatch-cta__call"
      :aria-label="`Զանգահարել մեզ՝ ${CONTACT_PHONE}`"
      @click="onClick"
    >
      <AppIcon name="phone" :size="20" />
      <span class="dispatch-cta__number">{{ CONTACT_PHONE }}</span>
    </a>
  </div>
</template>

<style scoped lang="scss">
.dispatch-cta {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);

  &__text {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  &__title {
    font-size: 1.05rem;
    font-weight: 700;
  }

  &__subtitle {
    font-size: 0.9rem;
    line-height: 1.4;
  }

  &__call {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-5);
    border-radius: var(--radius-md);
    font-weight: 700;
    white-space: nowrap;
    transition: background var(--transition), filter var(--transition);
  }

  &__number {
    font-variant-numeric: tabular-nums;
  }

  /* ---- hero: on the dark gradient, under the search box ---- */
  &--hero {
    align-items: center;
    text-align: center;
    margin-top: var(--space-5);
    color: rgba(255, 255, 255, 0.92);

    .dispatch-cta__subtitle {
      color: rgba(255, 255, 255, 0.78);
    }

    /* Outline, not filled. The search box above it is the primary action on
       this page, and a second solid button directly under it would read as the
       recommended one. */
    .dispatch-cta__call {
      border: 2px solid rgba(255, 255, 255, 0.85);
      color: #fff;

      &:hover {
        background: rgba(255, 255, 255, 0.14);
        color: #fff;
      }
    }
  }

  /* ---- banner: a card inside a listing page ---- */
  &--banner {
    padding: var(--space-4);
    border-radius: var(--radius-lg, var(--radius-md));
    background: var(--color-surface);
    border: 1px solid var(--color-border, rgba(16, 30, 46, 0.1));
    box-shadow: var(--shadow-sm);

    .dispatch-cta__subtitle {
      color: var(--color-text-secondary);
    }

    .dispatch-cta__call {
      background: var(--color-success);
      color: #fff;

      &:hover {
        background: #178a49;
        color: #fff;
      }
    }

    /* Side by side once there is width for it, so the block costs one row of
       vertical space on a desktop listing instead of three. */
    @media (min-width: 768px) {
      flex-direction: row;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-5);
    }
  }

}

/**
 * The floating call button. Its own element, not inside `.dispatch-cta`.
 *
 * Bottom right because that is where a thumb rests on a phone held in one
 * hand, and 60px because that is comfortably past the 44px minimum a target
 * needs when the person tapping it is walking, or standing next to a car that
 * will not start.
 */
.dispatch-cta__fab {
  position: fixed;
  right: var(--space-4);
  bottom: calc(var(--space-4) + env(safe-area-inset-bottom));
  /* Below the cookie consent card and its overlay (59/60) on purpose: that
     banner is answered once and must stay tappable, this one is permanent. */
  z-index: 58;
  width: 60px;
  height: 60px;
  padding: 0;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--color-success);
  color: #fff;
  /* Stronger than the card shadows on the page: this floats above a scrolling
     list of white cards and has to read as detached from them, not as one more
     element in the flow. */
  box-shadow: 0 6px 20px rgba(16, 30, 46, 0.3);

  &:hover {
    background: #178a49;
    color: #fff;
  }

  /* Desktop has the header number and the banner; a floating button there
     would cover a listing nobody is scrolling with one hand. Matches the driver
     profile's own sticky bar breakpoint. */
  @media (min-width: 1024px) {
    display: none;
  }
}

/* Header variant is its own element, not inside .dispatch-cta */
.dispatch-cta__call--header {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-md);
  color: var(--color-primary);
  font-weight: 700;
  white-space: nowrap;
  transition: background var(--transition);

  &:hover {
    background: rgba(20, 48, 79, 0.06);
    color: var(--color-primary);
  }

  /* Icon only until there is room. Below this width the bar holds a logo, a
     burger and an accent «Գրանցվել» already; the number would push one of them
     onto a second line. */
  .dispatch-cta__number {
    display: none;

    @media (min-width: 768px) {
      display: inline;
    }
  }
}
</style>
