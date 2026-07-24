<script setup lang="ts">
import { SITE_NAME } from '~/constants/site'
import { driverAuthRepository, isApiEnabled } from '~/repositories'
import { useDriverAuthStore } from '~/stores/driverAuth'
import { extractErrorMessage } from '~/utils/errors'
import { armenianPhoneInputValue } from '~/utils/formatPhone'

useSeoMetaData({
  title: `Վարորդի մուտք | ${SITE_NAME}`,
  description: 'Մուտք գործեք Ձեր էվակուատորի պրոֆիլը խմբագրելու համար։',
  path: '/login',
  noindex: true,
})

const driverAuth = useDriverAuthStore()
const apiEnabled = isApiEnabled()

if (import.meta.client && driverAuth.isLoggedIn) {
  await navigateTo('/dashboard')
}

type Step = 'phone' | 'code'
const step = ref<Step>('phone')
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
const code = ref('')
const submitting = ref(false)
const error = ref('')

// Mirrors the backend's 45s per-phone cooldown (see DriverAuthService) so the
// resend button visibly counts down instead of just erroring on click.
const RESEND_COOLDOWN_SECONDS = 45
const resendCooldown = ref(0)
let resendTimer: ReturnType<typeof setInterval> | undefined

function startResendCooldown(): void {
  resendCooldown.value = RESEND_COOLDOWN_SECONDS
  clearInterval(resendTimer)
  resendTimer = setInterval(() => {
    resendCooldown.value -= 1
    if (resendCooldown.value <= 0) clearInterval(resendTimer)
  }, 1000)
}

onUnmounted(() => clearInterval(resendTimer))

async function submitPhone(): Promise<void> {
  error.value = ''
  submitting.value = true
  try {
    await driverAuthRepository.requestCode(phone.value.trim())
    step.value = 'code'
    startResendCooldown()
  } catch (err) {
    error.value = extractErrorMessage(err, 'Կոդ ուղարկել չհաջողվեց, ստուգիր հեռախոսահամարը')
  } finally {
    submitting.value = false
  }
}

const resending = ref(false)
const resendSuccess = ref(false)

/** Requesting a new code also invalidates any earlier one still shown in Telegram (see backend) */
async function resendCode(): Promise<void> {
  if (resendCooldown.value > 0) return

  error.value = ''
  resendSuccess.value = false
  resending.value = true
  try {
    await driverAuthRepository.requestCode(phone.value.trim())
    code.value = ''
    resendSuccess.value = true
    startResendCooldown()
  } catch (err) {
    error.value = extractErrorMessage(err, 'Կոդ ուղարկել չհաջողվեց, փորձիր կրկին')
  } finally {
    resending.value = false
  }
}

async function submitCode(): Promise<void> {
  error.value = ''
  submitting.value = true
  try {
    const session = await driverAuthRepository.verifyCode(phone.value.trim(), code.value.trim())
    driverAuth.login(session)
    await navigateTo('/dashboard')
  } catch (err) {
    error.value = extractErrorMessage(err, 'Սխալ կոդ, փորձիր նորից')
  } finally {
    submitting.value = false
  }
}

function backToPhone(): void {
  step.value = 'phone'
  code.value = ''
  error.value = ''
  resendSuccess.value = false
  clearInterval(resendTimer)
  resendCooldown.value = 0
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
          Մուտք գործելու համար անհրաժեշտ է Telegram-ը կապակցված ունենալ (link-ը ստացել եք
          admin-ից պրոֆիլի հաստատումից հետո)։
        </p>

        <form v-if="step === 'phone'" class="login-form" @submit.prevent="submitPhone">
          <AppInput
            v-model="phoneModel"
            type="tel"
            label="Հեռախոսահամար"
            placeholder="+37491000001"
            required
          />
          <p v-if="error" class="login-error">{{ error }}</p>
          <AppButton type="submit" variant="success" block :disabled="submitting">
            {{ submitting ? 'Ուղարկվում է…' : 'Ուղարկել կոդ Telegram-ով' }}
          </AppButton>
        </form>

        <form v-else class="login-form" @submit.prevent="submitCode">
          <p class="login-card__hint">Կոդն ուղարկվեց Ձեր Telegram-ին։</p>
          <AppInput
            v-model="code"
            type="text"
            label="6-նիշանոց կոդ"
            placeholder="123456"
            required
          />
          <p v-if="error" class="login-error">{{ error }}</p>
          <p v-else-if="resendSuccess" class="login-success">Նոր կոդն ուղարկվեց Ձեր Telegram-ին։</p>
          <AppButton type="submit" variant="success" block :disabled="submitting">
            {{ submitting ? 'Ստուգվում է…' : 'Մուտք' }}
          </AppButton>
          <AppButton
            variant="outline"
            block
            type="button"
            :disabled="resending || resendCooldown > 0"
            @click="resendCode"
          >
            {{
              resending
                ? 'Ուղարկվում է…'
                : resendCooldown > 0
                  ? `Ուղարկել կրկին (${resendCooldown}վ)`
                  : 'Ուղարկել կոդը կրկին'
            }}
          </AppButton>
          <AppButton variant="ghost" block type="button" @click="backToPhone">
            Փոխել հեռախոսահամարը
          </AppButton>
        </form>
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

.login-success {
  color: var(--color-success);
  margin: 0;
  font-size: 0.9rem;
}
</style>
