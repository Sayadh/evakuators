<script setup lang="ts">
import type { TowTruck } from '~/types/towTruck'

interface Props {
  towTruck: TowTruck
  /** compact layout for the mobile sticky bar */
  compact?: boolean
}

const props = withDefaults(defineProps<Props>(), { compact: false })

const {
  phoneHref,
  whatsappUrl,
  telegramUrl,
  emailHref,
  onPhoneClick,
  onWhatsAppClick,
  onTelegramClick,
  onEmailClick,
} = usePhoneActions(() => props.towTruck)
</script>

<template>
  <div class="contact-actions" :class="{ 'contact-actions--compact': compact }">
    <a
      :href="phoneHref"
      class="contact-actions__call"
      aria-label="Զանգահարել վարորդին"
      @click="onPhoneClick"
    >
      <AppIcon name="phone" :size="20" />
      <span>Զանգահարել</span>
    </a>
    <a
      v-if="whatsappUrl"
      :href="whatsappUrl"
      target="_blank"
      rel="noopener"
      class="contact-actions__secondary contact-actions__secondary--whatsapp"
      aria-label="Գրել WhatsApp-ով"
      @click="onWhatsAppClick"
    >
      <AppIcon name="whatsapp" :size="20" />
      <span v-if="!compact">WhatsApp</span>
    </a>
    <a
      v-if="telegramUrl && !compact"
      :href="telegramUrl"
      target="_blank"
      rel="noopener"
      class="contact-actions__secondary contact-actions__secondary--telegram"
      aria-label="Գրել Telegram-ով"
      @click="onTelegramClick"
    >
      <AppIcon name="telegram" :size="20" />
      <span>Telegram</span>
    </a>
    <a
      v-if="emailHref && !compact"
      :href="emailHref"
      class="contact-actions__secondary contact-actions__secondary--email"
      aria-label="Գրել email-ով"
      @click="onEmailClick"
    >
      <AppIcon name="mail" :size="20" />
      <span>Email</span>
    </a>
  </div>
</template>

<style scoped lang="scss">
.contact-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);

  &--compact {
    flex-wrap: nowrap;
    gap: var(--space-2);
  }

  /* Full-width call button on its own row, messengers share the next row */
  &__call {
    flex: 1 1 100%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    padding: var(--space-4) var(--space-5);
    border-radius: var(--radius-md);
    background: var(--color-success);
    color: #fff;
    font-size: 1.1rem;
    font-weight: 800;
    letter-spacing: 0.3px;
    transition: background var(--transition);

    &:hover {
      background: #178a49;
      color: #fff;
    }
  }

  &--compact &__call {
    flex: 1 1 auto;
    padding: var(--space-3) var(--space-4);
    font-size: 1rem;
  }

  &__secondary {
    flex: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    padding: var(--space-4);
    border-radius: var(--radius-md);
    font-weight: 700;
    transition: filter var(--transition);

    &:hover {
      filter: brightness(0.95);
    }

    &--whatsapp {
      background: var(--color-success-bg);
      color: var(--color-success);
    }

    &--telegram,
    &--email {
      background: rgba(20, 48, 79, 0.08);
      color: var(--color-primary);
    }
  }

  &--compact &__secondary {
    flex: 0 0 auto;
  }

  &--compact &__secondary {
    padding: var(--space-3);
  }
}
</style>
