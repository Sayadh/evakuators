<script setup lang="ts">
import type { TowTruck } from '~/types/towTruck'

interface Props {
  towTruck: TowTruck
}

const props = defineProps<Props>()

const { data: similar, pending } = useSimilarTowTrucks(props.towTruck)
</script>

<template>
  <section
    v-if="pending || similar.length > 0"
    class="similar"
    aria-labelledby="similar-title"
  >
    <h2 id="similar-title" class="similar__title">Նմանատիպ էվակուատորներ մոտակայքում</h2>
    <TowTruckList :tow-trucks="similar" :pending="pending" :skeleton-count="3" />
  </section>
</template>

<style scoped lang="scss">
.similar {
  &__title {
    margin-bottom: var(--space-4);
  }
}
</style>
