<script setup lang="ts">
/**
 * The dispatch console's own navigation (2026-11-12): one tab bar for the four
 * pages — orders, app drivers, wallets, settings — so it is always clear where
 * you are and the way back is the same everywhere. `live` shows the realtime
 * state on the orders page.
 */
import type { IconName } from '~/components/common/AppIcon.vue'
import { useAdminAuthStore } from '~/stores/adminAuth'

const props = defineProps<{ live?: boolean | null }>()

const adminAuth = useAdminAuthStore()
const route = useRoute()

interface Tab { to: string; label: string; icon?: IconName; glyph?: string; adminOnly?: boolean }
const TABS: Tab[] = [
  { to: '/admin/orders', label: 'Պատվերներ', icon: 'truck' },
  { to: '/admin/orders/drivers', label: 'Վարորդներ', icon: 'user', adminOnly: true },
  { to: '/admin/orders/wallets', label: 'Հաշիվներ', glyph: '֏' },
  { to: '/admin/orders/settings', label: 'Կարգավորումներ', icon: 'filter' },
]

const tabs = computed(() => TABS.filter((tab) => !tab.adminOnly || adminAuth.role === 'ADMIN'))

/** The orders tab also owns an order's own page (/admin/orders/123) */
function isActive(tab: Tab): boolean {
  if (tab.to === '/admin/orders') return route.path === '/admin/orders' || /^\/admin\/orders\/\d+/.test(route.path)
  return route.path.startsWith(tab.to)
}
</script>

<template>
  <nav class="ops-nav" aria-label="Պատվերների բաժիններ">
    <div class="ops-nav__tabs">
      <NuxtLink
        v-for="tab in tabs"
        :key="tab.to"
        :to="tab.to"
        class="ops-nav__tab"
        :class="{ 'ops-nav__tab--active': isActive(tab) }"
        :aria-current="isActive(tab) ? 'page' : undefined"
      >
        <AppIcon v-if="tab.icon" :name="tab.icon" :size="18" />
        <span v-else class="ops-nav__glyph" aria-hidden="true">{{ tab.glyph }}</span>
        {{ tab.label }}
      </NuxtLink>
    </div>

    <div class="ops-nav__side">
      <span
        v-if="props.live !== undefined && props.live !== null"
        class="ops-nav__live"
        :class="{ 'ops-nav__live--on': props.live }"
        :title="props.live ? 'Փոփոխությունները գալիս են ակնթարթորեն' : 'Կապը վերականգնվում է․ մինչ այդ էջը թարմացվում է 15 վայրկյանը մեկ'"
      >
        <span class="ops-nav__dot" />
        {{ props.live ? 'Առցանց' : 'Թարմացում՝ 15 վ' }}
      </span>
      <NuxtLink to="/admin" class="ops-nav__back">
        <AppIcon name="menu" :size="16" />
        Ադմին վահանակ
      </NuxtLink>
    </div>
  </nav>
</template>

<style scoped lang="scss">
.ops-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  flex-wrap: wrap;
  margin-bottom: var(--space-4);

  &__tabs {
    display: flex;
    gap: 4px;
    padding: 4px;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 999px;
    overflow-x: auto;
    max-width: 100%;
  }

  &__tab {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 16px;
    border-radius: 999px;
    color: var(--color-text-secondary);
    font-weight: 500;
    font-size: 0.95rem;
    text-decoration: none;
    white-space: nowrap;
    transition: background-color 0.15s, color 0.15s;

    &:hover {
      background: var(--color-bg, #f4f6f9);
      color: var(--color-text);
    }

    &--active,
    &--active:hover {
      background: var(--color-primary, #14304f);
      color: #fff;
    }
  }

  &__glyph {
    width: 18px;
    text-align: center;
    font-weight: 700;
  }

  &__side {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  &__live {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 12px;
    border-radius: 999px;
    font-size: 0.85rem;
    background: var(--color-bg, #f4f6f9);
    color: var(--color-text-muted);

    &--on {
      background: var(--color-success-bg, #e6f7ed);
      color: var(--color-success, #1d9e55);
    }
  }

  &__dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: currentColor;
  }

  &__live--on &__dot {
    animation: ops-nav-pulse 1.6s ease-in-out infinite;
  }

  &__back {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 14px;
    border-radius: 999px;
    border: 1px solid var(--color-border);
    color: var(--color-text-secondary);
    text-decoration: none;
    font-size: 0.9rem;
    white-space: nowrap;

    &:hover {
      color: var(--color-text);
      border-color: var(--color-text-muted);
    }
  }
}

@keyframes ops-nav-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.35;
  }
}
</style>
