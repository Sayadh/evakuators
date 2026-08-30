<script setup lang="ts">
import { useCookieConsentStore } from '~/stores/cookieConsent'
import { isAdminRoute } from '~/utils/isAdminRoute'

/**
 * The one gate GA4/Ads and the Meta Pixel both wait on — see
 * `stores/cookieConsent.ts`. Mounted once in `layouts/default.vue`, so
 * `/admin` is excluded here rather than by not mounting it there: the admin
 * panel shares that same layout, and this is the one place that already
 * knows the boundary (`isAdminRoute`), the same predicate
 * `plugins/gtag-gate.client.ts` and `plugins/meta-pixel.client.ts` gate on.
 *
 * Equally-weighted «Ընդունել»/«Մերժել» on purpose — not a primary button next
 * to a muted text link. Either answer is one tap, and neither reads as the
 * "wrong" choice. The backdrop is purely visual (`pointer-events: none`) —
 * it dims the page to draw the eye to the banner, it does not turn this into
 * a click-blocking modal; a visitor can still use the page before answering.
 */
const store = useCookieConsentStore()
const route = useRoute()

const visible = computed(() => store.status === 'pending' && !isAdminRoute(route.path))
</script>

<template>
  <div v-if="visible" class="cookie-consent-backdrop" aria-hidden="true" />
  <div v-if="visible" class="cookie-consent" role="dialog" aria-label="Cookie-ների մասին տեղեկացում">
    <p class="cookie-consent__text">
      Այս կայքն օգտագործում է cookie-ներ՝ այցելուների վիճակագրության և գովազդի
      արդյունավետության չափման համար։ Մանրամասները՝
      <NuxtLink to="/privacy" class="cookie-consent__link">
        Գաղտնիության քաղաքականությունում
      </NuxtLink>։
    </p>
    <div class="cookie-consent__actions">
      <AppButton variant="ghost" size="md" @click="store.reject()">Մերժել</AppButton>
      <AppButton variant="primary" size="md" @click="store.accept()">Ընդունել</AppButton>
    </div>
  </div>
</template>

<style scoped lang="scss">
.cookie-consent-backdrop {
  position: fixed;
  inset: 0;
  z-index: 59;
  background: rgba(13, 33, 54, 0.4);
  pointer-events: none;
}

.cookie-consent {
  position: fixed;
  left: var(--space-4);
  right: var(--space-4);
  bottom: var(--space-4);
  z-index: 60;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  max-width: var(--container-width);
  margin-inline: auto;
  padding: var(--space-4) var(--space-5);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);

  &__text {
    flex: 1 1 260px;
    margin: 0;
    font-size: 0.9rem;
    line-height: 1.5;
    color: var(--color-text-secondary);
  }

  &__link {
    color: var(--color-primary);
    font-weight: 600;
  }

  &__actions {
    display: flex;
    flex-shrink: 0;
    gap: var(--space-3);
  }

  @media (max-width: 640px) {
    left: var(--space-3);
    right: var(--space-3);
    bottom: var(--space-3);
    padding: var(--space-4);
    flex-direction: column;
    align-items: stretch;
    justify-content: flex-start;
    gap: var(--space-3);

    &__actions {
      :deep(.app-button) {
        flex: 1;
      }
    }
  }
}
</style>
