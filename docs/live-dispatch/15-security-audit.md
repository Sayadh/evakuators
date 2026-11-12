# Live dispatch — 15. Անվտանգության աուդիտ (2026-11-12)

Ստուգվել է կոդի մակարդակով՝ backend (NestJS), ադմին/կայք (Nuxt), վարորդի հավելված (Expo)։
Penetration test իրական սերվերի դեմ **չի** արվել, `npm audit`-ը չի գործարկվել (ցանց չկար)։

## Ուղղված է այս աուդիտում

| # | Խստություն | Խնդիր | Ուղղում |
|---|---|---|---|
| 1 | **Կրիտիկական** | Կայքի վարորդի session-ի guard-ը (`DriverJwtGuard`) ստուգում էր միայն ստորագրությունը։ Նույն `DRIVER_JWT_SECRET`-ով են ստորագրվում հավելվածի token-ը (`sub` = FleetDriver id) և դրամապանակի վճարման հղումը (URL-ում)։ Դրանցից որևէ մեկով կարելի էր մտնել կայքի `/my/*` բաժին որպես **այլ** ամբարձիչ (TowTruck id = FleetDriver id)։ | Կայքի token-ը հիմա ունի `aud: driver:site`, guard-ը մերժում է այլ audience ունեցող token-ները (`driver-auth/driver-site-token.ts`)։ Հին token-ները (առանց aud) աշխատում են մինչև ժամկետի ավարտը՝ ոչ ոք դուրս չի մնում։ `algorithms: ['HS256']` ամրացված է։ |
| 2 | Բարձր | Գաղտնաբառի կոտրման պաշտպանությունը միայն IP-ով էր (10/րոպե)․ բազմաթիվ IP-ներից կարելի էր անվերջ փորձել մեկ հաշվի վրա։ | Սխալ գաղտնաբառերը հաշվվում են **ըստ հաշվի**՝ 8 սխալ 15 րոպեում → հաշիվը 15 րոպե փակ է (`common/login-attempts.ts`)՝ հավելված, կայքի վարորդ, ադմին։ |

| 3 | Բարձր | Ջնջված կամ դերը փոխված ադմինի token-ը աշխատում էր մինչև 24 ժամ։ | Ամեն ադմին/ops հարցում ստուգում է, որ հաշիվը կա նույն դերով (`admin-auth/admin-session-check.ts`, ≤15 վ քեշ), նաև WebSocket-ում։ |
| 4 | Միջին | Կայքի վարորդի token-ը 30 օր էր և գաղտնաբառը փոխելիս չէր չեղարկվում։ | `TowTruck.sessionVersion`․ գաղտնաբառի փոփոխություն/reset → բոլոր հին token-ները անվավեր, փոխողը ստանում է նորը։ |
| 5 | Բարձր | Telegram չկապած ադմինը մտնում էր միայն գաղտնաբառով։ | `ADMIN_REQUIRE_2FA="true"`-ով պարտադիր 2FA․ `npm run admin:accounts`՝ ցուցակ / միայն մեկ ադմին թողնել։ |

Թեստեր՝ `test-live/security.test.ts`։ Սերվերի կարգավորում՝ `scripts/harden-server.sh` (check → redis → postgres → firewall → ssh)։

## Ստուգված և լավ վիճակում

- Գաղտնիքներ git-ում չկան (`.env`, Firebase key, google-services՝ ignored, պատմության մեջ էլ չկան)։ Գաղտնիքները պարտադիր են և ≥16 նիշ (env validation)։
- SQL injection՝ բոլոր raw հարցումները պարամետրացված են (`Params`, Prisma tagged templates)։
- Իրավունքներ՝ ops endpoint-ները պահանջում են ADMIN/DISPATCHER, գումար/կարգավորումներ/վարորդի հաշիվ՝ միայն ADMIN։ Վարորդը չի կարող տեսնել/փոխել ուրիշի պատվերը կամ առաջարկը (կան թեստեր)։
- Գաղտնաբառեր՝ bcrypt, timing-safe (dummy hash), մեկ ընդհանուր սխալի հաղորդագրություն։
- Ադմինի 2FA՝ Telegram կոդ, փորձերի սահմանափակում, միանգամյա օգտագործում։
- Idram՝ checksum (timing-safe), գումարի ստուգում, կրկնակի callback-ի պաշտպանություն։
- Նկարների upload՝ ֆորմատը որոշվում է ֆայլի բովանդակությամբ (sharp), վերակոդավորվում WebP, չափի սահման, throttle։
- HTTP՝ helmet, CORS whitelist, ValidationPipe (whitelist), stack trace-ը պատասխանում չի երևում։ Կայքում՝ CSP nonce + strict-dynamic, `v-html` չկա։
- WebSocket՝ token-ը առաջին frame-ում (ոչ URL-ում), 5 վ ժամկետ, maxPayload 4 KB։
- Հավելված՝ token-ը SecureStore-ում, backup-ից դուրս, cleartext HTTP միայն debug build-ում։

## Խորհուրդներ (դեռ արված չեն)

| Խստություն | Ինչ անել |
|---|---|
| Միջին | Կայքում ադմին/վարորդ token-ները `localStorage`-ում են․ XSS-ի դեպքում կգողացվեն (CSP-ն լավ պաշտպանում է)։ Երկարաժամկետ՝ httpOnly cookie։ |
| Միջին | Սերվերում գործարկել `scripts/harden-server.sh`-ը (Redis/Postgres՝ միայն localhost, Redis՝ գաղտնաբառով, firewall՝ 22/80/443, SSH՝ միայն key)։ |
| Միջին | Mac-ում գործարկել `npm audit` backend/frontend/mobile-ում և թարմացնել կրիտիկական փաթեթները։ |
| Ցածր | Եթե production-ը Cloudflare-ի հետևում է, IP-ն վերցնել `CF-Connecting-IP`-ից (այլապես rate limit-ը բոլորի համար կլինի մեկ IP)։ |
| Ցածր | Վճարման հղումը կառուցվում է `X-Forwarded-Host`-ից․ ավելի ճիշտ է՝ կոնֆիգից (`PUBLIC_API_URL`)։ |
| Ցածր | Telegram webhook-ը log-ում գրում է սխալ/ժամկետանց `/start` token-ները՝ հանել։ |
