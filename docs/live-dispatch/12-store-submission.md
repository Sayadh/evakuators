# Evakuators Driver — Google Play / App Store ներկայացում (գաղտնիություն)

> Սա տեխնիկական checklist է, **ոչ իրավական եզրակացություն**։ Գաղտնիության
> քաղաքականությունը (`/driver-app/privacy`) և ջնջման էջը (`/driver-app/delete-account`)
> պետք է ստուգի իրավաբան ներկայացնելուց առաջ։ Ոչինչ այստեղ չի նշանակում, որ
> հավելվածը արդեն ընդունված կամ հրապարակված է։ Կանոնները ստուգված են 2026-11-10։

## Ինչ է արված կոդում

| Պահանջ | Որտեղ |
| --- | --- |
| Prominent disclosure OS prompt-ից առաջ՝ «location», «նաև երբ հավելվածը փակ է», ֆունկցիաները, ով է տեսնում, պահման ժամկետ, հետ կանչելու ճանապարհ | `mobile/src/screens/PermissionsScreen.tsx`, `i18n permissions.*` |
| Համաձայնությունը կարելի է մերժել («Ոչ հիմա»), հավելվածը աշխատում է առանց location-ի (պատմություն, կարգավորումներ, ջնջում) | `App.tsx` (`permissionsSkipped`), `HomeScreen` «Միացնել տեղադրությունը» |
| OS prompt-երը միայն վարորդի սեղմումով, համաձայնությունից հետո | `PermissionsScreen` |
| Գաղտնիության քաղաքականության հղում հավելվածում | Login, Register, Permissions, Settings (`PRIVACY_POLICY_URL`) |
| Համաձայնության հետ կանչում | Settings → `DELETE /driver-app/consent/tracking` |
| Հաշվի ջնջում հավելվածում (ոչ ապաակտիվացում) | Settings → `POST /driver-app/me/delete` (`FleetAccess.deleteOwnAccount`) |
| Ջնջում առանց հավելվածի (Play web link) | `frontend/pages/driver-app/delete-account.vue` + ադմին «Ջնջել հաշիվը» (`/ops/dispatch/fleet/:id/delete-account`) |
| App privacy policy (անվանում է հավելվածը) | `frontend/pages/driver-app/privacy.vue` |
| iOS privacy manifest, NSPrivacyTracking=false | `mobile/app.config.ts` `ios.privacyManifests` |
| iOS purpose strings հայ/en/ru | `app.config.ts` + `mobile/locales/{en,ru}.json` |
| Չօգտագործվող զգայուն թույլտվությունները հանված են | `android.blockedPermissions` (SYSTEM_ALERT_WINDOW, READ/WRITE_EXTERNAL_STORAGE) |
| targetSdk 36 | Expo SDK 58 (ստուգված Mac-ում) |

## Ինչ պետք է անի տերը (console-ներում)

### Google Play Console
1. **Privacy policy URL**՝ `https://evakuators.am/driver-app/privacy` (App content → Privacy policy)։ Էջը պետք է լինի production-ում՝ deploy-ից հետո։
2. **Data safety**.
   - Location → *Precise location*՝ collected, **required** (պատվերների համար), purpose՝ App functionality; not shared for ads.
   - Personal info → Name, Phone number՝ collected (account management, app functionality)։
   - Device or other IDs՝ collected (device session, push token)։
   - **Photos (2026-11)** → *Photos*՝ collected, **optional**, purpose՝ App functionality (the vehicle photos of the driver's public profile; only the images the driver picks or takes). Shared? — No (published on the website by us, the developer).
   - Personal info → **Other info**՝ registration/profile answers (vehicle, services, prices, service areas), App functionality.
   - Encrypted in transit՝ Yes. Users can request deletion՝ Yes.
   - Account deletion URL՝ `https://evakuators.am/driver-app/delete-account`.
   - Shared? — OpenRouteService-ին գնում են միայն կոորդինատներ (service provider) — Google-ի սահմանմամբ service provider-ին փոխանցումը «sharing» չէ, բայց ստուգեք ձևի բացատրությունը։
3. **Sensitive permissions → Location permissions (background)** declaration.
   - Ընտրեք **մեկ** ֆունկցիա, օրինակ՝ «Receiving nearby tow-truck job offers and sharing live position with the dispatcher during an active job, while the driver is online».
   - ≤30 վրկ վիդեո (YouTube unlisted)՝ disclosure էկրան → համաձայնություն → «Allow all the time» → online → հավելվածը փակ → offer-ը գալիս է։
   - Test account (տես ներքևում)։
4. **Foreground service** declaration (Android 14+)՝ type `location`, նույն use case + վիդեո։
4a. **Full-screen intent** declaration (App content → *Full-screen intent*, 2026-11)․ հավելվածը օգտագործում է `USE_FULL_SCREEN_INTENT`, որ նոր պատվերի առաջարկը կողպված հեռախոսին բացվի ինչպես մուտքային զանգ/զարթուցիչ (ժամկետով առաջարկ, որին վարորդը պետք է պատասխանի վայրկյանների ընթացքում)։ Google-ը այն լռելյայն տալիս է միայն calling/alarm հավելվածներին․ մնացածի դեպքում վարորդը թույլատրում է ինքը (հավելվածը տանում է կարգավորման էջ)։ Կցեք կարճ վիդեո՝ կողպված հեռախոս → առաջարկը բացվում է → «Ընդունել»։
5. **Precise location declaration** — պարտադիր **2027-01-27**-ից (Oct 2026 policy update)։
6. **Trader status** (EU DSA) և developer verification՝ եթե դեռ արված չէ։
7. **App access**՝ demo վարորդի հեռախոս/գաղտնաբառ + նշում (պատրաստի տեքստը՝ § «App Review account»)։

### App Store Connect
1. **Privacy Policy URL**՝ նույնը։
2. **App Privacy** (nutrition labels). Precise Location, Name, Phone Number, Device ID, **Photos** (2026-11 — vehicle photos the driver chooses), **Other User Content** (profile answers) — *Linked to user*, *Not used for tracking*, purpose՝ App Functionality.
   Camera / Photo Library purpose strings are in `app.config.ts` + `locales/*.json`; the picker is only opened by the driver's tap.
3. **Review notes (անգլերեն)**՝ ինչու է պետք background location (online ժամանակ մոտակա պատվերներ, ակտիվ պատվերի ժամանակ դիսպետչերին ճանապարհը), որ «Not now»-ով հավելվածը աշխատում է, որտեղ է ջնջումը (Settings → Delete account)։
4. **Demo account** (§ «App Review account») + backend-ը review-ի ընթացքում **միացված** (`LIVE_DISPATCH_*` flag-երը staging/production-ում) + test պատվեր, որը կարող եք ուղարկել reviewer-ին։
5. ATT (App Tracking Transparency) **պետք չէ**՝ tracking չկա։
5a. **Critical Alerts** (ըստ ցանկության)․ դիմում՝ developer.apple.com/contact/request/notifications-critical-alerts-entitlement — հիմնավորում՝ ճանապարհին մնացած մարդկանց էվակուացիայի ժամկետով պատվերներ։ Հաստատումից հետո՝ `IOS_CRITICAL_ALERTS=true` (build) և `APNS_CRITICAL_ALERTS=true` (backend)։
6. Հավելվածի անունը store-ում = «Evakuators Driver» (նույնը, ինչ քաղաքականության մեջ)։

## App Review account (2026-11-12)

Reviewer-ը ինքը գրանցվել չի կարող (միայն +374 համարներ, հայտը սպասում է ադմինին), ուստի երկու store-ն էլ պահանջում են աշխատող մուտք։

- **Հեռախոս՝ `+374 00 000001`** (հավելվածում՝ `00000001`) — 00 կոդով օպերատոր չկա, իրական մարդու համար չէ։
- **Գաղտնաբառը repo-ում ՉԿԱ** (repo-ն հանրային է)․ այն պահված է տիրոջ մոտ՝ `evakuators-app/Claude outputs/App-Review-account.md`, որտեղ նաև App Store-ի Review Notes-ի և Google Play-ի App access-ի պատրաստի տեքստերն են (անգլերեն)։
- Ստեղծել / **վերականգնել ամեն submission-ից առաջ** (production սերվերում).
  ```bash
  cd backend && node scripts/create-review-account.js '<password>'   # կամ npm run review:account -- '<password>'
  ```
  Միայն այդ մեկ հաշիվն է ստեղծում/թարմացնում. էջը կայքում թաքցված է (`appOnly`), բազան՝ Երևան, հասանելիությունը ACTIVE, արգելափակումը հանված, 20 000 ֏ demo հաշիվ (մեկ անգամ, ադմինի մուտքագրում)։ Կրկին գործարկելը վերականգնում է գաղտնաբառն ու հասանելիությունը, եթե reviewer-ը փոխել կամ ջնջել է հաշիվը։

## Ներկայացնելուց առաջ ստուգել իրական սարքերով
- Android 14/15 և iOS 18+՝ disclosure → մերժել → հավելվածը աշխատում է; համաձայնվել → «Always» → հավելվածը փակ → offer գալիս է։
- Settings → հետ կանչել համաձայնությունը → tracking-ը դադարում է (Android notification-ը անհետանում է)։
- Settings → ջնջել հաշիվը → login էկրան; նույն համարով մուտքը մերժվում է; ադմինում «Վարորդը ջնջել է հաշիվը»։
- `PUSH_PROVIDER=fcm` production-ում; TestFlight upload-ից հետո Apple-ի email-ում privacy manifest-ի պակասող entries չկան։

## Աղբյուրներ
- Google Play՝ background location — https://support.google.com/googleplay/android-developer/answer/9799150
- Prominent disclosure — https://support.google.com/googleplay/android-developer/answer/11150561
- Account deletion — https://support.google.com/googleplay/android-developer/answer/13327111
- Foreground service declaration — https://support.google.com/googleplay/android-developer/answer/13392821
- Target API — https://developer.android.com/google/play/requirements/target-sdk
- App Review Guidelines (5.1.1, 5.1.2, 5.1.5, 2.1) — https://developer.apple.com/app-store/review/guidelines/
- Account deletion (Apple) — https://developer.apple.com/support/offering-account-deletion-in-your-app/
- App privacy details — https://developer.apple.com/app-store/user-privacy-and-data-use/
- Expo privacy manifests — https://docs.expo.dev/guides/apple-privacy/
