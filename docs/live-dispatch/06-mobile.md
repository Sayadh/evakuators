# Live dispatch — 06. Վարորդի հավելված (`mobile/`)

Երրորդ անկախ npm նախագիծ monorepo-ում (`frontend/`, `backend/`-ի նման՝ առանց
ընդհանուր կոդի)։ Expo SDK 58 (React Native 0.88), **development build** (CNG)։

## Ինչու Expo dev build, ոչ Expo Go, ոչ bare

- Background location-ը Android-ում պահանջում է foreground service, iOS-ում՝
  `UIBackgroundModes: location` + «Always»։ Expo-ի պաշտոնական փաստաթուղթը
  (Location, SDK 58) հստակ է՝ background location-ը Expo Go-ում iOS-ում չկա, և
  Android-ում foreground/background service-ները Expo Go-ում հասանելի չեն —
  պետք է development build։
- Push-ը պահանջում է FCM/APNs native կոնֆիգուրացիա (`@react-native-firebase`)։
- Dev build-ը տալիս է bare-ի native վերահսկողությունը, բայց native նախագծերը
  գեներացվում են `app.config.ts`-ից (`expo prebuild`) և չեն commit-վում։

## Կառուցվածք

```
mobile/
  index.ts                 background task + FCM handler registered BEFORE the UI
  App.tsx                  signed out (login · sign-up wizard · privacy) / signed in (4 tabs);
                           a live offer takes over the screen, a NEW active order opens itself
  app.config.ts            permissions, plugins, background modes — no secrets
  metro.config.js          `~/…` → ../frontend (the website's PURE modules — see below)
  eas.json                 development / preview / production profiles
  assets/ui/               line icons (tintable PNG @1x/2x/3x) + logo variants
  src/api/                 typed client (timeouts, idempotency, uncertain ≠ failed, multipart upload)
  src/auth/session.ts      token + device id in SecureStore (AFTER_FIRST_UNLOCK)
  src/navigation/          tabs (Home · Orders · Profile · More), a stack per tab, Android back
  src/ui/                  design tokens (the website palette) + component kit + icons
  src/shared/site.ts       the ONE seam to the website: its locale JSON (`siteT`) and catalogue labels
  src/forms/               the registration questions as RN field groups (sign-up AND profile editor)
  src/register/            wizard steps ↔ the website validator's error keys, on-device draft
  src/profile/             profile ⇄ form ⇄ UpdateMyTowTruckDto (port of dashboard.vue)
  src/media/               photo picking (expo-image-picker), the 1–6 photo set, resumable upload
  src/location/            TaskManager task, server-driven adaptive policy + jitter,
                           bounded offline buffer (300 fixes, oldest dropped)
  src/push/                FCM token/refresh, offer ring, notification actions
  src/realtime/socket.ts   WebSocket (auth in first frame), reconnect → snapshot
  src/state/               server snapshot + pending actions (never optimistic); profile cache
  src/i18n/                hy (default) + ru — type-checked parity
  src/screens/             Login, Register (wizard), Home, Offer, ActiveOrder, Request, Orders,
                           OrderDetail, Profile, ProfileEdit, More, PrivacyPolicy, PrivacySettings,
                           ChangePassword, Permissions
  test/                    pure-module tests (node:test)
```

## Գրանցում և պրոֆիլ = կայքի գրանցում և անձնական էջ (2026-11)

- Հավելվածում գրանցումը **կայքի գրանցումն է**՝ նույն դաշտերը, նկարներ (1–6), համաձայնություն, մոդերացիա, հաստատումից հետո՝ հանրային էջ։ Ավելանում է միայն գաղտնաբառը (`POST /driver-app/site-registrations`, տես `11-driver-access.md`)։
- Ձևի state-ը, validator-ը, payload-ը, աշխարհագրությունը, ծառայությունները և դաշտերի տեքստերը **կայքի ֆայլերն են**՝ ներմուծված `~/…`-ով (`metro.config.js`, `tsconfig.json` `paths`)։ Միայն մաքուր TS մոդուլներ (ոչ Vue/Nuxt) — `test/sharedForms.test.ts`-ը քայլում է բոլոր ներմուծումները և ձախողվում է հակառակ դեպքում։ Արդյունքում կայքում փոխված կանոնը հաջորդ build-ում փոխվում է նաև հավելվածում, պատճեն չկա։
- Պրոֆիլի խմբագրումը կայքի dashboard-ի կանոններն է (`profile/profileForm.ts`)․ պահպանումը **հերթագրվում է** մոդերացիայի (`PUT /driver-app/me/profile`), ոչ թե գրվում։
- Գաղտնիության քաղաքականության տեքստը մեկն է՝ `frontend/constants/driverAppPrivacyContent.ts`, որը ցուցադրում են և՛ կայքի `/driver-app/privacy` էջը, և՛ հավելվածի «Գաղտնիության քաղաքականություն» էկրանը։
- **EAS build**՝ monorepo-ում EAS-ը վերբեռնում է ամբողջ git repo-ն, ուստի `../frontend`-ը հասանելի է։ Տեղական build-ի համար էլ պետք է, որ `frontend/`-ը կողքին լինի։

### Նոր native package (մեկ անգամ)

```bash
cd mobile
npx expo install expo-image-picker   # camera + photo library for the vehicle photos
npx expo prebuild --clean && npx expo run:ios   # (or run:android) — a NEW dev build is required
```
Մինչև տեղադրելը հավելվածը աշխատում է, իսկ նկարների քայլը ցույց է տալիս «հասանելի չէ այս տարբերակում»։ `app.config.ts`-ն ավտոմատ ավելացնում է plugin-ը և iOS-ի `NSCameraUsageDescription` / `NSPhotoLibraryUsageDescription` տեքստերը (hy/en/ru)։

## Պատվերի «զանգ» կողպված հեռախոսին (2026-11)

Նոր առաջարկը կողպված հեռախոսին **զանգում է և բացվում էկրանին**, մինչև վարորդը պատասխանի (կամ ժամկետն անցնի / առաջարկը հետ կանչվի)։

| | Android | iOS |
| --- | --- | --- |
| Ինչպես | Տեղական native module `modules/offer-alert` (Kotlin)․ full-screen intent (ինչպես մուտքային զանգ), `FLAG_INSISTENT` ձայն՝ կրկնվում է մինչև պատասխանը, **ALARM** audio stream (լուռ/վիբրացիա ռեժիմը չի խլացնում), «Ընդունել»/«Մերժել» կոճակներ | APNs time-sensitive ծանուցում `offer_alert.wav`-ով, սերվերը կրկնում է ~10 վ-ը մեկ մինչև պատասխանը; Critical Alerts՝ Apple-ի հաստատումից հետո |
| Էկրանին | Կողպված էկրանի վրա բացվում է հավելվածը՝ առաջարկով (`setShowWhenLocked`), պատասխանից հետո նորից կողպեքի ետևում է | Ծանուցումը կողպված էկրանին. App Store-ում «էկրանի վրա բացվել» թույլատրված է միայն զանգերի (CallKit/VoIP) հավելվածներին |
| Կանգ | Պատասխան, «Անջատել ձայնը», ժամկետ (`setTimeoutAfter` = սերվերի deadline), լուռ push `offer_closed` (հետ կանչված/ժամկետանց) | Ժամկետ, սերվերը դադարում է կրկնել |

- Սկզբում հնչում է անմիջապես (ժամանակավոր 60 վ), հետո `POST /offers/:id/ack`-ի պատասխանի `expiresAt`-ով ճշտվում է՝ դանդաղ ցանցը չի ուշացնում զանգը։
- **«Պատվերների ծանուցումներ»** էկրան (Ավելին → կամ Home-ի զգուշացում)․ ստուգում է ծանուցումները, ալիքը, Android 14+ «Full screen notifications», զարթուցիչի ձայնը (պարտադիր), «Do Not Disturb»-ի շրջանցում և մարտկոցի խնայողություն (խորհուրդ), և **«Փորձարկել»**՝ 5 վ հետո փորձնական զանգ, որ վարորդը կողպի հեռախոսը և տեսնի։
- Native module-ը նոր է → **պետք է նոր development build** (`npx expo prebuild --clean && npx expo run:android`)։ Առանց դրա հավելվածը աշխատում է հին ծանուցումով, իսկ ստուգման էկրանը ասում է «թարմացրեք»։
- iOS Critical Alerts՝ `IOS_CRITICAL_ALERTS=true` build-ում (entitlement) + backend `APNS_CRITICAL_ALERTS=true`, **միայն Apple-ի հաստատումից հետո** (հակառակ դեպքում signing-ը ձախողվում է)։

## Հիմնական կանոններ (և որտեղ են դրանք պարտադրվում)

| Կանոն | Որտեղ |
| --- | --- |
| Accept-ի հաջողությունը միայն սերվերի հաստատումից հետո | `state/AppState.tsx`, `pendingActions.ts` (թեստ) |
| Կապի կորստի ժամանակ՝ «ստուգում ենք», ոչ հաջողություն/ձախողում | `UncertainError` → `reconcile()` snapshot-ի դեմ |
| Retry-ը նույն idempotency key-ով | `PendingAction.idempotencyKey` |
| «Անորոշ» գործողությունը նորից է ուղարկվում ամեն snapshot-ից հետո (առավելագույնը 5 վ-ը մեկ), ոչ միայն WebSocket-ի վերամիացման ժամանակ. քայլը, գինը և հարցումը հաստատվում են, երբ snapshot-ը ցույց է տալիս, որ պատվերն առաջ է գնացել (2026-11-19) | `reconcile()`, `dueForRetry()` |
| Նույն բանի երկրորդ սեղմումը, մինչ առաջինը ճանապարհին է, ոչ մի հարցում չի ուղարկում. էկրանը ցույց է տալիս նույն տեսակի ամենավերջին գործողությունը, իսկ հին սխալը չի մնում հաջորդ քայլի տակ | `isBusy()`, `latestFor()`, `track()` |
| Ավելի հին snapshot-ը (ուշացած պատասխան) չի փոխարինում ավելի նորին. պատասխանած առաջարկը չի վերադառնում | `isNewerSnapshot()` |
| Logout-ի ժամանակ սպասվող գործողությունները ջնջվում են. հաջորդ վարորդը դրանք չի ժառանգում | `forceLogout` |
| Countdown-ը սերվերի ժամացույցով | `domain/countdown.ts` (թեստ) |
| Հաճախորդի կոնտակտը միայն ընդունումից հետո | API-ն չի ուղարկում; `OfferScreen` (թեստ) |
| Offline-ում buffer-ը սահմանափակ է, հին կետերը՝ պատմություն | `location/buffer.ts` (թեստ) + սերվեր |
| Offline ընտրված + ակտիվ պատվեր չկա → tracking-ը դադարում է | սերվերի policy `OFF` → `stopTracking()` |
| Token-ները secure storage-ում | `auth/session.ts` |
| Տեքստերը hardcode չեն | `i18n/hy.ts`, `ru.ts` (parity թեստ); գրանցման դաշտերը՝ կայքի `hy.json`/`ru.json` |
| Գրանցման/խմբագրման կանոնները կայքինն են | `~/utils/registrationForm` և այլն (`test/sharedForms.test.ts`) |

## Build և signing

Նախապայմաններ (**բացակայում են, պետք է տրամադրի նախագծի տերը**)՝ Firebase project
(`google-services.json`, `GoogleService-Info.plist`), APNs Auth Key (.p8) վերբեռնված
Firebase-ում, Apple Developer Team, Google Play Console հաշիվ, Expo/EAS հաշիվ։

```bash
cd mobile
npm install
npx expo install --fix          # pins every Expo/RN package to SDK 58-compatible versions
npx expo-doctor@latest
cp .env.example .env            # EXPO_PUBLIC_API_BASE_URL=staging
# put google-services.json and GoogleService-Info.plist next to app.config.ts (gitignored)

# Local development build on a USB-connected device
npx expo run:android
npx expo run:ios                 # macOS + Xcode

# Or with EAS
npx eas-cli build --profile development --platform android
npx eas-cli build --profile development --platform ios
npx eas-cli build --profile production --platform all     # store builds (signing via EAS credentials)
```

Android signing՝ EAS-managed keystore կամ սեփական upload key (Play App Signing)։
iOS՝ EAS-managed distribution certificate + provisioning profile։ Google Play-ում
`FOREGROUND_SERVICE_LOCATION` և background location-ը պահանջում են **Play Console-ի
declaration և review** (ըստ Expo Location փաստաթղթի)։ App Store-ում «Always»
location-ի համար պետք է հիմնավորում review-ի ժամանակ։

**Հավելվածները խանութներում հասանելի ՉԵՆ** — ոչ build, ոչ հրապարակում չի կատարվել։

`package.json`-ում որոշ տարբերակներ (`@react-native-firebase/*`, `react`) նշված
են `*`, քանի որ npm registry-ն հասանելի չէր դրանք ստուգելու համար։ Առաջին
`npx expo install --fix`-ից հետո ամրագրեք ստացված տարբերակները և commit արեք lock ֆայլը։

## Real-device checklist (ՉՍՏՈՒԳՎԱԾ — պետք է կատարել իրական սարքերով)

| # | Սցենար | Android | iOS | Սպասվող արդյունք |
| --- | --- | --- | --- | --- |
| 1 | Մուտք, consent, թույլտվություններ (foreground → background → notifications) | ☐ | ☐ | Յուրաքանչյուր մերժում ունի իր հաղորդագրությունը և «Բացել կարգավորումները» |
| 2 | Online → GPS-ը սերվերում թարմ (admin map), offline → tracking-ը կանգ է առնում | ☐ | ☐ | Foreground service notification-ը Android-ում երևում/անհետանում է |
| 3 | Էկրանն անջատված 10 ր, online | ☐ | ☐ | Fix-եր շարունակվում են (iOS-ում ըստ OS-ի հաճախականության) |
| 4 | Battery saver / Low Power Mode | ☐ | ☐ | Fix-երը կարող են նոսրանալ — admin map-ում GPS age-ը աճում է, dispatch-ը բաց է թողնում (ոչ սխալ) |
| 5 | Permission revoked Settings-ից աշխատանքի ընթացքում | ☐ | ☐ | Հավելվածը վերադառնում է Permissions էկրան, սերվերում GPS-ը հնանում է |
| 6 | App background / terminated (swipe away) | ☐ | ☐ | Android՝ service-ը շարունակում է (`killServiceOnDestroy: false`); iOS՝ significant-change-ի սահմանափակումներ |
| 7 | Ինտերնետի կորուստ 5 ր, հետո վերականգնում | ☐ | ☐ | Buffer-ը ուղարկվում է, հին կետերը՝ `late`, current-ը չի «հետ գնում» |
| 8 | Offer push lock screen-ին, tap | ☐ | ☐ | Lock screen-ին հասցե/հեռախոս չկա; բացվում է Offer էկրանը սերվերի վիճակով |
| 9 | Push deadline-ից հետո (թողնել 40 վ) | ☐ | ☐ | Offer էկրան չկա, «ժամկետն անցել է» |
| 10 | Accept առանց ինտերնետի | ☐ | ☐ | «Ստուգում ենք…», ոչ «Ընդունված» |
| 11 | Սարքի փոփոխություն (login 2-րդ սարքից) | ☐ | ☐ | 1-ին սարքը 401 → login էկրան; 1-ին սարքի GPS-ը չի ընդունվում |
| 12 | Ակտիվ պատվեր, «Նավիգացիա» | ☐ | ☐ | Բացվում է Google Maps / Apple Maps |
| 13 | Ռուսերեն լեզու | ☐ | ☐ | Բոլոր էկրանները ռուսերեն |

## Բաց թողնված պատվերներ, պրոֆիլ, զանգի ձայն (2026-11-12)

- **Բաց թողնված պատվերներ.** `GET /driver-app/orders/missed` — վարորդի `EXPIRED` առաջարկները (ոչ մերժվածները, ոչ հետ կանչվածները), նորից հին, `?before=<offeredAt>` էջավորմամբ։ Ամեն տարր՝ երբ, որտեղից/ուր, որքան հեռու էր, **ինչու** (`NOT_DELIVERED` — չի հասել հեռախոսին, `TOO_LATE`, `NO_ANSWER`) և **ինչ եղավ** պատվերը (`TAKEN` / `CANCELLED` / `OPEN` / `CLOSED`)։ Երբեք՝ հաճախորդի կոնտակտը կամ թե ով վերցրեց։ Հավելվածում՝ «Պատվերներ» tab-ի վերևի քարտ → `MissedOffersScreen`, Home-ի «Բաց եք թողել N պատվեր» և tab-ի badge (նորերը՝ վերջին դիտումից հետո, `state/missedOffers.tsx`)։ `NOT_DELIVERED`-ի դեպքում էկրանը տանում է ծանուցումների կարգավորմանը։
- **Պրոֆիլ.** `profile/ProfileDetails.tsx`-ը ցույց է տալիս գրանցման **բոլոր** դաշտերը՝ կայքի իսկ պիտակներով (`siteT`), դատարկը՝ «Նշված չէ»։ Ամեն բաժին ունի «Փոխել» → moderation։
- **Զանգի ձայն.** Բաց հավելվածի կարճ զանգն էլ (`offerAlert.ts`) հիմա ընտրված ձայնով է։ Ձայնային ֆայլերը iOS/Android նախագծում հայտնվում են **միայն `npx expo prebuild --clean`-ից հետո** — առանց դրա iOS-ը նվագում է միայն `offer_alert.wav`-ը (կամ ստանդարտ ձայնը)։

## Կողպված հեռախոս և «Կապ չկա», մեկ սեղմումով մերժում (2026-11-14)

- **Խնդիրը.** Կողպված և անշարժ հեռախոսին Android-ը (Doze, արտադրողի battery saver) GPS կետեր չի տալիս, իսկ background heartbeat-ը գնում է միայն կետի հետ։ 90 վ հետո (`heartbeatMaxAgeSeconds`) վարորդը դառնում էր «Կապ չկա» և պատվերներ չէր ստանում, մինչև app-ը չբացեր։
- **Wake push.** Worker-ը 15 վ-ը մեկ (`PushService.wakeStaleDrivers`) Online վարորդին, որի heartbeat-ը 50 վ-ից հին է (բայց 6 ժամից ոչ հին), ուղարկում է լուռ high-priority FCM `{type: 'wake'}`, առավելագույնը րոպեն մեկ։ App-ի background handler-ը (`tracking.ts` `wakeFromPush`) ուղարկում է heartbeat և թարմ GPS կետ, անհրաժեշտության դեպքում վերագործարկում է location task-ը։
- **Մարտկոցի խնայողությունը** Android-ում հիմա պարտադիր ստուգում է (`alertReadiness.ts`)․ Home-ը զգուշացնում է, իսկ Online միացնելիս app-ը առաջարկում է բացել կարգավորումները («Հետո»-ն էլ միացնում է Online)։
- **Մերժում.** «Մերժել»-ը այլևս պատճառ չի հարցնում․ մեկ սեղմում, առաջարկն անմիջապես անցնում է հաջորդ վարորդին։

## Ծանուցում կապի / GPS-ի խնդրի մասին (2026-11-16)

Online վարորդը (կամ ակտիվ պատվեր ունեցողը) ձայնով ծանուցում է ստանում, թե ինչն է խափանված և ինչ անել՝ 3 րոպե սպասելուց հետո (wake push-ի համար), հետո ժամը մեկ, առավելագույնը 3 անգամ մեկ խնդրի համար (2026-11-18)։ Խնդիրը վերանալուն պես հաշվիչը զրոյանում է։

| Խնդիր | Ով է նկատում | Ծանուցում |
| --- | --- | --- |
| Կապ չկա (heartbeat > 90 + 60 վ, wake push-ը չօգնեց) | Worker (`PushService.alertProblemDrivers`, `notify/problem-alert.ts`) | «⚠️ Կապ չկա սերվերի հետ… Բացեք հավելվածը» |
| GPS չի աշխատում (heartbeat թարմ, կետ չկա կամ > 120 + 30 վ) | Worker | «⚠️ GPS-ը չի աշխատում… Միացրեք տեղադրությունը» |
| Ինտերնետ չկա (2 րոպե ուղարկումները ձախողվում են) | App-ը ինքը (`location/netAlert.ts`, `push/problemNotification.ts`) | «⚠️ Ինտերնետ չկա…» |

- Android-ում ծանուցումները գնում են առանձին `driver_problems` ալիքով («Կապի և GPS-ի խնդիրներ»), համակարգային ձայնով, ոչ պատվերի զանգով։
- Վիճակը պահվում է `DriverPresence`-ում (`problemAlertReason`, `problemAlertCount`, `problemAlertAt`, migration `20261116200000_driver_problem_alert`)․ ադմինի `/admin/orders/drivers` էջում երևում է «🔔 GPS-ը չի աշխատում · ծանուցված է 21:15 (1/3)»։

## Cancel screen (2026-11-17)

- No auto-send. The 45 s countdown that sent `NOT_SPECIFIED` is gone: nothing
  leaves the phone without the driver's choice. While the screen stays open a
  short ring + vibration every 10 s («Եթե պետք է չեղարկել, արեք հիմա», through
  `startOfferAlert`), and after 3 minutes one `POST /driver-app/orders/:id/cancel-stalled`
  → `DRIVER_CANCEL_STALLED` alert, so the operator calls the driver.
- New reason «Հաճախորդը կզանգի» (`CUSTOMER_WILL_CALL`), listed first.
- «Գինը չհամաձայնեցվեց» asks what the driver asked (required — the server
  refuses the cancel without it) and what the customer wanted (optional). Both
  show on the operator's incident banner.
- Every cancel refunds the fee; the screen says so (see 13-wallet.md).

## Updates without a new APK — EAS Update (2026-11-17)

`expo-updates` is installed; builds carry a channel (`eas.json`:
development / preview / production) and `runtimeVersion: { policy: 'appVersion' }`.

- **JS-only change** (screens, texts, logic): from `mobile/`,
  `npm run update:preview -- "what changed"` (or `update:production`). The
  script takes `EXPO_PUBLIC_API_BASE_URL` from the same `eas.json` profile the
  build used — a bare `eas update` would bake in `mobile/.env` (localhost) and
  break every installed app — refuses a localhost URL, runs `tsc` and the
  tests, then publishes. Phones download it on the next start and apply it on
  the start after that (`checkAutomatically: ON_LOAD`, no reload mid-order).
- **Native change** (new package with native code, permission, config plugin,
  sound, icon): bump `version` in `app.config.ts` AND build a new APK. The old
  binary keeps getting only updates for its own version, so it never runs JS
  that calls native code it lacks.
- **First time**: the build installed today has no `expo-updates`, so ONE new
  APK is needed; every JS change after it ships OTA.
- Rollback: `npx eas-cli update:republish` (or publish the previous commit).
- Crash reports (`mobile/src/telemetry/`) carry the running update id in
  `release` («1.0.0-a·3f9c2d1e»), so an error can be tied to the update.

## Doze (կողպված և անշարժ հեռախոս), 2026-11-18

Կանգնած, կողպված հեռախոսը մի քանի րոպեից մտնում է Android-ի խոր Doze․ ցանցը
անջատվում է, heartbeat-ն ու GPS-ը դադարում են, մինչև սերվերի «wake» push-ը
կամ Doze-ի պատուհանը։ Լուծումը՝ մարտկոցի օպտիմալացումից ազատում․ «Մարտկոց»
ստուգումը (`alertReadiness.ts`) և Online-ի պահին նախազգուշացումը բացում են
համակարգի մեկ-սեղմումով պատուհանը (`ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`,
`modules/offer-alert`), իսկ եթե արտադրողը այն թաքցրել է՝ ցանկը, հետո
հավելվածի էջը։ Native փոփոխություն է → `version` 1.0.1, նոր APK։ Սերվերում
կեղծ «կապ չկա» / «GPS չկա» ազդանշանները հետաձգված են 3 րոպեով
(`problem-alert.ts` `CONNECTION_GRACE_SECONDS` / `GPS_GRACE_SECONDS`)․ Doze-ի
կարճ քունը, որից wake push-ը ինքն է հանում, այլևս ծանուցում չի տալիս։

**Ճշգրտություն (2026-11-18).** Տեղորոշումը միշտ `Accuracy.High` է (իրական GPS), նաև առանց
պատվերի։ «Balanced»-ը կողպված հեռախոսում շենքի ներսում տալիս էր Wi-Fi/աշտարակի դիրք՝
`gpsMaxAccuracyMeters`-ից (150 մ) անճշգրիտ, սերվերը մերժում էր այն, և վարորդը երևում էր
«GPS չկա»։ Ադմինում վարորդի մոտ `gpsDiagnosis` (frontend/utils/opsDispatchLabels.ts) ասում է
պատճառը՝ հավելվածը չի պատասխանում (Doze/ինտերնետ), դիրքը անճշգրիտ է (±X մ), նոր դիրք
չկա, կամ դիրքը մերժվել է որպես կեղծ։
