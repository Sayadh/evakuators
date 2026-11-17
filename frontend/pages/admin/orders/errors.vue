<script setup lang="ts">
/**
 * Errors (2026-11-17) — the in-house tracker: the backend's 5xx, the worker's
 * failing jobs, the admin pages and the driver app, one row per distinct
 * problem with how often and when. A NEW one is also sent to Telegram.
 * «Լուծված է» closes it; if it happens again it reopens and is reported again.
 */
import { computed, onMounted, ref } from 'vue'
import { errorTrackingRepository, type ErrorGroup } from '~/repositories/errorTracking.repository'
import { formatClockTime, formatDateNumeric } from '~/utils/formatters'
import { apiErrorText } from '~/utils/opsDispatchLabels'

const SOURCE_LABEL: Record<ErrorGroup['source'], string> = {
  api: 'Backend',
  worker: 'Worker',
  admin: 'Admin վահանակ',
  mobile: 'Վարորդի հավելված',
}

const status = ref<'open' | 'resolved'>('open')
const groups = ref<ErrorGroup[]>([])
const error = ref<string | null>(null)
const busy = ref(false)
const expanded = ref<number | null>(null)
const total = computed(() => groups.value.reduce((sum, g) => sum + g.count, 0))

function when(iso: string): string {
  return `${formatDateNumeric(iso)} ${formatClockTime(new Date(iso))}`
}

async function load() {
  error.value = null
  try {
    groups.value = await errorTrackingRepository.list(status.value)
  } catch (e) {
    error.value = apiErrorText(e, 'Սխալները բեռնել չհաջողվեց։')
  }
}

async function resolve(group: ErrorGroup) {
  busy.value = true
  try {
    await errorTrackingRepository.resolve(group.id)
    groups.value = groups.value.filter((g) => g.id !== group.id)
  } catch (e) {
    error.value = apiErrorText(e, 'Չհաջողվեց։')
  } finally {
    busy.value = false
  }
}

function setStatus(next: 'open' | 'resolved') {
  status.value = next
  void load()
}

onMounted(load)
useSeoMetaData({ title: 'Սխալներ', description: 'Համակարգի սխալներ', path: '/admin/orders/errors', noindex: true })
</script>

<template>
  <div class="container errors">
    <OpsNav />
    <h1>Սխալներ</h1>
    <p class="muted">
      Backend-ի, worker-ի, admin-ի և վարորդի հավելվածի սխալները՝ խմբավորված ըստ տեսակի։ Նորը գալիս է նաև Telegram-ով։ «Լուծված է»-ից հետո, եթե
      կրկնվի, նորից կբացվի։
    </p>
    <div class="errors__tabs" role="tablist">
      <button type="button" role="tab" :aria-selected="status === 'open'" :class="{ active: status === 'open' }" @click="setStatus('open')">Բաց</button>
      <button type="button" role="tab" :aria-selected="status === 'resolved'" :class="{ active: status === 'resolved' }" @click="setStatus('resolved')">
        Լուծված
      </button>
      <span class="muted">{{ groups.length }} տեսակ · {{ total }} անգամ</span>
    </div>
    <p v-if="error" class="errors__error" role="alert">{{ error }}</p>
    <p v-if="!error && groups.length === 0" class="muted">{{ status === 'open' ? 'Բաց սխալներ չկան 👍' : 'Լուծված սխալներ չկան։' }}</p>
    <article v-for="g in groups" :key="g.id" class="errors__item">
      <div class="errors__head">
        <span class="errors__source" :class="`errors__source--${g.source}`">{{ SOURCE_LABEL[g.source] }}</span>
        <strong class="errors__count">{{ g.count }}×</strong>
        <span class="muted small">վերջինը՝ {{ when(g.lastSeenAt) }} · առաջինը՝ {{ when(g.firstSeenAt) }}<template v-if="g.release"> · {{ g.release }}</template></span>
        <AppButton v-if="status === 'open'" size="sm" variant="outline" :disabled="busy" @click="resolve(g)">Լուծված է</AppButton>
      </div>
      <p class="errors__message">{{ g.message }}</p>
      <button type="button" class="errors__toggle" @click="expanded = expanded === g.id ? null : g.id">
        {{ expanded === g.id ? 'Թաքցնել մանրամասները' : 'Մանրամասներ' }}
      </button>
      <div v-if="expanded === g.id" class="errors__details">
        <pre v-if="Object.keys(g.context).length">{{ JSON.stringify(g.context, null, 2) }}</pre>
        <pre v-if="g.stack">{{ g.stack }}</pre>
      </div>
    </article>
  </div>
</template>

<style scoped lang="scss">
.errors {
  padding-top: var(--space-5);
  padding-bottom: var(--space-8);
  h1 {
    font-size: 1.4rem;
    margin: var(--space-4) 0 var(--space-2);
  }
  &__tabs {
    display: flex;
    gap: var(--space-2);
    align-items: center;
    margin: var(--space-3) 0;
    button {
      border: 1px solid var(--color-border);
      background: var(--color-surface);
      border-radius: var(--radius-full);
      padding: 4px 14px;
      cursor: pointer;
      font: inherit;
      &.active {
        background: var(--color-primary, #14304f);
        border-color: var(--color-primary, #14304f);
        color: #fff;
      }
    }
  }
  &__error {
    color: var(--color-danger);
  }
  &__item {
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    padding: var(--space-3) var(--space-4);
    margin-bottom: var(--space-3);
  }
  &__head {
    display: flex;
    gap: var(--space-3);
    align-items: center;
    flex-wrap: wrap;
    :deep(button) {
      margin-left: auto;
    }
  }
  &__source {
    font-size: 0.75rem;
    font-weight: 700;
    padding: 2px 8px;
    border-radius: 999px;
    background: #e6eef9;
    color: var(--color-primary-dark, #14304f);
    &--mobile {
      background: #fff1d6;
      color: #92400e;
    }
    &--worker {
      background: #fdecec;
      color: #b91c1c;
    }
  }
  &__count {
    font-size: 1.05rem;
  }
  &__message {
    margin: var(--space-2) 0;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.85rem;
    word-break: break-word;
  }
  &__toggle {
    background: none;
    border: 0;
    padding: 0;
    color: var(--color-text-secondary);
    cursor: pointer;
    font-size: 0.8rem;
    text-decoration: underline;
  }
  &__details pre {
    background: var(--color-surface-muted, #f4f6f9);
    border-radius: var(--radius-sm);
    padding: var(--space-2);
    font-size: 0.75rem;
    overflow-x: auto;
    white-space: pre-wrap;
    word-break: break-word;
  }
}
.muted {
  color: var(--color-text-muted);
}
.small {
  font-size: 0.8rem;
}
</style>
