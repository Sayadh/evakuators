<script setup lang="ts">
import type { BreadcrumbItem } from '~/types/common'
import { buildBreadcrumbSchema } from '~/utils/schemaOrg'

interface Props {
  items: BreadcrumbItem[]
}

const props = defineProps<Props>()

useJsonLd([buildBreadcrumbSchema(props.items)])
</script>

<template>
  <nav class="breadcrumbs" aria-label="Breadcrumb">
    <ol class="breadcrumbs__list">
      <li v-for="(item, index) in items" :key="index" class="breadcrumbs__item">
        <NuxtLink v-if="item.to" :to="item.to" class="breadcrumbs__link">
          {{ item.label }}
        </NuxtLink>
        <span v-else class="breadcrumbs__current" aria-current="page">{{ item.label }}</span>
        <AppIcon
          v-if="index < items.length - 1"
          name="chevron-right"
          :size="14"
          class="breadcrumbs__sep"
        />
      </li>
    </ol>
  </nav>
</template>

<style scoped lang="scss">
.breadcrumbs {
  padding-block: var(--space-3);

  &__list {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-1);
    list-style: none;
  }

  &__item {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    font-size: 0.88rem;
  }

  &__link {
    color: var(--color-text-secondary);

    &:hover {
      color: var(--color-primary);
    }
  }

  &__current {
    color: var(--color-text);
    font-weight: 600;
  }

  &__sep {
    color: var(--color-text-muted);
  }
}
</style>
