<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { CONTACT_PHONE, SITE_NAME } from '~/constants/site'
import { getPhoneHref } from '~/utils/formatPhone'

/**
 * Where Idram sends the driver back when a payment did not go through
 * (FAIL_URL).
 *
 * Nothing to verify and nothing to poll: no money moved, and the PENDING
 * request they created before being handed over is simply left where it is.
 * It costs nothing, it grants nothing, and it is what lets an admin still
 * confirm the payment if the driver ends up paying another way.
 *
 * ## `isReturn`
 *
 * Idram redirects here with a GET and two query parameters — `EDP_BILL_NO` and
 * `isReturn` — and `isReturn=true` is how it says the driver **walked back**
 * rather than that a payment failed. Two different people arrive through this
 * one door, and telling someone who changed their mind that their payment
 * "did not go through" invents a problem they did not have.
 *
 * Only the wording depends on it. Nothing here is trusted or acted on: these
 * are query parameters on a public page, anyone can type them, and the state
 * that matters is decided by the RESULT_URL callback on the server.
 *
 * Deliberately does NOT say what went wrong in the failure case — we were not
 * told. Idram knows; we only know the driver came back through this door.
 */
definePageMeta({ middleware: 'driver-auth' })

const route = useRoute()
const cancelled = computed(() => route.query.isReturn === 'true')

useSeoMetaData({
  title: `Վճարումը չկատարվեց | ${SITE_NAME}`,
  description: 'Վճարման արդյունք',
  path: '/payment/idram/failed',
  noindex: true,
})
</script>

<template>
  <div class="container payment-result">
    <template v-if="cancelled">
      <h1>Վճարումն ընդհատվեց</h1>
      <p>Գումարը չի հանվել։ Կարող եք վերադառնալ և վճարել ցանկացած պահի։</p>
    </template>

    <template v-else>
      <h1>Վճարումը չկատարվեց</h1>
      <p>Գումարը չի հանվել։ Կարող եք փորձել կրկին ձեր էջից։</p>
    </template>

    <p class="payment-result__contact">
      Հարցերի դեպքում՝
      <a :href="getPhoneHref(CONTACT_PHONE)">{{ CONTACT_PHONE }}</a>
    </p>

    <AppButton to="/dashboard">Վերադառնալ իմ էջ</AppButton>
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

  &__contact {
    font-weight: 600;

    a {
      color: var(--color-primary);
    }
  }
}
</style>
