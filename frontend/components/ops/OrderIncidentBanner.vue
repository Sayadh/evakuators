<script setup lang="ts">
/**
 * One open incident on top of an order (2026-11-16): what happened, who,
 * why, when — and the actions that answer it, in one place. Data and words
 * come from utils/orderIncidents.ts; the actions are the page's own
 * (pages/admin/orders/[id].vue), passed back up as events.
 */
import type { OrderIncident } from '~/utils/orderIncidents'
import { formatArmenianPhone } from '~/utils/opsDispatchLabels'
import { formatClockTime, formatDateNumeric } from '~/utils/formatters'

const props = defineProps<{
  incident: OrderIncident
  customerPhone: string
  /** A driver is still on the order: «take him off» makes sense */
  driverAttached: boolean
  /** The order can still be cancelled */
  cancellable: boolean
  busy: boolean
}>()

const emit = defineEmits<{
  release: []
  resume: []
  /** Driverless incident (CUSTOMER_PENDING): start a new automatic search */
  restart: []
  cancel: []
}>()

const icon = { danger: '❌', warn: '⚠️', info: '🔁' }[props.incident.tone]
const when = `${formatDateNumeric(props.incident.at)} ${formatClockTime(new Date(props.incident.at))}`
</script>

<template>
  <section class="incident" :class="`incident--${incident.tone}`" role="alert" aria-live="assertive">
    <div class="incident__head">
      <span class="incident__icon" aria-hidden="true">{{ icon }}</span>
      <div>
        <h2 class="incident__title">{{ incident.title }}</h2>
        <p class="incident__meta">{{ incident.actor.label }} · {{ when }}</p>
      </div>
    </div>
    <dl v-if="incident.reason || incident.comment || incident.prices" class="incident__why">
      <template v-if="incident.reason">
        <dt>Պատճառ</dt>
        <dd>{{ incident.reason }}</dd>
      </template>
      <template v-if="incident.prices">
        <dt>Գին</dt>
        <dd>{{ incident.prices }}</dd>
      </template>
      <template v-if="incident.comment">
        <dt>Մեկնաբանություն</dt>
        <dd>«{{ incident.comment }}»</dd>
      </template>
    </dl>
    <div class="incident__actions">
      <a v-if="incident.actor.phone" class="incident__call" :href="`tel:${incident.actor.phone}`">📞 Զանգել վարորդին · {{ formatArmenianPhone(incident.actor.phone) }}</a>
      <a class="incident__call" :href="`tel:${customerPhone}`">📞 Զանգել հաճախորդին · {{ formatArmenianPhone(customerPhone) }}</a>
      <AppButton v-if="incident.kind === 'DRIVER_CANCEL_REQUEST' || incident.kind === 'DRIVER_PROBLEM'" size="sm" variant="outline" :disabled="busy" @click="emit('resume')">
        Շարունակել նույն վարորդով
      </AppButton>
      <AppButton v-if="driverAttached && incident.kind !== 'CANCELLED'" size="sm" variant="danger" :disabled="busy" @click="emit('release')">
        Հանել վարորդից և նոր որոնում
      </AppButton>
      <AppButton v-if="incident.kind === 'CUSTOMER_PENDING'" size="sm" :disabled="busy" @click="emit('restart')">
        Հաճախորդը համաձայն է՝ սկսել նոր որոնում
      </AppButton>
      <AppButton v-if="cancellable && incident.kind !== 'CANCELLED'" size="sm" variant="ghost" :disabled="busy" @click="emit('cancel')">Չեղարկել պատվերը…</AppButton>
    </div>
  </section>
</template>

<style scoped lang="scss">
.incident {
  border: 2px solid var(--color-border);
  border-left-width: 8px;
  border-radius: 12px;
  padding: var(--space-4);
  margin: var(--space-3) 0;
  background: var(--color-surface);
  &--danger {
    border-color: var(--color-danger);
    background: var(--color-danger-bg);
  }
  &--warn {
    border-color: #d97706;
    background: #fff7e6;
  }
  &--info {
    border-color: var(--color-primary);
    background: #eef3fa;
  }
  &__head {
    display: flex;
    gap: var(--space-3);
    align-items: flex-start;
  }
  &__icon {
    font-size: 1.8rem;
    line-height: 1;
  }
  &__title {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 800;
  }
  &__meta {
    margin: 2px 0 0;
    color: var(--color-text-secondary);
    font-size: 0.9rem;
  }
  &__why {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 4px var(--space-3);
    margin: var(--space-3) 0 0;
    font-size: 1.05rem;
    dt {
      color: var(--color-text-secondary);
    }
    dd {
      margin: 0;
      font-weight: 600;
    }
  }
  &__actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin-top: var(--space-3);
    align-items: center;
  }
  &__call {
    font-weight: 600;
    padding: 6px 10px;
    border-radius: 8px;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    text-decoration: none;
  }
}
</style>
