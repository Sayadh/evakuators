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
  App.tsx                  routing by server state (offer > active order > home)
  app.config.ts            permissions, plugins, background modes — no secrets
  eas.json                 development / preview / production profiles
  src/api/                 typed client (timeouts, idempotency, uncertain ≠ failed)
  src/auth/session.ts      token + device id in SecureStore (AFTER_FIRST_UNLOCK)
  src/location/            TaskManager task, server-driven adaptive policy + jitter,
                           bounded offline buffer (300 fixes, oldest dropped)
  src/push/push.ts         FCM token/refresh, foreground/opened/initial → re-read state
  src/realtime/socket.ts   WebSocket (auth in first frame), reconnect → snapshot
  src/state/               server snapshot + pending actions (never optimistic)
  src/i18n/                hy (default) + ru — type-checked parity
  src/screens/             Login, Permissions, Home, Offer, ActiveOrder, Request, History, Settings
  test/                    pure-module tests (node:test)
```

## Հիմնական կանոններ (և որտեղ են դրանք պարտադրվում)

| Կանոն | Որտեղ |
| --- | --- |
| Accept-ի հաջողությունը միայն սերվերի հաստատումից հետո | `state/AppState.tsx`, `pendingActions.ts` (թեստ) |
| Կապի կորստի ժամանակ՝ «ստուգում ենք», ոչ հաջողություն/ձախողում | `UncertainError` → `reconcile()` snapshot-ի դեմ |
| Retry-ը նույն idempotency key-ով | `PendingAction.idempotencyKey` |
| Countdown-ը սերվերի ժամացույցով | `domain/countdown.ts` (թեստ) |
| Հաճախորդի կոնտակտը միայն ընդունումից հետո | API-ն չի ուղարկում; `OfferScreen` (թեստ) |
| Offline-ում buffer-ը սահմանափակ է, հին կետերը՝ պատմություն | `location/buffer.ts` (թեստ) + սերվեր |
| Offline ընտրված + ակտիվ պատվեր չկա → tracking-ը դադարում է | սերվերի policy `OFF` → `stopTracking()` |
| Token-ները secure storage-ում | `auth/session.ts` |
| Տեքստերը hardcode չեն | `i18n/hy.ts`, `ru.ts` (parity թեստ) |

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
