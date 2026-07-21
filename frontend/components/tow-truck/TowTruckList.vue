<script setup lang="ts">
import type { TowTruck } from '~/types/towTruck'

interface Props {
  towTrucks: TowTruck[]
  pending?: boolean
  skeletonCount?: number
}

withDefaults(defineProps<Props>(), { pending: false, skeletonCount: 6 })
</script>

<template>
  <div>
    <div v-if="pending" class="card-grid">
      <LoadingSkeleton variant="card" :count="skeletonCount" />
    </div>

    <div v-else-if="towTrucks.length > 0" class="card-grid">
      <TowTruckCard v-for="truck in towTrucks" :key="truck.id" :tow-truck="truck" />
    </div>

    <slot v-else name="empty">
      <EmptyState
        title="Էվակուատորներ չեն գտնվել"
        description="Փորձեք փոխել ֆիլտրերը կամ դիտել մոտակա տարածքների ծառայությունները։"
      />
    </slot>
  </div>
</template>
