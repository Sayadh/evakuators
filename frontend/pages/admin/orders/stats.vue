<script setup lang="ts">
/**
 * Stats (2026-11-17) — the numbers a test run is judged by: how many orders,
 * how fast a driver is found, how often drivers say yes, why orders fall
 * through, and each driver's record. All read from what the system already
 * records (backend adminStats); nothing here is stored.
 */
import { computed, onMounted, ref } from 'vue'
import { opsDispatchRepository } from '~/repositories/opsDispatch.repository'
import type { OpsStats } from '~/types/opsDispatch'
import { formatPrice } from '~/utils/formatPrice'
import { apiErrorText, CANCEL_REASON_LABEL } from '~/utils/opsDispatchLabels'

const days = ref(7)
const stats = ref<OpsStats | null>(null)
const error = ref<string | null>(null)

/** «2 ր 30 վ», «45 վ», «—» */
function duration(seconds: number | null): string {
  if (seconds === null) return '—'
  if (seconds < 60) return `${seconds} վ`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return s ? `${m} ր ${s} վ` : `${m} ր`
}
const reason = (code: string) => (CANCEL_REASON_LABEL as Record<string, string>)[code] ?? code
const percent = (part: number, whole: number) => (whole === 0 ? '—' : `${Math.round((part * 100) / whole)}%`)

const driverCancels = computed(() => stats.value?.cancelReasons.filter((r) => r.by === 'DRIVER') ?? [])
const operatorCancels = computed(() => stats.value?.cancelReasons.filter((r) => r.by === 'OPERATOR') ?? [])

async function load() {
  error.value = null
  try {
    stats.value = await opsDispatchRepository.stats(days.value)
  } catch (e) {
    error.value = apiErrorText(e, 'Վիճակագրությունը բեռնել չհաջողվեց։')
  }
}

onMounted(load)
useSeoMetaData({ title: 'Վիճակագրություն', description: 'Պատվերների վիճակագրություն', path: '/admin/orders/stats', noindex: true })
</script>

<template>
  <div class="container stats">
    <OpsNav />
    <div class="stats__head">
      <h1>Վիճակագրություն</h1>
      <label>
        Վերջին
        <select v-model.number="days" @change="load">
          <option :value="1">1 օր</option>
          <option :value="7">7 օր</option>
          <option :value="30">30 օր</option>
          <option :value="90">90 օր</option>
        </select>
      </label>
    </div>
    <p v-if="error" class="stats__error" role="alert">{{ error }}</p>

    <template v-if="stats">
      <section class="stats__tiles" aria-label="Հիմնական թվեր">
        <div class="tile">
          <span>Պատվերներ</span>
          <strong>{{ stats.orders.created }}</strong>
          <small>ավարտված՝ {{ stats.orders.completed }} · չեղարկված՝ {{ stats.orders.cancelled }} · ընթացքում՝ {{ stats.orders.open }}</small>
        </div>
        <div class="tile">
          <span>Վարորդ գտնելու ժամանակ</span>
          <strong>{{ duration(stats.timeToAssign.medianSeconds) }}</strong>
          <small>միջին (մեդիան) · 10-ից 9-ը՝ մինչև {{ duration(stats.timeToAssign.p90Seconds) }} · {{ stats.timeToAssign.orders }} պատվեր</small>
        </div>
        <div class="tile">
          <span>Առաջարկների ընդունում</span>
          <strong>{{ stats.offers.acceptanceRate === null ? '—' : `${stats.offers.acceptanceRate}%` }}</strong>
          <small>ընդունված՝ {{ stats.offers.accepted }} · մերժված՝ {{ stats.offers.rejected }} · պատասխան չկար՝ {{ stats.offers.expired }}</small>
        </div>
        <div class="tile">
          <span>Վարորդ չգտնվեց</span>
          <strong>{{ stats.orders.searchFailed }}</strong>
          <small>{{ percent(stats.orders.searchFailed, stats.orders.created) }} պատվերներից</small>
        </div>
      </section>

      <div class="stats__grid">
        <section>
          <h2>Վարորդների չեղարկումներ</h2>
          <p v-if="!driverCancels.length" class="muted">Չկան։</p>
          <table v-else class="stats__table">
            <tbody>
              <tr v-for="r in driverCancels" :key="r.reason"><td>{{ reason(r.reason) }}</td><td class="num">{{ r.count }}</td></tr>
            </tbody>
          </table>
        </section>
        <section>
          <h2>Չեղարկված պատվերներ (օպերատոր)</h2>
          <p v-if="!operatorCancels.length" class="muted">Չկան։</p>
          <table v-else class="stats__table">
            <tbody>
              <tr v-for="r in operatorCancels" :key="r.reason"><td>{{ reason(r.reason) }}</td><td class="num">{{ r.count }}</td></tr>
            </tbody>
          </table>
        </section>
      </div>

      <section>
        <h2>Վարորդներ</h2>
        <p v-if="!stats.drivers.length" class="muted">Այս ժամանակահատվածում առաջարկներ չեն եղել։</p>
        <div v-else class="stats__scroll">
          <table class="stats__table">
            <thead>
              <tr>
                <th>Վարորդ</th>
                <th class="num">Առաջարկ</th>
                <th class="num">Ընդունել է</th>
                <th class="num">Մերժել է</th>
                <th class="num">Չի պատասխանել</th>
                <th class="num">Ավարտել է</th>
                <th class="num">Չեղարկել է</th>
                <th class="num">Գնահատական</th>
                <th class="num">Փոխանցել է</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="d in stats.drivers" :key="d.driverId">
                <td>
                  <strong>{{ d.name ?? `#${d.driverId}` }}</strong>
                  <div class="muted small">{{ d.phone }}</div>
                </td>
                <td class="num">{{ d.offers }}</td>
                <td class="num">{{ d.accepted }} <span class="muted small">{{ percent(d.accepted, d.accepted + d.rejected + d.expired) }}</span></td>
                <td class="num">{{ d.rejected }}</td>
                <td class="num">{{ d.expired }}</td>
                <td class="num">{{ d.completed }}</td>
                <td class="num" :class="{ warn: d.cancels >= 3 }">{{ d.cancels }}</td>
                <td class="num">{{ d.rating ? `⭐ ${d.rating.average.toFixed(1)} (${d.rating.count})` : '—' }}</td>
                <td class="num">
                  {{ d.referred || '—' }}
                  <div v-if="d.referralAmd" class="muted small">+{{ formatPrice(d.referralAmd) }}</div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2>Ըստ օրերի</h2>
        <table class="stats__table stats__table--narrow">
          <thead>
            <tr><th>Օր</th><th class="num">Նոր</th><th class="num">Ավարտված</th><th class="num">Չեղարկված</th></tr>
          </thead>
          <tbody>
            <tr v-for="d in stats.daily" :key="d.day">
              <td>{{ d.day }}</td><td class="num">{{ d.created }}</td><td class="num">{{ d.completed }}</td><td class="num">{{ d.cancelled }}</td>
            </tr>
          </tbody>
        </table>
      </section>
    </template>
  </div>
</template>

<style scoped lang="scss">
.stats {
  padding-top: var(--space-5);
  padding-bottom: var(--space-8);
  h1 {
    font-size: 1.4rem;
    margin: 0;
  }
  h2 {
    font-size: 1.05rem;
    margin: var(--space-5) 0 var(--space-2);
  }
  &__head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-3);
    margin: var(--space-4) 0 var(--space-3);
    flex-wrap: wrap;
    select {
      margin-left: 6px;
      padding: 4px 8px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-sm);
      font: inherit;
    }
  }
  &__error {
    color: var(--color-danger);
  }
  &__tiles {
    display: grid;
    gap: var(--space-3);
    grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  }
  &__grid {
    display: grid;
    gap: var(--space-4);
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  }
  &__scroll {
    overflow-x: auto;
  }
  &__table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.9rem;
    th,
    td {
      padding: 8px;
      border-bottom: 1px solid var(--color-border);
      text-align: left;
      vertical-align: top;
    }
    th {
      color: var(--color-text-secondary);
      font-weight: 600;
      font-size: 0.8rem;
    }
    .num {
      text-align: right;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
    .warn {
      font-weight: 700;
    }
    &--narrow {
      max-width: 520px;
    }
  }
}
.tile {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-3) var(--space-4);
  display: grid;
  gap: 4px;
  span {
    font-size: 0.85rem;
    color: var(--color-text-secondary);
  }
  strong {
    font-size: 1.8rem;
    line-height: 1.1;
    font-variant-numeric: tabular-nums;
  }
  small {
    font-size: 0.78rem;
    color: var(--color-text-muted);
  }
}
.muted {
  color: var(--color-text-muted);
}
.small {
  font-size: 0.78rem;
}
</style>
