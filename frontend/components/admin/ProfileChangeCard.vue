<script setup lang="ts">
import type { AdminProfileChange } from '~/repositories'
import { formatDateNumeric } from '~/utils/formatters'
import { formatProfileValue, profileFieldLabel } from '~/utils/profileChangeLabels'

/**
 * One queued driver edit, as a diff.
 *
 * ## Only what changed
 *
 * The API sends exactly the fields that differ (see the backend's
 * `profile-change-diff.ts`), so this renders a list whose length IS the size of
 * the edit: a corrected phone number is one line. That is the whole reason the
 * queue is workable — a moderator who had to re-read a full profile on every
 * save would stop reading them.
 *
 * ## Two columns, not a highlighted form
 *
 * «Was → now», side by side, because the question a moderator is answering is
 * not "is this profile acceptable" but "is this *change* acceptable", and those
 * have different answers: a description that was fine yesterday and is now a
 * phone number is only visible as a change.
 */
defineProps<{
  change: AdminProfileChange
  busy?: boolean
}>()

const emit = defineEmits<{ approve: []; reject: [] }>()
</script>

<template>
  <article class="pc-card">
    <header class="pc-card__header">
      <div>
        <h3 class="pc-card__title">{{ change.driverName }}</h3>
        <p class="pc-card__meta">
          <NuxtLink :to="`/tow-trucks/${change.towTruckSlug}`" target="_blank">
            /{{ change.towTruckSlug }}
          </NuxtLink>
          <span v-if="change.companyName"> · {{ change.companyName }}</span>
          · {{ formatDateNumeric(change.createdAt) }}
        </p>
      </div>
      <AppBadge variant="accent">{{ change.fields.length }} փոփոխություն</AppBadge>
    </header>

    <ul class="pc-card__fields">
      <li v-for="entry in change.fields" :key="entry.field" class="pc-card__field">
        <span class="pc-card__field-name">{{ profileFieldLabel(entry.field) }}</span>
        <span class="pc-card__before">{{ formatProfileValue(entry.field, entry.before) }}</span>
        <AppIcon name="chevron-right" :size="16" class="pc-card__arrow" />
        <span class="pc-card__after">{{ formatProfileValue(entry.field, entry.after) }}</span>
      </li>
    </ul>

    <footer class="pc-card__actions">
      <AppButton variant="success" size="sm" :disabled="busy" @click="emit('approve')">
        Հաստատել
      </AppButton>
      <AppButton variant="outline" size="sm" :disabled="busy" @click="emit('reject')">
        Մերժել
      </AppButton>
    </footer>
  </article>
</template>

<style scoped lang="scss">
.pc-card {
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  padding: var(--space-4);
  box-shadow: var(--shadow-sm);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);

  &__header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-3);
  }

  &__title {
    margin: 0;
    font-size: 1.05rem;
  }

  &__meta {
    margin: var(--space-1) 0 0;
    font-size: 0.82rem;
    color: var(--color-text-muted);
  }

  &__fields {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  &__field {
    display: grid;
    grid-template-columns: 1fr;
    gap: var(--space-1);
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-md);
    background: var(--color-bg);
    font-size: 0.9rem;

    // Two columns only where there is room for both values plus the arrow.
    // Below that they stack, which keeps a long description readable instead of
    // squeezing it into a third of a phone screen.
    @media (min-width: 720px) {
      grid-template-columns: 200px 1fr auto 1fr;
      align-items: center;
      gap: var(--space-3);
    }
  }

  &__field-name {
    font-weight: 600;
  }

  &__before {
    color: var(--color-text-muted);
    text-decoration: line-through;
    word-break: break-word;
  }

  &__arrow {
    color: var(--color-text-muted);
    display: none;

    @media (min-width: 720px) {
      display: block;
    }
  }

  &__after {
    font-weight: 600;
    word-break: break-word;
  }

  &__actions {
    display: flex;
    gap: var(--space-2);
  }
}
</style>
