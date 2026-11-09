<script setup lang="ts">
import {
  LANGUAGE_PROMPT,
  LANGUAGE_PROMPT_COOKIE,
  LANGUAGE_PROMPT_COOKIE_MAX_AGE,
  type PromptedLocale,
  shouldShowLanguagePrompt,
} from '~/constants/languagePrompt'

/**
 * «Կայքը հասանելի է հայերենով» — asked once, to a visitor who arrives on a
 * Russian or English page (from a search result or a shared link).
 *
 * ## When it opens, and when it does not
 *
 * Only on LANDING: it is decided in `onMounted` of the layout, which runs once
 * per page load. Someone who opens the Armenian site and then picks «RU» in the
 * switcher has already chosen, and is never asked. Any answer — switch, stay,
 * or closing it — is remembered in a cookie for 24 hours, so it is asked at
 * most once a day.
 *
 * Client-only by construction (nothing renders until `onMounted`), so the
 * server-rendered Russian and English pages crawlers index are unchanged.
 */
const { locale } = useI18n()
const route = useRoute()
const switchLocalePath = useSwitchLocalePath()

const open = ref(false)
const shownFor = ref<PromptedLocale>('ru')
/** Set when the visitor picked Armenian, so closing is not ALSO recorded as "stay" */
let switching = false

const answer = useCookie<'hy' | 'stay' | null>(LANGUAGE_PROMPT_COOKIE, {
  maxAge: LANGUAGE_PROMPT_COOKIE_MAX_AGE,
  sameSite: 'lax',
  path: '/',
  default: () => null,
})

function remember(choice: 'hy' | 'stay'): void {
  answer.value = choice
}

onMounted(() => {
  const input = { locale: locale.value, path: route.path, answered: answer.value !== null }
  if (!shouldShowLanguagePrompt(input)) return
  shownFor.value = input.locale
  open.value = true
})

const text = computed(() =>
  LANGUAGE_PROMPT.text.replace('{language}', LANGUAGE_PROMPT.languageNames[shownFor.value]),
)

async function switchToArmenian(): Promise<void> {
  switching = true
  remember('hy')
  open.value = false
  await navigateTo(switchLocalePath('hy'))
}

// Closing by the ✕, the overlay or Escape is an answer too: "stay".
watch(open, (isOpen, wasOpen) => {
  if (wasOpen && !isOpen && !switching) remember('stay')
})
</script>

<template>
  <AppModal v-model="open">
    <div class="language-prompt" lang="hy">
      <span class="language-prompt__flag" aria-hidden="true">🇦🇲</span>
      <h2 class="language-prompt__title">{{ LANGUAGE_PROMPT.title }}</h2>
      <p class="language-prompt__text">{{ text }}</p>

      <div class="language-prompt__actions">
        <AppButton variant="accent" size="lg" block @click="switchToArmenian">
          {{ LANGUAGE_PROMPT.switchLabel }}
        </AppButton>
        <button
          type="button"
          class="language-prompt__stay"
          :lang="shownFor"
          @click="open = false"
        >
          {{ LANGUAGE_PROMPT.stayLabels[shownFor] }}
        </button>
      </div>
    </div>
  </AppModal>
</template>

<style scoped lang="scss">
.language-prompt {
  text-align: center;
  padding: var(--space-2) 0 0;

  &__flag {
    display: block;
    font-size: 2.5rem;
    line-height: 1;
    margin-bottom: var(--space-3);
  }

  &__title {
    font-size: 1.35rem;
    margin-bottom: var(--space-2);
  }

  &__text {
    color: var(--color-text-secondary);
    font-size: 1rem;
    line-height: 1.5;
    margin: 0 0 var(--space-5);
  }

  &__actions {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  &__stay {
    background: none;
    border: 0;
    padding: var(--space-3);
    color: var(--color-text-secondary);
    font: inherit;
    font-size: 0.95rem;
    cursor: pointer;
    text-decoration: underline;
    text-underline-offset: 3px;

    &:hover {
      color: var(--color-text);
    }
  }
}
</style>
