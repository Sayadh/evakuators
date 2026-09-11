<script setup lang="ts">
interface Props {
  modelValue: boolean
  resultsCount: number
}

defineProps<Props>()

const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()

const { t } = useI18n()
const plural = usePlural()
</script>

<template>
  <AppDrawer
    :model-value="modelValue"
    :title="t('common.filters')"
    side="bottom"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <TowTruckFilters />

    <template #footer>
      <AppButton variant="primary" block @click="emit('update:modelValue', false)">
        {{ plural('filters.showResults', resultsCount) }}
      </AppButton>
    </template>
  </AppDrawer>
</template>
