<script setup lang="ts">
import { SITE_NAME } from '~/constants/site'
import { driverAuthRepository, isApiEnabled } from '~/repositories'
import { useDriverAuthStore } from '~/stores/driverAuth'
import { extractErrorMessage } from '~/utils/errors'
import { armenianPhoneInputValue } from '~/utils/formatPhone'
import { isPhone, required, validateField } from '~/utils/validators'

/**
 * Driver login: phone + password, submitted together.
 *
 * This was a two-step Telegram OTP form. The password that replaced it is
 * still delivered over Telegram, but only once — see
 * `docs/auth-and-security.md`. What is gone from this page is the resend
 * timer, the "change phone number" step back, and the state where a driver is
 * halfway logged in.
 */
// An already-signed-in driver never sees this form. In middleware, not in a
// top-level `await navigateTo(...)` here — that version could silently fail to
// navigate; see middleware/driver-auth.ts for the mechanism.
definePageMeta({ middleware: 'driver-guest' })

useSeoMetaData({
  title: `Վարորդի մուտք | ${SITE_NAME}`,
  description: 'Մուտք գործեք Ձեր էվակուատորի պրոֆիլը խմբագրելու համար։',
  path: '/login',
  noindex: true,
})

const driverAuth = useDriverAuthStore()
const apiEnabled = isApiEnabled()

// Pre-filled and locked to +374 — must match the same exact +374XXXXXXXX
// shape stored at registration, since the backend looks the driver up by an
// exact phone string match.
const phone = ref('+374')
const phoneModel = computed<string>({
  get: () => phone.value,
  set: (value) => {
    phone.value = armenianPhoneInputValue(value)
  },
})
const password = ref('')
const submitting = ref(false)
const error = ref('')

async function submit(): Promise<void> {
  error.value = ''

  // Only shape checks, and only the two that stop a request we know cannot
  // succeed. No minimum length: this form has to accept whatever password
  // exists on the account, including one issued under an older rule.
  const localError =
    validateField(phone.value, [isPhone()]) ??
    validateField(password.value, [required('Մուտքագրեք գաղտնաբառը')])
  if (localError) {
    error.value = localError
    return
  }

  submitting.value = true
  try {
    const session = await driverAuthRepository.login(phone.value.trim(), password.value)
    driverAuth.login(session)
  } catch (err) {
    error.value = extractErrorMessage(err, 'Մուտք գործել չհաջողվեց, փորձեք կրկին')
    return
  } finally {
    submitting.value = false
  }

  // Outside the try, deliberately. Only the credential check belongs in there:
  // a navigation that fails or is redirected must not be reported as "Մուտք
  // գործել չհաջողվեց", which would tell a driver whose session was in fact
  // created that their password was wrong.
  //
  // Straight to the dashboard either way — when `mustChangePassword` is set,
  // the dashboard opens its own dialog over the top. A separate
  // "/change-password" route would be a second place to guard, and a driver
  // could simply not go to it.
  //
  // `replace`: the form must not sit in history behind the dashboard, or Back
  // returns to it and `driver-guest` bounces the driver forward again.
  await navigateTo('/dashboard', { replace: true })
}
</script>

<template>
  <div class="container login-page">
    <div class="login-card">
      <h1>Վարորդի մուտք</h1>

      <EmptyState
        v-if="!apiEnabled"
        title="Backend API-ն միացված չէ"
        description="Այս էջն աշխատում է միայն իրական backend-ի հետ։"
        icon="info"
      />

      <template v-else>
        <p class="login-card__hint">
          Մուտք գործեք Ձեր հեռախոսահամարով և գաղտնաբառով։ Գաղտնաբառը ուղարկվել է Ձեր Telegram-ին
          պրոֆիլի հաստատումից հետո։
        </p>

        <form class="login-form" @submit.prevent="submit">
          <AppInput
            v-model="phoneModel"
            type="tel"
            label="Հեռախոսահամար"
            placeholder="+37491000001"
            required
            :maxlength="12"
          />
          <AppInput v-model="password" type="password" label="Գաղտնաբառ" required />
          <p v-if="error" class="login-error">{{ error }}</p>
          <AppButton type="submit" variant="success" block :disabled="submitting">
            {{ submitting ? 'Ստուգվում է…' : 'Մուտք' }}
          </AppButton>
        </form>

        <!-- There is no self-service reset, deliberately: the only channel we
             could send one through is Telegram, and tapping a Telegram link
             proves possession of a link, not of an identity (see
             docs/auth-and-security.md). So the recovery path is a human one,
             and this line is what tells a locked-out driver that. -->
        <p class="login-card__footnote">
          Գաղտնաբառը մոռացե՞լ եք, կամ դեռ չեք ստացել՝ դիմեք ադմինիստրատորին։
        </p>
      </template>
    </div>
  </div>
</template>

<style scoped lang="scss">
.login-page {
  display: flex;
  justify-content: center;
  padding: var(--space-7) var(--space-4);
}

.login-card {
  width: 100%;
  max-width: 420px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-6);

  h1 {
    margin-bottom: var(--space-3);
  }

  &__hint {
    color: var(--color-text-secondary);
    font-size: 0.9rem;
    margin-bottom: var(--space-4);
  }

  &__footnote {
    margin: var(--space-4) 0 0;
    font-size: 0.82rem;
    line-height: 1.5;
    color: var(--color-text-muted);
  }
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.login-error {
  color: var(--color-danger);
  margin: 0;
  font-size: 0.9rem;
}
</style>
