<script setup lang="ts">
/** Renders `confirmDialog()` (composables/useConfirmDialog.ts) with the site's AppModal */
const state = useConfirmDialogState()

const open = computed({
  get: () => state.value.open,
  set: (value: boolean) => {
    if (!value) settleConfirmDialog(false)
  },
})

// Enter confirms, as the browser dialog did; Escape cancels
function onKey(event: KeyboardEvent): void {
  if (!state.value.open) return
  if (event.key === 'Escape') settleConfirmDialog(false)
  else if (event.key === 'Enter') {
    event.preventDefault()
    settleConfirmDialog(true)
  }
}
onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <AppModal v-model="open" :title="state.title ?? 'Հաստատեք գործողությունը'">
    <p class="confirm__message">{{ state.message }}</p>
    <div class="confirm__actions">
      <AppButton variant="outline" @click="settleConfirmDialog(false)">{{ state.cancelLabel ?? 'Չեղարկել' }}</AppButton>
      <AppButton :variant="state.danger ? 'danger' : 'primary'" @click="settleConfirmDialog(true)">
        {{ state.confirmLabel ?? 'Հաստատել' }}
      </AppButton>
    </div>
  </AppModal>
</template>

<style scoped lang="scss">
.confirm__message {
  margin: 0 0 var(--space-5, 24px);
  white-space: pre-line;
  line-height: 1.5;
  color: var(--color-text-secondary, inherit);
}

.confirm__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-3, 12px);
  flex-wrap: wrap;
}
</style>
