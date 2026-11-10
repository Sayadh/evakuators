<script setup lang="ts">
import { CONTACT_PHONE, SITE_NAME } from '~/constants/site'
import { DRIVER_APP_NAME } from '~/constants/driverAppPrivacy'
import { getPhoneHref, getTelegramPhoneUrl, getWhatsAppUrl } from '~/utils/formatPhone'

/**
 * Account deletion for the DRIVER APP outside the app — the "web link" Google
 * Play requires in the Data safety form (it must name the app, be easy to
 * find, and work without reinstalling the app). The primary path is in the
 * app (Settings → Delete account, FleetAccess.deleteOwnAccount); this page
 * is for a driver who no longer has the phone or the app.
 *
 * What is deleted and kept is the same text as /driver-app/privacy § 6 —
 * change both together.
 */
useSeoMetaData({
  title: `${DRIVER_APP_NAME} — հաշվի ջնջում | ${SITE_NAME}`,
  description: `Ինչպես ջնջել ${DRIVER_APP_NAME} վարորդի հավելվածի հաշիվը և տվյալները։`,
  path: '/driver-app/delete-account',
})
</script>

<template>
  <div class="container static-page">
    <h1>{{ DRIVER_APP_NAME }} — հաշվի և տվյալների ջնջում</h1>

    <div class="static-page__content">
      <h2>Հավելվածից (ամենաարագ ճանապարհը)</h2>
      <ol>
        <li>Բացեք {{ DRIVER_APP_NAME }} հավելվածը և մուտք գործեք։</li>
        <li>Գլխավոր էջում սեղմեք <strong>«Կարգավորումներ»</strong>։</li>
        <li>Սեղմեք <strong>«Ջնջել հաշիվը»</strong>, մուտքագրեք գաղտնաբառը և հաստատեք։</li>
      </ol>
      <p>Ջնջումը կատարվում է անմիջապես։</p>

      <h2>Առանց հավելվածի</h2>
      <p>
        Եթե այլևս չունեք հավելվածը կամ հեռախոսը, դիմեք մեզ այն հեռախոսահամարից, որով գրանցված եք, և նշեք, որ ցանկանում եք
        ջնջել {{ DRIVER_APP_NAME }} հավելվածի հաշիվը։ Ինքնությունը հաստատելուց հետո հաշիվը կջնջենք 7 օրվա ընթացքում և
        կտեղեկացնենք Ձեզ։
      </p>
      <ul>
        <li>Հեռախոս՝ <a :href="getPhoneHref(CONTACT_PHONE)">{{ CONTACT_PHONE }}</a></li>
        <li><a :href="getWhatsAppUrl(CONTACT_PHONE)" target="_blank" rel="noopener">WhatsApp</a></li>
        <li><a :href="getTelegramPhoneUrl(CONTACT_PHONE)" target="_blank" rel="noopener">Telegram</a></li>
      </ul>

      <h2>Ի՞նչ է ջնջվում և ի՞նչ է պահվում</h2>
      <ul>
        <li><strong>Ջնջվում են.</strong> տեղադրության ամբողջ պատմությունը և վերջին դիրքը, սարքերն ու push token-ները։</li>
        <li>
          <strong>Միայն հավելվածով գրանցվածների համար՝ նաև.</strong> հեռախոսահամարը, անունը, գաղտնաբառը, մեքենայի
          նկարագրությունը և տեղադիրքը։
        </li>
        <li>
          <strong>Կայքի վարորդների համար</strong> դադարում է միայն հավելվածից օգտվելը. կայքի էջը առանձին հաշիվ է, որը կարող եք
          ջնջել՝ դիմելով մեզ նույն կոնտակտներով։
        </li>
        <li>
          <strong>Պահվում են.</strong> կատարված պատվերների գրառումները՝ որպես հարթակի գործարար գրառումներ, առանց կապի Ձեր
          անձնական տվյալների հետ։
        </li>
      </ul>
      <p>
        Մանրամասները՝ <NuxtLink to="/driver-app/privacy">{{ DRIVER_APP_NAME }}-ի գաղտնիության քաղաքականության</NuxtLink> մեջ։
      </p>

      <h2>In English</h2>
      <p lang="en">
        To delete your {{ DRIVER_APP_NAME }} account: in the app, open Settings → Delete account and confirm with your password;
        it takes effect immediately. Without the app, contact us from your registered phone number at {{ CONTACT_PHONE }}
        (call, WhatsApp or Telegram); we delete the account within 7 days of verifying it is you. Deleted: location history,
        last position, devices and push tokens, and — for app-only accounts — phone number, name, password, vehicle description
        and base location. Kept: records of completed orders, no longer linked to your personal data.
      </p>
    </div>
  </div>
</template>
