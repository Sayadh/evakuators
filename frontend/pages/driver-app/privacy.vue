<script setup lang="ts">
import { PRIVACY_DATA_CONTROLLER } from '~/constants/privacyConsent'
import { CONTACT_PHONE, SITE_NAME } from '~/constants/site'
import { DRIVER_APP_NAME, DRIVER_APP_PRIVACY_EFFECTIVE_DATE, DRIVER_APP_PRIVACY_VERSION } from '~/constants/driverAppPrivacy'
import { getPhoneHref, getTelegramPhoneUrl, getWhatsAppUrl } from '~/utils/formatPhone'

/**
 * Privacy policy of the DRIVER APP — the URL given to the App Store and
 * Google Play, and linked from inside the app. See constants/driverAppPrivacy.ts.
 *
 * Every number here is the code's: location history 30 days
 * (`locationHistoryRetentionDays` default), live position rounded to 100 m on
 * the public search (`nearby-live.service.ts`), Firebase Cloud Messaging for
 * push, OpenRouteService for routing. Change the page when the code changes.
 */
useSeoMetaData({
  title: `${DRIVER_APP_NAME} — գաղտնիության քաղաքականություն | ${SITE_NAME}`,
  description: `${DRIVER_APP_NAME} վարորդի հավելվածի գաղտնիության քաղաքականությունը՝ տեղադրության օգտագործում, պահման ժամկետներ, հաշվի ջնջում։`,
  path: '/driver-app/privacy',
})
</script>

<template>
  <div class="container static-page">
    <h1>{{ DRIVER_APP_NAME }} — գաղտնիության քաղաքականություն</h1>
    <p class="static-page__meta">
      Գործողության սկիզբ՝ {{ DRIVER_APP_PRIVACY_EFFECTIVE_DATE }} · Տարբերակ՝ {{ DRIVER_APP_PRIVACY_VERSION }} · Տվյալներ մշակող՝
      {{ PRIVACY_DATA_CONTROLLER }}
    </p>

    <div class="static-page__content">
      <p>
        Սույն քաղաքականությունը վերաբերում է {{ DRIVER_APP_NAME }} բջջային հավելվածին (iOS և Android), որով էվակուատորի
        վարորդները ստանում և կատարում են {{ SITE_NAME }}-ի պատվերները։ Կայքի վերաբերյալ գործում է առանձին
        <NuxtLink to="/privacy">կայքի գաղտնիության քաղաքականությունը</NuxtLink>։
      </p>

      <h2 id="controller">1. Ո՞վ է մշակում տվյալները</h2>
      <p>
        {{ PRIVACY_DATA_CONTROLLER }}, {{ SITE_NAME }} հարթակի օպերատորը։ Հեռախոս՝
        <a :href="getPhoneHref(CONTACT_PHONE)">{{ CONTACT_PHONE }}</a>։
      </p>

      <h2 id="data">2. Ի՞նչ տվյալներ է հավաքում հավելվածը</h2>
      <ul>
        <li><strong>Հաշիվ.</strong> հեռախոսահամար, անուն, գաղտնաբառ (պահվում է միայն հեշավորված տեսքով)։</li>
        <li>
          <strong>Մեքենա.</strong> մեքենայի տեսակ, անիվային ռոլիկների առկայություն, մակնիշ/մոդել/համարանիշ (ըստ ցանկության),
          էվակուատորի հիմնական տեղադիրքի կոորդինատներ (ըստ ցանկության)։
        </li>
        <li>
          <strong>Տեղադրություն (ճշգրիտ GPS)</strong> — տես 3-րդ կետը։
        </li>
        <li>
          <strong>Սարք.</strong> սարքի նույնացուցիչ, հարթակ (iOS/Android), հավելվածի տարբերակ և push ծանուցումների token։
        </li>
        <li>
          <strong>Պատվերներ.</strong> Ձեր կատարած պատվերների ընթացքը (ընդունում, «Շարժվում եմ», «Տեղում եմ», ավարտ),
          համաձայնեցված գինը, չեղարկման կամ խնդրի պատճառներն ու մեկնաբանությունները։
        </li>
      </ul>
      <p>Հավելվածը չի հավաքում կոնտակտներ, լուսանկարներ, խոսափողի կամ տեսախցիկի տվյալներ և գովազդային նույնացուցիչներ։</p>

      <h2 id="location">3. Տեղադրություն, այդ թվում՝ երբ հավելվածը փակ է</h2>
      <p>
        Հավելվածը հավաքում է Ձեր սարքի ճշգրիտ տեղադրությունը <strong>նաև երբ հավելվածը փակ է կամ չի օգտագործվում</strong>
        (հետին պլանում), բայց միայն այս երկու դեպքում՝
      </p>
      <ul>
        <li>երբ միացրել եք «Ընդունում եմ պատվերներ»՝ Ձեզ մոտակա պատվերներն առաջարկելու համար,</li>
        <li>երբ ունեք ընթացիկ պատվեր՝ օպերատորին Ձեր ճանապարհը դեպի հաճախորդը ցույց տալու համար։</li>
      </ul>
      <p>
        Երբ անջատում եք «Ընդունում եմ պատվերներ»-ը և ընթացիկ պատվեր չունեք, տեղադրության հավաքումը դադարում է։ Android-ում
        հավաքման ընթացքում ծանուցումների տողում միշտ երևում է համապատասխան ծանուցում։ Տեղադրությունն ուղարկվում է մոտավորապես
        րոպեն մեկ անգամ (ընթացիկ պատվերի ժամանակ՝ ավելի հաճախ)։
      </p>
      <p>
        Տեղադրությունը հավաքվում է միայն Ձեր համաձայնությամբ, որը տալիս եք հավելվածում՝ նախքան սարքի թույլտվությունը
        խնդրելը։ Համաձայնությունը կարող եք հետ կանչել ցանկացած պահի՝ հավելվածի «Կարգավորումներ» բաժնից։ Հետ կանչելիս
        Դուք անցնում եք «անջատված» վիճակի և պատվերներ չեք ստանում։
      </p>

      <h2 id="use">4. Ինչի՞ համար ենք օգտագործում և ո՞ւմ է հասանելի</h2>
      <ul>
        <li><strong>Պատվերների բաշխում.</strong> գտնել Ձեզ մոտ պատվերները և հաշվարկել հեռավորությունն ու ժամանակը։</li>
        <li><strong>Օպերատորներ.</strong> {{ SITE_NAME }}-ի օպերատորները տեսնում են Ձեր ընթացիկ դիրքը և վիճակը՝ պատվերները կազմակերպելու համար։</li>
        <li>
          <strong>Հաճախորդ.</strong> պատվերն ընդունելուց հետո Դուք տեսնում եք հաճախորդի հեռախոսահամարը։ Հաճախորդը Ձեր ճշգրիտ
          դիրքը չի տեսնում։
        </li>
        <li>
          <strong>Կայքի «Մոտակա էվակուատոր» որոնում.</strong> եթե Դուք կայքում ունեք հրապարակված էջ և հավելվածում
          միացված եք, այցելուն կարող է տեսնել, որ Դուք հիմա մոտակայքում եք և մոտավոր հեռավորությունը (կլորացված 100 մ-ով)։
          Ձեր կոորդինատները այցելուին երբեք չեն փոխանցվում։ Միայն հավելվածով գրանցված վարորդները կայքում չեն երևում։
        </li>
        <li>
          <strong>Ծառայություններ մատուցողներ.</strong> երթուղու հեռավորությունը հաշվարկելու համար կոորդինատները կարող են
          ուղարկվել OpenRouteService երթուղագծման ծառայությանը, իսկ ծանուցումները առաքվում են Google Firebase Cloud Messaging-ի
          (Android) և Apple Push Notification Service-ի (iOS) միջոցով։
        </li>
      </ul>
      <p>
        Մենք <strong>չենք վաճառում</strong> Ձեր տվյալները, չենք օգտագործում դրանք գովազդի համար և չենք փոխանցում
        տվյալների բրոքերներին։
      </p>

      <h2 id="retention">5. Որքա՞ն ժամանակ ենք պահում</h2>
      <ul>
        <li>Տեղադրության պատմությունը՝ մինչև 30 օր, որից հետո ավտոմատ ջնջվում է։ Պահվում է միայն Ձեր վերջին դիրքը։</li>
        <li>Հաշվի և մեքենայի տվյալները՝ քանի դեռ հաշիվը գոյություն ունի։</li>
        <li>
          Կատարված պատվերների գրառումները պահվում են որպես հարթակի գործարար գրառումներ (հաշվապահություն, վեճեր)։ Հաշիվը
          ջնջելուց հետո դրանք այլևս կապված չեն Ձեր անձնական տվյալների հետ։
        </li>
      </ul>

      <h2 id="delete">6. Հաշվի ջնջում</h2>
      <p>
        Հավելվածում՝ <strong>Կարգավորումներ → Ջնջել հաշիվը</strong> (անհրաժեշտ է կրկին մուտքագրել գաղտնաբառը)։ Ջնջումը
        կատարվում է անմիջապես.
      </p>
      <ul>
        <li>ջնջվում են տեղադրության ամբողջ պատմությունը և վերջին դիրքը, սարքերն ու push token-ները,</li>
        <li>
          միայն հավելվածով գրանցվածների համար ջնջվում են նաև հեռախոսահամարը, անունը, գաղտնաբառը, մեքենայի նկարագրությունը
          և տեղադիրքը, իսկ համարով կարելի է նորից գրանցվել,
        </li>
        <li>կայքի վարորդների համար դադարում է միայն հավելվածից օգտվելը. կայքի էջը առանձին հաշիվ է և ջնջվում է կայքի միջոցով,</li>
        <li>ջնջումը հնարավոր չէ, քանի դեռ ունեք ընթացիկ պատվեր կամ սպասող առաջարկ։</li>
      </ul>
      <p>
        Եթե հավելվածին հասանելիություն չունեք, տես
        <NuxtLink to="/driver-app/delete-account">հաշվի ջնջման էջը</NuxtLink>։
      </p>

      <h2 id="rights">7. Ձեր իրավունքները</h2>
      <p>
        Դուք կարող եք պահանջել Ձեր տվյալների պատճենը, ուղղումը կամ ջնջումը և ցանկացած պահի հետ կանչել տեղադրության
        համաձայնությունը։ Համաձայնության հետ կանչը հետադարձ ուժ չունի։
      </p>

      <h2 id="security">8. Անվտանգություն</h2>
      <p>
        Ամբողջ կապը ծածկագրված է (HTTPS)։ Գաղտնաբառերը պահվում են միակողմանի հեշավորված տեսքով։ Մուտքի token-ը պահվում է
        սարքի պաշտպանված պահոցում (Keychain / Keystore)։ Ելքը անմիջապես անվավեր է դարձնում տվյալ սարքի նստաշրջանը, իսկ հաշվի
        ջնջումը՝ բոլոր սարքերինը։
      </p>

      <h2 id="contact">9. Կապ</h2>
      <ul>
        <li>Հեռախոս՝ <a :href="getPhoneHref(CONTACT_PHONE)">{{ CONTACT_PHONE }}</a></li>
        <li><a :href="getWhatsAppUrl(CONTACT_PHONE)" target="_blank" rel="noopener">WhatsApp</a></li>
        <li><a :href="getTelegramPhoneUrl(CONTACT_PHONE)" target="_blank" rel="noopener">Telegram</a></li>
      </ul>

      <h2 id="english">Summary in English</h2>
      <p lang="en">
        {{ DRIVER_APP_NAME }} is the driver app of {{ SITE_NAME }}. It collects the device's precise location, including in the
        background (when the app is closed or not in use), only while the driver has switched on "Accept orders" or has an active
        order — to offer nearby tow-truck jobs and to show dispatchers the route to the customer. Location history is deleted
        after 30 days. Data is not sold, not used for advertising and not shared with data brokers; it is processed by our
        dispatchers and by service providers for routing (OpenRouteService) and notifications (Firebase Cloud Messaging, Apple
        Push Notification Service). Consent can be withdrawn in Settings. The account can be deleted in the app under Settings →
        Delete account, or via <NuxtLink to="/driver-app/delete-account">/driver-app/delete-account</NuxtLink>.
      </p>
    </div>
  </div>
</template>
