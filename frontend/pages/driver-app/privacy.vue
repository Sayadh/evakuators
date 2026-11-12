<script setup lang="ts">
import { PRIVACY_DATA_CONTROLLER } from '~/constants/privacyConsent'
import { SITE_NAME } from '~/constants/site'
import { DRIVER_APP_NAME, DRIVER_APP_PRIVACY_EFFECTIVE_DATE, DRIVER_APP_PRIVACY_VERSION } from '~/constants/driverAppPrivacy'
import {
  DRIVER_APP_PRIVACY_INTRO,
  DRIVER_APP_PRIVACY_SECTIONS,
  DRIVER_APP_PRIVACY_TITLE,
  type PrivacyInline,
} from '~/constants/driverAppPrivacyContent'

/**
 * Privacy policy of the DRIVER APP — the URL given to the App Store and
 * Google Play, and the same text the app shows on its own privacy screen.
 *
 * The words live in constants/driverAppPrivacyContent.ts (shared with the app,
 * so the two can never say different things); this page only renders them.
 *
 * Every number there is the code's: location history 7 days
 * (`locationHistoryRetentionDays` default), live position rounded to 100 m on
 * the public search (`nearby-live.service.ts`), Firebase Cloud Messaging for
 * push, OpenRouteService for routing. Change the text when the code changes.
 */
useSeoMetaData({
  title: `${DRIVER_APP_NAME} — գաղտնիության քաղաքականություն | ${SITE_NAME}`,
  description: `${DRIVER_APP_NAME} վարորդի հավելվածի գաղտնիության քաղաքականությունը՝ տեղադրության օգտագործում, պահման ժամկետներ, հաշվի ջնջում։`,
  path: '/driver-app/privacy',
})

const isText = (piece: PrivacyInline): piece is string => typeof piece === 'string'
const isStrong = (piece: PrivacyInline): piece is { strong: string } => typeof piece === 'object' && 'strong' in piece
const isInternal = (to: string): boolean => to.startsWith('/')
const isExternalWeb = (to: string): boolean => to.startsWith('http')
</script>

<template>
  <div class="container static-page">
    <h1>{{ DRIVER_APP_PRIVACY_TITLE }}</h1>
    <p class="static-page__meta">
      Գործողության սկիզբ՝ {{ DRIVER_APP_PRIVACY_EFFECTIVE_DATE }} · Տարբերակ՝ {{ DRIVER_APP_PRIVACY_VERSION }} · Տվյալներ մշակող՝
      {{ PRIVACY_DATA_CONTROLLER }}
    </p>

    <div class="static-page__content">
      <p>
        <template v-for="(piece, i) in DRIVER_APP_PRIVACY_INTRO" :key="i">
          <template v-if="isText(piece)">{{ piece }}</template>
          <strong v-else-if="isStrong(piece)">{{ piece.strong }}</strong>
          <NuxtLink v-else-if="isInternal(piece.to)" :to="piece.to">{{ piece.link }}</NuxtLink>
          <a v-else :href="piece.to" :target="isExternalWeb(piece.to) ? '_blank' : undefined" :rel="isExternalWeb(piece.to) ? 'noopener' : undefined">{{ piece.link }}</a>
        </template>
      </p>

      <template v-for="section in DRIVER_APP_PRIVACY_SECTIONS" :key="section.id">
        <h2 :id="section.id">{{ section.title }}</h2>
        <template v-for="(block, b) in section.blocks" :key="`${section.id}-${b}`">
          <p v-if="'p' in block" :lang="section.lang">
            <template v-for="(piece, i) in block.p" :key="i">
              <template v-if="isText(piece)">{{ piece }}</template>
              <strong v-else-if="isStrong(piece)">{{ piece.strong }}</strong>
              <NuxtLink v-else-if="isInternal(piece.to)" :to="piece.to">{{ piece.link }}</NuxtLink>
              <a v-else :href="piece.to" :target="isExternalWeb(piece.to) ? '_blank' : undefined" :rel="isExternalWeb(piece.to) ? 'noopener' : undefined">{{ piece.link }}</a>
            </template>
          </p>
          <ul v-else :lang="section.lang">
            <li v-for="(item, l) in block.ul" :key="l">
              <template v-for="(piece, i) in item" :key="i">
                <template v-if="isText(piece)">{{ piece }}</template>
                <strong v-else-if="isStrong(piece)">{{ piece.strong }}</strong>
                <NuxtLink v-else-if="isInternal(piece.to)" :to="piece.to">{{ piece.link }}</NuxtLink>
                <a v-else :href="piece.to" :target="isExternalWeb(piece.to) ? '_blank' : undefined" :rel="isExternalWeb(piece.to) ? 'noopener' : undefined">{{ piece.link }}</a>
              </template>
            </li>
          </ul>
        </template>
      </template>
    </div>
  </div>
</template>
