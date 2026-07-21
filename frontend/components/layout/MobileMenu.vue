<script setup lang="ts">
import { NAV_LINKS, REGISTER_LINK } from '~/constants/navigation'

interface Props {
  modelValue: boolean
}

defineProps<Props>()

const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
</script>

<template>
  <AppDrawer
    :model-value="modelValue"
    title="Մենյու"
    side="right"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <nav class="mobile-menu" aria-label="Բջջային նավիգացիա">
      <NuxtLink
        v-for="link in NAV_LINKS"
        :key="link.to"
        :to="link.to"
        class="mobile-menu__link"
        @click="emit('update:modelValue', false)"
      >
        {{ link.label }}
        <AppIcon name="chevron-right" :size="18" />
      </NuxtLink>
    </nav>

    <template #footer>
      <AppButton
        :to="REGISTER_LINK.to"
        variant="accent"
        block
        @click="emit('update:modelValue', false)"
      >
        {{ REGISTER_LINK.label }}
      </AppButton>
    </template>
  </AppDrawer>
</template>

<style scoped lang="scss">
.mobile-menu {
  display: flex;
  flex-direction: column;

  &__link {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-4) var(--space-2);
    font-size: 1.05rem;
    font-weight: 600;
    color: var(--color-text);
    border-bottom: 1px solid var(--color-border);

    &:last-child {
      border-bottom: none;
    }
  }
}
</style>
