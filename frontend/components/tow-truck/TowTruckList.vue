<script setup lang="ts">
import type { TowTruck } from '~/types/towTruck'

interface Props {
  towTrucks: TowTruck[]
  pending?: boolean
  skeletonCount?: number
  /** 'grid' (default, responsive 1/2/3 columns) or 'stack' (always a single column) */
  layout?: 'grid' | 'stack'
}

const props = withDefaults(defineProps<Props>(), {
  pending: false,
  skeletonCount: 6,
  layout: 'grid',
})

const listClass = computed(() => (props.layout === 'stack' ? 'card-stack' : 'card-grid'))
</script>

<template>
  <div>
    <div v-if="pending" :class="listClass">
      <LoadingSkeleton variant="card" :count="skeletonCount" />
    </div>

    <div v-else-if="towTrucks.length > 0" :class="listClass">
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
