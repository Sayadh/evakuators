<script setup lang="ts">
import type { DeactivationReason } from '~/types/subscription'

/**
 * Asks WHY before taking a driver off the site.
 *
 * Shared by `/admin` and `/admin/payments` — both had their own
 * `confirm()` — because the answer is not a note an admin writes to
 * themselves: it decides whether that driver can sign in again at all, and two
 * pages quietly disagreeing about the wording of that choice is how an admin
 * ends up banning someone they meant to chase for 3 000 ֏.
 *
 * Which is also why each option spells out its consequence rather than just
 * naming itself.
 */

interface Props {
  modelValue: boolean
  driverName?: string
  submitting?: boolean
  error?: string
}

withDefaults(defineProps<Props>(), {
  driverName: '',
  submitting: false,
  error: '',
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  confirm: [reason: DeactivationReason]
}>()

// Defaults to the recoverable one on purpose: it is both the common case and
// the one whose consequences are undoable by the driver alone, so a
// half-attention click lands on the harmless option.
const reason = ref<DeactivationReason>('UNPAID')

const OPTIONS: { value: DeactivationReason; label: string; consequence: string }[] = [
  {
    value: 'UNPAID',
    label: 'Չի կատարել վճարումը',
    consequence:
      'Վարորդը կկարողանա մուտք գործել, կտեսնի վճարման բլոկը և կկարողանա ինքը վերականգնել էջը։',
  },
  {
    value: 'OTHER',
    label: 'Այլ պատճառ',
    consequence:
      'Վարորդը մուտք գործել չի կարողանա։ Login-ի էջում կտեսնի կապի համարը և պետք է զանգահարի։',
  },
]
</script>

<template>
  <AppModal
    :model-value="modelValue"
    title="Ապաակտիվացման պատճառը"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <form class="deactivate-reason" @submit.prevent="emit('confirm', reason)">
      <p v-if="driverName" class="deactivate-reason__driver">{{ driverName }}</p>

      <label v-for="option in OPTIONS" :key="option.value" class="deactivate-reason__option">
        <input v-model="reason" type="radio" :value="option.value" name="deactivation-reason" >
        <span>
          <strong>{{ option.label }}</strong>
          <small>{{ option.consequence }}</small>
        </span>
      </label>

      <p v-if="error" class="deactivate-reason__error" role="alert">{{ error }}</p>

      <AppButton type="submit" variant="danger" block :disabled="submitting">
        {{ submitting ? 'Կատարվում է…' : 'Ապաակտիվացնել' }}
      </AppButton>
    </form>
  </AppModal>
</template>

<style scoped lang="scss">
.deactivate-reason {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);

  &__driver {
    margin: 0;
    font-weight: 600;
  }

  &__option {
    display: flex;
    align-items: flex-start;
    gap: var(--space-2);
    padding: var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    cursor: pointer;

    &:has(input:checked) {
      border-color: var(--color-primary);
      background: var(--color-bg);
    }

    input {
      margin-top: 3px;
    }

    span {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    small {
      color: var(--color-text-secondary);
      line-height: 1.4;
    }
  }

  &__error {
    margin: 0;
    color: var(--color-danger);
    font-size: 0.9rem;
  }
}
</style>
