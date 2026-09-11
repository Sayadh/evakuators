<script setup lang="ts">
/**
 * Platform length × width, as two number-only fields.
 *
 * This replaced a single free-text box that asked for `"5.5 մ × 2.2 մ"`. That
 * asked the driver to produce a *format* — the `×` (not `x`), the `մ`, the
 * spacing — when all we ever wanted was two numbers, and it meant a regex
 * validator, a parser, and a string column that had to be turned back into the
 * two floats the profile actually stores. Two inputs delete all of that: the
 * separator and the unit are printed by the UI, and the numbers are numbers all
 * the way down to Postgres.
 *
 * Same reasoning, and the same shape, as the working-hours pair
 * (two `<input type="time">` rather than one "09:00 – 21:00" text box).
 *
 * Shared between the registration form and the driver dashboard for the reason
 * ServiceAreaPicker is shared: what a driver can enter at sign-up and what they
 * can change afterwards must not be able to drift apart.
 */
interface Props {
  length: string
  width: string
  label?: string
  error?: string
}

const props = withDefaults(defineProps<Props>(), {
  label: undefined,
  error: '',
})

defineEmits<{
  'update:length': [value: string]
  'update:width': [value: string]
}>()

const { t } = useI18n()

// `withDefaults` can only default a prop to a plain literal, not to a
// translated string built by `useI18n()`, which does not exist yet outside
// `setup()` — see AppSelect.vue for the same fix on the same problem.
const effectiveLabel = computed(() => props.label ?? t('platformDimensionsInput.label'))
</script>

<template>
  <div class="dimensions">
    <p class="dimensions__label">{{ effectiveLabel }}</p>

    <div class="dimensions__row">
      <AppInput
        :model-value="length"
        type="number"
        placeholder="5.5"
        :aria-label="t('platformDimensionsInput.lengthAria')"
        class="dimensions__field"
        @update:model-value="$emit('update:length', $event)"
      />
      <span class="dimensions__separator" aria-hidden="true">×</span>
      <AppInput
        :model-value="width"
        type="number"
        placeholder="2.2"
        :aria-label="t('platformDimensionsInput.widthAria')"
        class="dimensions__field"
        @update:model-value="$emit('update:width', $event)"
      />
      <span class="dimensions__unit">{{ t('units.metre') }}</span>
    </div>

    <p class="dimensions__hint">{{ t('platformDimensionsInput.hint') }}</p>
    <p v-if="error" class="dimensions__error" role="alert">{{ error }}</p>
  </div>
</template>

<style scoped lang="scss">
.dimensions {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);

  &__label {
    margin: 0;
    font-size: 0.9rem;
    font-weight: 600;
  }

  &__row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  &__field {
    // Wide enough for "12.5" and no wider — a full-width box invites a
    // sentence, two short ones read as "put a number here".
    flex: 0 1 7rem;
    min-width: 0;
  }

  &__separator,
  &__unit {
    color: var(--color-text-secondary);
    font-size: 1rem;
    flex-shrink: 0;
  }

  &__hint {
    margin: 0;
    font-size: 0.8rem;
    color: var(--color-text-muted);
  }

  &__error {
    margin: 0;
    font-size: 0.82rem;
    color: var(--color-danger);
  }
}
</style>
