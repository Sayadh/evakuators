<script setup lang="ts">
import { CONTACT_PHONE, CONTACT_TELEGRAM, SITE_NAME } from '~/constants/site'
import { getPhoneHref, getTelegramUrl, getWhatsAppUrl } from '~/utils/formatPhone'

useSeoMetaData({
  title: `Կապ մեզ հետ | ${SITE_NAME}`,
  description:
    'Կապվեք Evakuators.am թիմի հետ հեռախոսով կամ Telegram-ով։ Հարցեր, առաջարկներ և համագործակցություն։',
  path: '/contact',
})
</script>

<template>
  <div class="container contact-page">
    <h1>Կապ մեզ հետ</h1>
    <p class="contact-page__intro">
      Հարցերի, առաջարկների կամ համագործակցության համար կապվեք մեզ հետ ձեզ հարմար եղանակով։
    </p>

    <div class="contact-page__cards">
      <a :href="getPhoneHref(CONTACT_PHONE)" class="contact-page__card contact-page__card--phone">
        <span class="contact-page__icon" aria-hidden="true">
          <AppIcon name="phone" :size="26" />
        </span>
        <span class="contact-page__label">Զանգահարել</span>
        <span class="contact-page__value">{{ CONTACT_PHONE }}</span>
      </a>

      <a
        :href="getWhatsAppUrl(CONTACT_PHONE)"
        target="_blank"
        rel="noopener"
        class="contact-page__card contact-page__card--whatsapp"
      >
        <span class="contact-page__icon" aria-hidden="true">
          <AppIcon name="whatsapp" :size="26" />
        </span>
        <span class="contact-page__label">Գրել WhatsApp-ով</span>
        <span class="contact-page__value">{{ CONTACT_PHONE }}</span>
      </a>

      <a
        :href="getTelegramUrl(CONTACT_TELEGRAM)"
        target="_blank"
        rel="noopener"
        class="contact-page__card contact-page__card--telegram"
      >
        <span class="contact-page__icon" aria-hidden="true">
          <AppIcon name="telegram" :size="26" />
        </span>
        <span class="contact-page__label">Գրել Telegram-ով</span>
        <span class="contact-page__value">@{{ CONTACT_TELEGRAM }}</span>
      </a>
    </div>
  </div>
</template>

<style scoped lang="scss">
.contact-page {
  padding-bottom: var(--space-7);
  max-width: 760px;

  &__intro {
    color: var(--color-text-secondary);
    max-width: 560px;
    margin-bottom: var(--space-5);
  }

  &__cards {
    display: grid;
    grid-template-columns: 1fr;
    gap: var(--space-4);

    @media (min-width: 640px) {
      grid-template-columns: 1fr 1fr;
    }

    @media (min-width: 1024px) {
      grid-template-columns: repeat(3, 1fr);
    }
  }

  &__card {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-2);
    padding: var(--space-5);
    background: var(--color-surface);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-sm);
    border: 2px solid transparent;
    transition:
      box-shadow var(--transition),
      transform var(--transition),
      border-color var(--transition);

    &:hover {
      box-shadow: var(--shadow-md);
      transform: translateY(-2px);
    }

    &--phone {
      &:hover {
        border-color: var(--color-success);
      }

      .contact-page__icon {
        background: var(--color-success-bg);
        color: var(--color-success);
      }
    }

    &--whatsapp {
      &:hover {
        border-color: var(--color-success);
      }

      .contact-page__icon {
        background: var(--color-success-bg);
        color: var(--color-success);
      }
    }

    &--telegram {
      &:hover {
        border-color: var(--color-primary);
      }

      .contact-page__icon {
        background: rgba(20, 48, 79, 0.08);
        color: var(--color-primary);
      }
    }
  }

  &__icon {
    display: inline-flex;
    padding: var(--space-3);
    border-radius: 50%;
  }

  &__label {
    font-size: 0.9rem;
    color: var(--color-text-secondary);
  }

  &__value {
    font-size: 1.25rem;
    font-weight: 800;
    color: var(--color-text);
  }
}
</style>
