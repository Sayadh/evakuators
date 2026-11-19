<script setup lang="ts">
import type { AppStatus } from '~/types/towTruck'

/**
 * «Ազատ է / Զբաղված է» — the driver app's state when the page was requested
 * (backend `tow-trucks/app-status.ts`). Not refreshed while the page is open.
 * Renders nothing when the API sent no status: a driver without the app, or
 * one who is Offline, looks exactly as before.
 */
defineProps<{ status?: AppStatus }>()

const { t } = useI18n()
</script>

<template>
  <AppBadge v-if="status" :variant="status === 'FREE' ? 'success' : 'danger'" class="app-status">
    <span class="app-status__dot" aria-hidden="true" />
    {{ t(status === 'FREE' ? 'appStatus.free' : 'appStatus.busy') }}
  </AppBadge>
</template>

<style scoped lang="scss">
.app-status__dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: currentColor;
}
</style>
