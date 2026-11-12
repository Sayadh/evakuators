/**
 * The text of the DRIVER APP privacy policy, as data.
 *
 * Rendered by TWO pages that must say exactly the same thing: the website's
 * `/driver-app/privacy` (the URL given to the App Store and Google Play) and
 * the app's own «Գաղտնիության քաղաքականություն» screen, which imports this
 * file directly (mobile/metro.config.js § "~/"). A policy the stores link to
 * and a policy the driver reads in the app are one text, never two copies.
 *
 * Pure data on purpose — no Vue, no Nuxt — so both renderers can import it.
 * A block is a paragraph (`p`) or a bulleted list (`ul`); an inline piece is
 * plain text, bold text, or a link. `to` starting with "/" is a page of this
 * website (the app opens it on evakuators.am); anything else is a full URL.
 *
 * Every statement must match what the code does — see the header of
 * constants/driverAppPrivacy.ts, and bump its version when the MEANING changes.
 */
import { PRIVACY_DATA_CONTROLLER } from './privacyConsent'
import { CONTACT_PHONE, SITE_NAME } from './site'
import { DRIVER_APP_NAME } from './driverAppPrivacy'
import { getPhoneHref, getTelegramPhoneUrl, getWhatsAppUrl } from '../utils/formatPhone'

export type PrivacyInline = string | { strong: string } | { link: string; to: string }
export type PrivacyBlock = { p: PrivacyInline[] } | { ul: PrivacyInline[][] }

export interface PrivacySection {
  id: string
  title: string
  /** `en` for the English summary (the page sets `lang` on it) */
  lang?: 'en'
  blocks: PrivacyBlock[]
}

const phone = { link: CONTACT_PHONE, to: getPhoneHref(CONTACT_PHONE) }

export const DRIVER_APP_PRIVACY_TITLE = `${DRIVER_APP_NAME} — գաղտնիության քաղաքականություն`

export const DRIVER_APP_PRIVACY_INTRO: PrivacyInline[] = [
  `Սույն քաղաքականությունը վերաբերում է ${DRIVER_APP_NAME} բջջային հավելվածին (iOS և Android), որով էվակուատորի վարորդները գրանցվում, ստանում և կատարում են ${SITE_NAME}-ի պատվերները։ Կայքի և կայքում հրապարակվող վարորդի էջի վերաբերյալ գործում է առանձին `,
  { link: 'կայքի գաղտնիության քաղաքականությունը', to: '/privacy' },
  '։',
]

export const DRIVER_APP_PRIVACY_SECTIONS: PrivacySection[] = [
  {
    id: 'controller',
    title: '1. Ո՞վ է մշակում տվյալները',
    blocks: [{ p: [`${PRIVACY_DATA_CONTROLLER}, ${SITE_NAME} հարթակի օպերատորը։ Հեռախոս՝ `, phone, '։'] }],
  },
  {
    id: 'data',
    title: '2. Ի՞նչ տվյալներ է հավաքում հավելվածը',
    blocks: [
      {
        ul: [
          [{ strong: 'Հաշիվ.' }, ' հեռախոսահամար, անուն, ազգանուն, գաղտնաբառ (պահվում է միայն հեշավորված տեսքով)։'],
          [
            { strong: 'Գրանցման և պրոֆիլի տվյալներ.' },
            ' հավելվածում գրանցվելիս կամ պրոֆիլը խմբագրելիս՝ նույն տվյալները, ինչ կայքում գրանցվելիս․ կապի միջոցներ (WhatsApp, Telegram), մեքենայի տվյալներ, ծառայություններ, սպասարկման տարածքներ, գներ, աշխատանքային ժամեր և էվակուատորի հիմնական տեղադիրքի կոորդինատներ (ըստ ցանկության)։',
          ],
          [
            { strong: 'Լուսանկարներ.' },
            ' միայն այն նկարները, որոնք Դուք ինքներդ ընտրում կամ նկարում եք մեքենայի համար։ Հավելվածը Ձեր պատկերասրահը չի դիտում և այլ նկարներ չի վերցնում։',
          ],
          [{ strong: 'Տեղադրություն (ճշգրիտ GPS)' }, ' — տես 3-րդ կետը։'],
          [{ strong: 'Սարք.' }, ' սարքի նույնացուցիչ, հարթակ (iOS/Android), հավելվածի տարբերակ և push ծանուցումների token։'],
          [
            { strong: 'Պատվերներ.' },
            ' Ձեր կատարած պատվերների ընթացքը (ընդունում, «Շարժվում եմ», «Տեղում եմ», ավարտ), համաձայնեցված գինը, չեղարկման կամ խնդրի պատճառներն ու մեկնաբանությունները։',
          ],
        ],
      },
      { p: ['Հավելվածը չի հավաքում կոնտակտներ, խոսափողի տվյալներ և գովազդային նույնացուցիչներ։ Տեսախցիկն օգտագործվում է միայն այն պահին, երբ Դուք ինքներդ նկարում եք մեքենայի լուսանկարը։'] },
    ],
  },
  {
    id: 'location',
    title: '3. Տեղադրություն, այդ թվում՝ երբ հավելվածը փակ է',
    blocks: [
      {
        p: [
          'Հավելվածը հավաքում է Ձեր սարքի ճշգրիտ տեղադրությունը ',
          { strong: 'նաև երբ հավելվածը փակ է կամ չի օգտագործվում' },
          ' (հետին պլանում), բայց միայն այս երկու դեպքում՝',
        ],
      },
      {
        ul: [
          ['երբ միացրել եք «Ընդունում եմ պատվերներ»՝ Ձեզ մոտակա պատվերներն առաջարկելու համար,'],
          ['երբ ունեք ընթացիկ պատվեր՝ օպերատորին Ձեր ճանապարհը դեպի հաճախորդը ցույց տալու համար։'],
        ],
      },
      {
        p: [
          'Երբ անջատում եք «Ընդունում եմ պատվերներ»-ը և ընթացիկ պատվեր չունեք, տեղադրության հավաքումը դադարում է։ Android-ում հավաքման ընթացքում ծանուցումների տողում միշտ երևում է համապատասխան ծանուցում։ Տեղադրությունն ուղարկվում է մոտավորապես րոպեն մեկ անգամ (ընթացիկ պատվերի ժամանակ՝ ավելի հաճախ)։',
        ],
      },
      {
        p: [
          'Տեղադրությունը հավաքվում է միայն Ձեր համաձայնությամբ, որը տալիս եք հավելվածում՝ նախքան սարքի թույլտվությունը խնդրելը։ Համաձայնությունը կարող եք հետ կանչել ցանկացած պահի՝ հավելվածի «Կարգավորումներ» բաժնից։ Հետ կանչելիս Դուք անցնում եք «անջատված» վիճակի և պատվերներ չեք ստանում։',
        ],
      },
    ],
  },
  {
    id: 'use',
    title: '4. Ինչի՞ համար ենք օգտագործում և ո՞ւմ է հասանելի',
    blocks: [
      {
        ul: [
          [{ strong: 'Պատվերների բաշխում.' }, ' գտնել Ձեզ մոտ պատվերները և հաշվարկել հեռավորությունն ու ժամանակը։'],
          [{ strong: 'Օպերատորներ.' }, ` ${SITE_NAME}-ի օպերատորները տեսնում են Ձեր ընթացիկ դիրքը և վիճակը՝ պատվերները կազմակերպելու համար։`],
          [
            { strong: 'Կայքի էջ.' },
            ` հավելվածում գրանցումը նույնն է, ինչ կայքում գրանցումը․ ադմինիստրատորի հաստատումից հետո Ձեր էջը հրապարակվում է ${SITE_NAME}-ում (անուն, հեռախոսահամար, կապի միջոցներ, մեքենայի տվյալներ և լուսանկարներ, ծառայություններ, գներ, տարածքներ)՝ ըստ գրանցման ժամանակ տրված համաձայնության և `,
            { link: 'կայքի գաղտնիության քաղաքականության', to: '/privacy' },
            '։ Գաղտնաբառը և տեղադիրքի ճշգրիտ կոորդինատները չեն հրապարակվում։',
          ],
          [
            { strong: 'Հաճախորդ.' },
            ' պատվերն ընդունելուց հետո Դուք տեսնում եք հաճախորդի հեռախոսահամարը։ Հաճախորդը Ձեր ճշգրիտ դիրքը չի տեսնում։',
          ],
          [
            { strong: 'Կայքի «Մոտակա էվակուատոր» որոնում.' },
            ' եթե Դուք կայքում ունեք հրապարակված էջ և հավելվածում միացված եք, այցելուն կարող է տեսնել, որ Դուք հիմա մոտակայքում եք և մոտավոր հեռավորությունը (կլորացված 100 մ-ով)։ Ձեր կոորդինատները այցելուին երբեք չեն փոխանցվում։',
          ],
          [
            { strong: 'Ծառայություններ մատուցողներ.' },
            ' երթուղու հեռավորությունը հաշվարկելու համար կոորդինատները կարող են ուղարկվել OpenRouteService երթուղագծման ծառայությանը, իսկ ծանուցումները առաքվում են Google Firebase Cloud Messaging-ի (Android) և Apple Push Notification Service-ի (iOS) միջոցով։',
          ],
        ],
      },
      { p: ['Մենք ', { strong: 'չենք վաճառում' }, ' Ձեր տվյալները, չենք օգտագործում դրանք գովազդի համար և չենք փոխանցում տվյալների բրոքերներին։'] },
    ],
  },
  {
    id: 'retention',
    title: '5. Որքա՞ն ժամանակ ենք պահում',
    blocks: [
      {
        ul: [
          ['Տեղադրության պատմությունը՝ մինչև 7 օր, որից հետո ավտոմատ ջնջվում է։ Պահվում է միայն Ձեր վերջին դիրքը։'],
          ['Հաշվի, պրոֆիլի և մեքենայի տվյալները, լուսանկարները՝ քանի դեռ հաշիվը կամ կայքի էջը գոյություն ունի։ Մերժված հայտի լուսանկարներն ավտոմատ ջնջվում են։'],
          ['Կատարված պատվերների գրառումները պահվում են որպես հարթակի գործարար գրառումներ (հաշվապահություն, վեճեր)։ Հաշիվը ջնջելուց հետո դրանք այլևս կապված չեն Ձեր անձնական տվյալների հետ։'],
        ],
      },
    ],
  },
  {
    id: 'delete',
    title: '6. Հաշվի ջնջում',
    blocks: [
      {
        p: [
          'Հավելվածում՝ ',
          { strong: 'Կարգավորումներ → Ջնջել հաշիվը' },
          ' (անհրաժեշտ է կրկին մուտքագրել գաղտնաբառը)։ Ջնջումը կատարվում է անմիջապես.',
        ],
      },
      {
        ul: [
          ['ջնջվում են տեղադրության ամբողջ պատմությունը և վերջին դիրքը, սարքերն ու push token-ները,'],
          ['միայն հավելվածի հին հաշիվների համար ջնջվում են նաև հեռախոսահամարը, անունը, գաղտնաբառը, մեքենայի նկարագրությունը և տեղադիրքը, իսկ համարով կարելի է նորից գրանցվել,'],
          ['կայքում էջ ունեցող վարորդների համար (այդ թվում՝ հավելվածում գրանցվածների) դադարում է միայն հավելվածից օգտվելը. կայքի էջը ջնջելու համար դիմեք մեզ,'],
          ['ջնջումը հնարավոր չէ, քանի դեռ ունեք ընթացիկ պատվեր կամ սպասող առաջարկ։'],
        ],
      },
      { p: ['Եթե հավելվածին հասանելիություն չունեք, տես ', { link: 'հաշվի ջնջման էջը', to: '/driver-app/delete-account' }, '։'] },
    ],
  },
  {
    id: 'rights',
    title: '7. Ձեր իրավունքները',
    blocks: [
      {
        p: [
          'Դուք կարող եք պահանջել Ձեր տվյալների պատճենը, ուղղումը կամ ջնջումը և ցանկացած պահի հետ կանչել տեղադրության համաձայնությունը։ Համաձայնության հետ կանչը հետադարձ ուժ չունի։',
        ],
      },
    ],
  },
  {
    id: 'security',
    title: '8. Անվտանգություն',
    blocks: [
      {
        p: [
          'Ամբողջ կապը ծածկագրված է (HTTPS)։ Գաղտնաբառերը պահվում են միակողմանի հեշավորված տեսքով։ Մուտքի token-ը պահվում է սարքի պաշտպանված պահոցում (Keychain / Keystore)։ Ելքը անմիջապես անվավեր է դարձնում տվյալ սարքի նստաշրջանը, իսկ հաշվի ջնջումը՝ բոլոր սարքերինը։',
        ],
      },
    ],
  },
  {
    id: 'contact',
    title: '9. Կապ',
    blocks: [
      {
        ul: [
          ['Հեռախոս՝ ', phone],
          [{ link: 'WhatsApp', to: getWhatsAppUrl(CONTACT_PHONE) }],
          [{ link: 'Telegram', to: getTelegramPhoneUrl(CONTACT_PHONE) }],
        ],
      },
    ],
  },
  {
    id: 'english',
    title: 'Summary in English',
    lang: 'en',
    blocks: [
      {
        p: [
          `${DRIVER_APP_NAME} is the driver app of ${SITE_NAME}. Signing up in the app is the website's registration: after an administrator approves it, the driver's profile — including the photos they chose to upload — is published on ${SITE_NAME} under the website privacy policy. The app collects the device's precise location, including in the background (when the app is closed or not in use), only while the driver has switched on "Accept orders" or has an active order — to offer nearby tow-truck jobs and to show dispatchers the route to the customer. The camera and photo library are used only when the driver picks a vehicle photo. Location history is deleted after 30 days. Data is not sold, not used for advertising and not shared with data brokers; it is processed by our dispatchers and by service providers for routing (OpenRouteService) and notifications (Firebase Cloud Messaging, Apple Push Notification Service). Consent can be withdrawn in Settings. App access can be deleted in the app under Settings → Delete account, or via `,
          { link: '/driver-app/delete-account', to: '/driver-app/delete-account' },
          '.',
        ],
      },
    ],
  },
]
