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
 * ## Links, not a `<select>` — and the panel is CSS-hidden, not `v-if`
 *
 * Each language is a real `<a href>` to the same page's other URL, which is
 * what `switchLocalePath` returns. A dropdown that navigated in JavaScript
 * would be invisible to a crawler; these are three crawlable links between the
 * three versions of the page, backing up the `hreflang` tags in the head.
 *
 * That is also why the collapsed panel is hidden with `visibility`/`opacity`
 * rather than removed with `v-if`: all three anchors stay in the rendered HTML
 * whether or not anyone opens the menu, so the crawlable-links property
 * survives the compact presentation. `visibility: hidden` is what keeps them
 * out of the tab order in the meantime — `opacity: 0` alone would leave three
 * invisible tab stops in the header.
 *
 * `localeRoute`'s answer is per-page: on `/regions/kotayk/abovyan` it points at
 * `/ru/regions/kotayk/abovyan`, not at the Russian home page. Landing a reader
 * on the front page because they wanted this page in Russian is the commonest
 * way a language switcher gets this wrong.
 */
interface Props {
  /**
   * `dropdown` — a compact trigger showing the active language, and a panel
   * with the three. Built for the header, where three languages spelled out
   * side by side cost more horizontal room than the nav itself; kept for any
   * future spot with the same tight-strip constraint.
   *
   * `inline` (default) — all three at once. Used in the footer's bottom bar,
   * which has the horizontal room a popup doesn't need to save, and it would
   * suit the mobile drawer's own vertical space were it ever needed there
   * again.
   */
  variant?: 'dropdown' | 'inline'
}

withDefaults(defineProps<Props>(), { variant: 'inline' })

const { locale, locales, t } = useI18n()
const switchLocalePath = useSwitchLocalePath()
const route = useRoute()

const options = computed(() =>
  (locales.value as { code: string; name?: string }[]).map((entry) => ({
    code: entry.code,
    label: entry.name ?? entry.code,
    to: switchLocalePath(entry.code as 'hy' | 'ru' | 'en'),
  })),
)

/** Falls back to the first locale rather than rendering an empty trigger */
const activeOption = computed(
  () => options.value.find((option) => option.code === locale.value) ?? options.value[0],
)

const open = ref(false)
const root = ref<HTMLElement | null>(null)
const trigger = ref<HTMLButtonElement | null>(null)

function close(): void {
  open.value = false
}

/**
 * Clicks on the trigger itself never reach this — it lives inside `root`, so
 * the containment test below passes and `toggle` alone decides. That is what
 * stops the click that OPENS the panel from closing it again on its way up to
 * the document.
 */
function onDocumentClick(event: MouseEvent): void {
  if (root.value?.contains(event.target as Node)) return
  close()
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return
  close()
  // Focus goes back where it came from, or Escape would drop the reader at the
  // top of the document.
  trigger.value?.focus()
}

watch(open, (isOpen) => {
  if (isOpen) {
    document.addEventListener('click', onDocumentClick)
    document.addEventListener('keydown', onKeydown)
  } else {
    document.removeEventListener('click', onDocumentClick)
    document.removeEventListener('keydown', onKeydown)
  }
})

onBeforeUnmount(() => {
  document.removeEventListener('click', onDocumentClick)
  document.removeEventListener('keydown', onKeydown)
})

// Choosing a language navigates, and a panel still hanging open over the new
// page reads as a stuck menu. Watched on the route rather than handled on the
// link, so any navigation closes it — including the browser's back button.
watch(() => route.fullPath, close)
</script>

<template>
  <nav v-if="variant === 'inline'" class="lang lang--inline" :aria-label="t('lang.switch')">
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

  <div v-else ref="root" class="lang lang--dropdown">
    <button
      ref="trigger"
      type="button"
      class="lang__trigger"
      :class="{ 'lang__trigger--open': open }"
      :aria-label="t('lang.switch')"
      aria-haspopup="true"
      :aria-expanded="open"
      aria-controls="language-menu"
      @click="open = !open"
    >
      <span class="lang__current">{{ activeOption.code.toUpperCase() }}</span>
      <AppIcon name="chevron-down" :size="14" class="lang__chevron" />
    </button>

    <!-- Rendered whether or not it is open — see the note in the script about
         why this is CSS-hidden rather than v-if. -->
    <div
      id="language-menu"
      class="lang__menu"
      :class="{ 'lang__menu--open': open }"
      :aria-label="t('lang.switch')"
    >
      <NuxtLink
        v-for="option in options"
        :key="option.code"
        :to="option.to"
        class="lang__option"
        :class="{ 'lang__option--active': option.code === locale }"
        :hreflang="option.code"
        :aria-current="option.code === locale ? 'true' : undefined"
      >
        <span class="lang__option-code">{{ option.code.toUpperCase() }}</span>
        <span class="lang__option-name">{{ option.label }}</span>
        <AppIcon v-if="option.code === locale" name="check" :size="14" class="lang__option-check" />
      </NuxtLink>
    </div>
  </div>
</template>

<style scoped lang="scss">
.lang {
  &--dropdown {
    position: relative;
    display: inline-flex;
  }

  &__trigger {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    /* Reads as one small control rather than a button competing with
       «Գրանցել էվակուատոր» two slots to its right. */
    padding: var(--space-1) var(--space-2);
    border: 0;
    border-radius: var(--radius-full);
    background: none;
    color: var(--color-text-secondary);
    font-family: inherit;
    font-size: 0.8rem;
    font-weight: 700;
    letter-spacing: 0.03em;
    line-height: 1;
    cursor: pointer;
    transition: background var(--transition), color var(--transition);

    &:hover,
    &--open {
      background: rgba(20, 48, 79, 0.06);
      color: var(--color-primary);
    }
  }

  &__chevron {
    transition: transform var(--transition);
  }

  &__trigger--open &__chevron {
    transform: rotate(180deg);
  }

  &__menu {
    position: absolute;
    top: calc(100% + 8px);
    /* Right-aligned: the trigger sits near the right edge of the header, and a
       left-aligned panel would hang off the viewport on a narrow laptop. */
    right: 0;
    /* Above the header itself (z-index: 50), which is the only thing it can
       overlap. */
    z-index: 60;
    min-width: 168px;
    padding: 5px;
    display: flex;
    flex-direction: column;
    gap: 1px;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-lg);

    opacity: 0;
    /* Not `display: none` — the anchors have to stay in the HTML, and not
       `opacity` alone, which would leave them focusable while invisible. */
    visibility: hidden;
    transform: translateY(-4px);
    transition:
      opacity var(--transition),
      transform var(--transition),
      visibility var(--transition);

    &--open {
      opacity: 1;
      visibility: visible;
      transform: translateY(0);
    }
  }

  &__option {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-2);
    border-radius: var(--radius-sm);
    color: var(--color-text);
    font-size: 0.875rem;
    text-decoration: none;
    white-space: nowrap;
    transition: background var(--transition), color var(--transition);

    &:hover {
      background: rgba(20, 48, 79, 0.06);
    }

    &--active {
      color: var(--color-primary);
      font-weight: 600;
    }
  }

  /* The code is the quiet half: it identifies the row at a glance for someone
     who cannot read the script the name is written in. */
  &__option-code {
    min-width: 1.75em;
    color: var(--color-text-muted);
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.05em;
  }

  &__option--active &__option-code {
    color: var(--color-primary);
  }

  &__option-name {
    flex: 1;
  }

  &__option-check {
    color: var(--color-primary);
  }

  /* ── inline variant — the mobile drawer ─────────────────────────────── */

  &--inline {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
  }

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
