<script setup lang="ts">
/**
 * «Կայքի դիզայն» (2026-11-18): the site-wide design switch — see
 * composables/useSiteDesign.ts for what each design shows. Saved on the
 * backend (site-settings); visitors get it on their next page load.
 */
import { siteSettingsRepository } from '~/repositories/siteSettings.repository'
import type { SiteDesign } from '~/composables/useSiteDesign'
import { formatClockTime } from '~/utils/formatters'
import { apiErrorText } from '~/utils/opsDispatchLabels'

const state = useSiteDesignState()
const saving = ref(false)
const error = ref<string | null>(null)
const savedAt = ref<string | null>(null)

const OPTIONS: { value: SiteDesign; title: string; text: string }[] = [
  { value: 1, title: 'Դիզայն 1', text: '«Ազատ երթուղիներ» և «Գտնել մոտակա էվակուատորները» կոճակներ, հեռախոսահամարը՝ եզրագծով կոճակ' },
  {
    value: 2,
    title: 'Դիզայն 2',
    text: 'Հեռախոսահամարը՝ գլխավոր մեծ դեղին կոճակ, այդ երկու կոճակները թաքցված են բոլոր էջերից, «Զանգահարել» բաններներ, զանգի կոճակ հեռախոսում բոլոր էջերում',
  },
]

async function choose(design: SiteDesign) {
  if (design === state.value || saving.value) return
  const ok = await confirmDialog({
    title: `Միացնե՞լ դիզայն ${design}-ը`,
    message: 'Փոփոխությունը կերևա բոլոր այցելուներին՝ էջը նորից բացելիս (մի քանի վայրկյանում)։',
    confirmLabel: `Միացնել դիզայն ${design}`,
    cancelLabel: 'Ոչ',
  })
  if (!ok) return
  saving.value = true
  error.value = null
  try {
    const result = await siteSettingsRepository.setDesign(design)
    state.value = result.design
    savedAt.value = formatClockTime(new Date())
  } catch (e) {
    error.value = apiErrorText(e, 'Պահպանել չհաջողվեց։')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="site-design">
    <div class="site-design__options" role="radiogroup" aria-label="Կայքի դիզայն">
      <button
        v-for="option in OPTIONS"
        :key="option.value"
        type="button"
        role="radio"
        class="site-design__option"
        :class="{ on: state === option.value }"
        :aria-checked="state === option.value"
        :disabled="saving"
        @click="choose(option.value)"
      >
        <strong>{{ option.title }} <AppBadge v-if="state === option.value" variant="success">Միացված է</AppBadge></strong>
        <span>{{ option.text }}</span>
      </button>
    </div>
    <p v-if="savedAt" class="site-design__ok" role="status">Պահպանված է ({{ savedAt }})։</p>
    <p v-if="error" class="site-design__error" role="alert">{{ error }}</p>
  </div>
</template>

<style scoped lang="scss">
.site-design {
  display: grid;
  gap: var(--space-2);

  &__options {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: var(--space-3);
  }

  &__option {
    display: grid;
    gap: 6px;
    text-align: left;
    padding: var(--space-3) var(--space-4);
    border: 2px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    font: inherit;
    cursor: pointer;
    transition: border-color var(--transition), background var(--transition);

    strong {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      font-size: 1rem;
    }
    span {
      font-size: 0.85rem;
      color: var(--color-text-secondary);
    }
    &:hover:not(:disabled) {
      border-color: var(--color-primary);
    }
    &.on {
      border-color: var(--color-primary);
      background: var(--color-primary-bg, #e8eef6);
    }
    &:disabled {
      cursor: progress;
    }
  }

  &__ok {
    margin: 0;
    color: var(--color-success);
    font-size: 0.85rem;
  }
  &__error {
    margin: 0;
    color: var(--color-danger, #b42318);
  }
}
</style>
