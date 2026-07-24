<script setup lang="ts">
import { SERVICE_LABELS, type ServiceCategory } from '~/constants/services'
import type { ServiceType } from '~/types/enums'

interface Props {
  modelValue: ServiceType[]
  categories: ServiceCategory[]
  /**
   * 'form' — always expanded, category description shown. Used where the
   * driver is describing their business in detail (registration, dashboard).
   * 'filter' — collapsible, starts collapsed, compact. Used on the public
   * listing filters where 45 checkboxes at once would be overwhelming.
   */
  mode?: 'form' | 'filter'
}

const props = withDefaults(defineProps<Props>(), { mode: 'form' })
const emit = defineEmits<{ 'update:modelValue': [value: ServiceType[]] }>()

const openCategories = ref<Set<string>>(new Set())

function isOpen(key: string): boolean {
  return props.mode === 'form' || openCategories.value.has(key)
}

function toggleOpen(key: string): void {
  if (props.mode === 'form') return
  if (openCategories.value.has(key)) openCategories.value.delete(key)
  else openCategories.value.add(key)
}

function selectedCount(category: ServiceCategory): number {
  return category.services.filter((service) => props.modelValue.includes(service)).length
}

function isCategoryFullySelected(category: ServiceCategory): boolean {
  return category.services.length > 0 && selectedCount(category) === category.services.length
}

/** Selects every service in the category, or clears it if all are already selected */
function toggleCategory(category: ServiceCategory): void {
  if (isCategoryFullySelected(category)) {
    emit(
      'update:modelValue',
      props.modelValue.filter((service) => !category.services.includes(service)),
    )
  } else {
    emit('update:modelValue', Array.from(new Set([...props.modelValue, ...category.services])))
  }
}

function toggleService(service: ServiceType): void {
  emit(
    'update:modelValue',
    props.modelValue.includes(service)
      ? props.modelValue.filter((item) => item !== service)
      : [...props.modelValue, service],
  )
}
</script>

<template>
  <div class="service-picker" :class="`service-picker--${mode}`">
    <div v-for="category in categories" :key="category.key" class="service-picker__category">
      <button
        type="button"
        class="service-picker__header"
        :class="{ 'service-picker__header--static': mode === 'form' }"
        @click="toggleOpen(category.key)"
      >
        <span class="service-picker__heading">
          <span class="service-picker__title">{{ category.title }}</span>
          <span v-if="mode === 'filter' && selectedCount(category) > 0" class="service-picker__count">
            {{ selectedCount(category) }}
          </span>
        </span>
        <AppIcon
          v-if="mode === 'filter'"
          name="chevron-down"
          :size="18"
          class="service-picker__chevron"
          :class="{ 'service-picker__chevron--open': isOpen(category.key) }"
        />
      </button>

      <p v-if="mode === 'form'" class="service-picker__description">{{ category.description }}</p>

      <div v-show="isOpen(category.key)" class="service-picker__body">
        <AppCheckbox
          :model-value="isCategoryFullySelected(category)"
          label="Ընտրել բոլորը"
          class="service-picker__select-all"
          @update:model-value="toggleCategory(category)"
        />
        <div class="service-picker__grid">
          <AppCheckbox
            v-for="service in category.services"
            :key="service"
            :model-value="modelValue.includes(service)"
            :label="SERVICE_LABELS[service]"
            @update:model-value="toggleService(service)"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.service-picker {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);

  &--filter {
    gap: var(--space-2);
  }

  &__category {
    .service-picker--filter & {
      border-bottom: 1px solid var(--color-border);
      padding-bottom: var(--space-2);

      &:last-child {
        border-bottom: none;
      }
    }
  }

  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    background: none;
    border: none;
    padding: 0;
    font: inherit;
    color: inherit;
    text-align: left;
    cursor: pointer;

    &--static {
      cursor: default;
    }
  }

  &__heading {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  &__title {
    font-weight: 700;
    font-size: 0.95rem;
  }

  &__count {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 20px;
    height: 20px;
    padding: 0 6px;
    border-radius: 999px;
    background: var(--color-primary);
    color: #fff;
    font-size: 0.75rem;
    font-weight: 700;
  }

  &__chevron {
    color: var(--color-text-muted);
    transition: transform var(--transition);

    &--open {
      transform: rotate(180deg);
    }
  }

  &__description {
    color: var(--color-text-secondary);
    font-size: 0.88rem;
    margin: 2px 0 var(--space-2);
  }

  &__body {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding-top: var(--space-2);
  }

  &__select-all {
    font-weight: 600;
    padding-bottom: var(--space-1);
    border-bottom: 1px dashed var(--color-border);
    margin-bottom: var(--space-1);
  }

  &__grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 0 var(--space-3);
  }
}
</style>
