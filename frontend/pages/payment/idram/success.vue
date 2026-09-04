<script setup lang="ts">
import { SITE_NAME } from '~/constants/site'
import { mySubscriptionsRepository } from '~/repositories'
import type { MySubscriptionStatus } from '~/types/subscription'
import { formatDateLong } from '~/utils/formatters'

/**
 * Where Idram sends the driver back after a successful payment (SUCCESS_URL).
 *
 * ## This page is not proof of anything
 *
 * It is a redirect the driver's own browser followed — anyone can open this
 * URL, and arriving here says nothing about whether money moved. The payment
 * is confirmed by Idram's server-to-server callback to RESULT_URL, verified by
 * checksum, and that is the only thing that grants anything.
 *
 * So this page asks OUR api what the truth is and shows that. Which also means
 * it has to tolerate arriving BEFORE the callback does — the two race, and the
 * browser usually wins by a moment. «Ստուգում ենք» is the honest answer then,
 * not «վճարված է».
 */
definePageMeta({ middleware: 'driver-auth' })

useSeoMetaData({
  title: `Վճարումը կատարվեց | ${SITE_NAME}`,
  description: 'Վճարման արդյունք',
  path: '/payment/idram/success',
  noindex: true,
})

const status = ref<MySubscriptionStatus | null>(null)
const loading = ref(true)

/**
 * Re-read a few times before giving up on seeing the confirmation.
 *
 * The callback is usually already in by the time this page renders, but it
 * travels between two servers while the driver travels between two pages, and
 * there is no ordering guarantee. A handful of polls a second apart turns "we
 * arrived first" from a confusing screen into a brief wait.
 */
const POLL_ATTEMPTS = 5
const POLL_INTERVAL_MS = 1500

async function waitForConfirmation(): Promise<void> {
  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
    try {
      status.value = await mySubscriptionsRepository.getStatus()
      // Covered and not locked means the callback landed and was accepted.
      if (status.value.status === 'paid' && !status.value.locked) break
    } catch {
      // Left to the next attempt. A failed read here is not worth an error
      // screen — the payment's fate does not depend on this page at all.
    }
    if (attempt < POLL_ATTEMPTS - 1) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
    }
  }
  loading.value = false
}

onMounted(() => {
  void waitForConfirmation()
})

const confirmed = computed(() => status.value?.status === 'paid' && !status.value.locked)
</script>

<template>
  <div class="container payment-result">
    <template v-if="loading">
      <h1>Ստուգում ենք վճարումը…</h1>
      <p>Խնդրում ենք սպասել մի քանի վայրկյան, չփակեք էջը։</p>
    </template>

    <template v-else-if="confirmed">
      <h1>Վճարումը կատարվեց ✓</h1>
      <p v-if="status?.paidUntil">
        Ձեր բաժանորդագրությունը գործում է մինչև
        <strong>{{ formatDateLong(status.paidUntil) }}</strong>։
      </p>
      <AppButton to="/dashboard">Անցնել իմ էջ</AppButton>
    </template>

    <!-- Not an error: the money may well have gone through and the
         confirmation simply has not reached us yet. Saying "failed" here would
         send a driver who has paid to pay again. -->
    <template v-else>
      <h1>Վճարումը դեռ հաստատված չէ</h1>
      <p>
        Եթե գումարը հանվել է, հաստատումը սովորաբար գալիս է մի քանի րոպեում։ Թարմացրեք էջը
        մի փոքր անց, իսկ եթե խնդիրը մնա՝ կապվեք մեզ հետ։
      </p>
      <AppButton to="/dashboard">Անցնել իմ էջ</AppButton>
    </template>
  </div>
</template>

<style scoped lang="scss">
.payment-result {
  max-width: 560px;
  padding-top: var(--space-7);
  padding-bottom: var(--space-8);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  align-items: flex-start;

  h1 {
    margin: 0;
    font-size: 1.4rem;
  }

  p {
    margin: 0;
    color: var(--color-text-secondary);
  }
}
</style>
