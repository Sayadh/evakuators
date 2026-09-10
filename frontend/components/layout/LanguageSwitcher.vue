<script setup lang="ts">
/**
 * Armenian / Русский / English.
 *
 * ## Why a switcher at all, when the browser knows the language
 *
 * Because `detectBrowserLanguage` is off, deliberately — see the i18n block in
 * `nuxt.config.ts`. An automatic redirect would bounce Googlebot between
 * versions and would send an Armenian driver whose phone is set to Russian to
 * the Russian site. So the choice is explicit, and this is where it is made.
 *
 * ## Links, not a `<select>`
 *
 * Each language is a real `<a href>` to the same page's other URL, which is
 * what `switchLocalePath` returns. A dropdown that navigated in JavaScript
 * would be invisible to a crawler; these are three crawlable links between the
 * three versions of the page, backing up the `hreflang` tags in the head.
 *
 * `localeRoute`'s answer is per-page: on `/regions/kotayk/abovyan` it points at
 * `/ru/regions/kotayk/abovyan`, not at the Russian home page. Landing a reader
 * on the front page because they wanted this page in Russian is the commonest
 * way a language switcher gets this wrong.
 */
const { locale, locales, t } = useI18n()
const switchLocalePath = useSwitchLocalePath()

const options = computed(() =>
  (locales.value as { code: string; name?: string }[]).map((entry) => ({
    code: entry.code,
    label: entry.name ?? entry.code,
    to: switchLocalePath(entry.code as 'hy' | 'ru' | 'en'),
  })),
)
</script>

<template>
  <nav class="lang" :aria-label="t('lang.switch')">
    <NuxtLink
      v-for="option in options"
      :key="option.code"
      :to="option.to"
      class="lang__item"
      :class="{ 'lang__item--active': option.code === locale }"
      :hreflang="option.code"
      :aria-current="option.code === locale ? 'true' : undefined"
    >
      {{ option.code.toUpperCase() }}
      <span class="lang__full">{{ option.label }}</span>
    </NuxtLink>
  </nav>
</template>

<style scoped lang="scss">
.lang {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);

  &__item {
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-sm, 6px);
    font-size: 0.85rem;
    font-weight: 700;
    color: var(--color-text-secondary);
    text-decoration: none;
    transition: background var(--transition), color var(--transition);

    &:hover {
      background: rgba(20, 48, 79, 0.06);
      color: var(--color-primary);
    }

    &--active {
      color: var(--color-primary);
      background: rgba(20, 48, 79, 0.08);
    }
  }

  /* The two-letter code is the control on a phone; the full name appears once
     there is room for it, because «Հայերեն» is what a reader recognises and
     "HY" is what fits. */
  &__full {
    display: none;

    @media (min-width: 1024px) {
      display: inline;
    }
  }
}
</style>
