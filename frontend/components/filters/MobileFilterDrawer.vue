<script setup lang="ts">
interface Props {
  modelValue: boolean
  resultsCount: number
  /** Forwarded to TowTruckFilters — see there for why /manipulator hides it */
  hideManipulator?: boolean
}

withDefaults(defineProps<Props>(), { hideManipulator: false })

const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
</script>

<template>
  <AppDrawer
    :model-value="modelValue"
    title="Ֆիլտրեր"
    side="bottom"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <TowTruckFilters :hide-manipulator="hideManipulator" />

    <template #footer>
      <AppButton variant="primary" block @click="emit('update:modelValue', false)">
        Ցուցադրել {{ resultsCount }} արդյունք
      </AppButton>
    </template>
  </AppDrawer>
</template>
