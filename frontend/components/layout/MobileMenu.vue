<script setup lang="ts">
import { LOGIN_LINK, NAV_LINKS, REGISTER_LINK } from '~/constants/navigation'

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
      <!-- The header shows this as an icon only below 768px, which is most of
           the phones that open this drawer — so the number itself is readable
           in exactly one place on mobile, and this is it. -->
      <div class="mobile-menu__call">
        <DispatchCallCta variant="header" />
      </div>
      <!-- Below 768px the header hides «Մուտք» entirely, so for most phones
           this is the only way a driver reaches their own profile. -->
      <AppButton
        :to="LOGIN_LINK.to"
        variant="outline"
        block
        class="mobile-menu__login"
        @click="emit('update:modelValue', false)"
      >
        {{ LOGIN_LINK.label }}
      </AppButton>
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
/* The header variant hides the number under 768px, which is the whole width of
   this drawer — shown here, because reading it is the point. */
.mobile-menu__login {
  margin-bottom: var(--space-3);
}

.mobile-menu__call {
  margin-bottom: var(--space-3);

  :deep(.dispatch-cta__number) {
    display: inline;
  }

  :deep(.dispatch-cta__call--header) {
    width: 100%;
    justify-content: center;
  }
}

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
