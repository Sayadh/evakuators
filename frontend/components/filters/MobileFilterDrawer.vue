<script setup lang="ts">
interface Props {
  modelValue: boolean
  resultsCount: number
}

defineProps<Props>()

const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
</script>

<template>
  <AppDrawer
    :model-value="modelValue"
    title="Ֆիլտրեր"
    side="bottom"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <TowTruckFilters />

    <template #footer>
      <AppButton variant="primary" block @click="emit('update:modelValue', false)">
        Ցուցադրել {{ resultsCount }} արդյունք
      </AppButton>
    </template>
  </AppDrawer>
</template>
