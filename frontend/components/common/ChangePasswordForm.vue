<script setup lang="ts">
import { driverAuthRepository } from '~/repositories'
import { useDriverAuthStore } from '~/stores/driverAuth'
import { extractErrorMessage } from '~/utils/errors'
import { isPassword, required, validateField } from '~/utils/validators'

/**
 * The change-password form, used in both places a driver can change one: the
 * blocking screen after a first login with a temporary password, and the
 * voluntary section further down the dashboard.
 *
 * One component for both, because the rules (current password required, new
 * one at least PASSWORD_MIN_LENGTH, typed twice) are the same in both — and the
 * forced one is the copy that gets exercised least and would rot first if it
 * were its own implementation. Only the wording differs, via `forced`.
 *
 * Clearing the store flag is done here rather than left to the parent, so the
 * "password changed" and "stop forcing the change" facts can never be updated
 * separately. The parent only hears that it happened.
 */
interface Props {
  /**
   * True when this is the mandatory first change. Changes the copy only — the
   * request and the validation are identical, and the blocking itself is the
   * parent's job (it decides whether to render anything else at all).
   */
  forced?: boolean
}

withDefaults(defineProps<Props>(), { forced: false })

const emit = defineEmits<{ changed: [] }>()

const driverAuth = useDriverAuthStore()

const currentPassword = ref('')
const newPassword = ref('')
const repeatPassword = ref('')
const submitting = ref(false)
const error = ref('')
const success = ref(false)

async function submit(): Promise<void> {
  error.value = ''
  success.value = false

  const localError =
    validateField(currentPassword.value, [required('Մուտքագրեք ընթացիկ գաղտնաբառը')]) ??
    validateField(newPassword.value, [isPassword()])
  if (localError) {
    error.value = localError
    return
  }

  // Checked here and nowhere else: the API never sees the repeat, because a
  // second copy of the same value proves nothing to the server. It exists to
  // catch a typo in a field the driver cannot read back.
  if (newPassword.value !== repeatPassword.value) {
    error.value = 'Գաղտնաբառերը չեն համընկնում'
    return
  }

  // Not a security rule (the backend does not enforce it) but a usability one:
  // "changed" that changes nothing would clear the forced dialog and leave the
  // driver still using the password that was mailed to them over Telegram.
  if (newPassword.value === currentPassword.value) {
    error.value = 'Նոր գաղտնաբառը պետք է տարբերվի ընթացիկից'
    return
  }

  submitting.value = true
  try {
    await driverAuthRepository.changePassword(currentPassword.value, newPassword.value)
    driverAuth.markPasswordChanged()
    currentPassword.value = ''
    newPassword.value = ''
    repeatPassword.value = ''
    success.value = true
    emit('changed')
  } catch (err) {
    error.value = extractErrorMessage(err, 'Գաղտնաբառը փոխել չհաջողվեց, փորձեք կրկին')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <form class="change-password" @submit.prevent="submit">
    <p v-if="forced" class="change-password__intro">
      Ձեր ընթացիկ գաղտնաբառը ժամանակավոր է և ուղարկվել է Telegram-ով։ Շարունակելու համար սահմանեք
      Ձեր սեփական գաղտնաբառը։
    </p>

    <AppInput
      v-model="currentPassword"
      type="password"
      :label="forced ? 'Ժամանակավոր գաղտնաբառ' : 'Ընթացիկ գաղտնաբառ'"
      required
    />
    <AppInput v-model="newPassword" type="password" label="Նոր գաղտնաբառ" required />
    <AppInput v-model="repeatPassword" type="password" label="Կրկնեք նոր գաղտնաբառը" required />

    <p v-if="error" class="change-password__error" role="alert">{{ error }}</p>
    <p v-else-if="success" class="change-password__success" role="status">
      Գաղտնաբառը փոխվեց։
    </p>

    <AppButton type="submit" variant="success" block :disabled="submitting">
      {{ submitting ? 'Պահպանվում է…' : 'Պահպանել գաղտնաբառը' }}
    </AppButton>
  </form>
</template>

<style scoped lang="scss">
.change-password {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);

  &__intro {
    margin: 0;
    font-size: 0.9rem;
    line-height: 1.55;
    color: var(--color-text-secondary);
  }

  &__error {
    margin: 0;
    font-size: 0.9rem;
    color: var(--color-danger);
  }

  &__success {
    margin: 0;
    font-size: 0.9rem;
    color: var(--color-success);
  }
}
</style>
