# Live dispatch — 01. Audit և ճարտարապետական որոշումներ

Կարգավիճակ՝ Փուլ 1 (2026-11-08)։ Ճյուղ՝ `feature/dispatch-v1`, հիմքը՝ `main@7340e3a`։

Այս փաստաթուղթը գրված է **իրական կոդի** հիման վրա, ոչ թե առաջադրանքի
նկարագրության։ Որտեղ դրանք տարբերվում են, գերակայում է կոդը, և տարբերությունը
նշված է։

## 1. Ինչ գտնվեց

### 1.1 Repository-ներ

| Repository | Վիճակ |
| --- | --- |
| `Sayadh/evakuators-app` (ձեր ընտրած պանակը) | Դատարկ է, ոչ մի commit։ Remote-ը նույնպես դատարկ է։ |
| `Sayadh/evakuators` | Գործող monorepo՝ 286 commit, `main` + 7 feature ճյուղ։ **Սա է գործող համակարգը։** |

Այլ repository (առանձին admin, առանձին mobile) չգտնվեց։ Գործող վարորդի բջջային
հավելված **չկա**։

### 1.2 Stack-ը՝ ըստ կոդի (ոչ ըստ առաջադրանքի)

| Առաջադրանքում | Իրականում | Հետևանք |
| --- | --- | --- |
| Nuxt 3 + Tailwind | Nuxt `3.21.11` + Vue 3 + Pinia + **SCSS** (Tailwind չկա) | Ադմինի նոր էջերը գրվում են SCSS-ով՝ գործող ոճով |
| NestJS | NestJS `10.4` + Prisma `5.22` + class-validator | Պահպանվում է, major update չկա |
| PostgreSQL | PostgreSQL 16 + **PostGIS արդեն միացված** (`TowTruck.location` generated geography + partial GiST) | Նոր geography սյունակները կրկնում են նույն pattern-ը |
| Supabase Storage | Այո, միայն storage | Չի փոխվում |
| VPS + Nginx + PM2 | Այո, `ecosystem.config.js`, պորտեր **3002/4002** (staging՝ 3003/4003) — ֆիքսված | Worker-ը պորտ չի բռնում, պորտերը չեն փոխվում |
| Redis, BullMQ, WebSocket server, FCM | **Չկան** | Ավելացվում են (տե՛ս §3) |
| Google Routes | **Չկա**. Գործող routing-ը **OpenRouteService**-ն է (`RouteMatrixService`, 500 req/օր, in-memory քվոտա) | Ստեղծվում է `RoutingProvider` interface՝ Google Routes + ORS + Fake adapter-ներով |
| Tailwind UI kit | Չկա, սեփական Vue բաղադրիչներ | Օգտագործվում են գործող բաղադրիչները |
| i18n | `@nuxtjs/i18n`՝ `hy`, `ru`, `en` | Ադմինի նոր տեքստերը՝ locale ֆայլերում |

### 1.3 Վարորդի հաշիվ, auth, դերեր

- **Վարորդը = `TowTruck` տող։** Առանձին `Driver`/`User` մոդել չկա։ Մուտքը՝
  `POST /driver-auth/login` (հեռախոս + գաղտնաբառ, bcrypt), JWT `{ sub: driverId }`,
  30 օր, `DRIVER_JWT_SECRET`։ Refresh token, session revoke **չկա** (փաստագրված
  `docs/auth-and-security.md`-ում)։
  → **Որոշում (թարմացված).** Կայքի վարորդի համար երկրորդ հաշիվ/գաղտնաբառ չենք
  ստեղծում․ հավելվածը մուտք է գործում **կայքի նույն credential-ով**։ Բայց
  հավելվածից օգտվելու **իրավունքը** առանձին է՝ `FleetDriver` (ADR-10)․ ոչ բոլոր
  կայքի վարորդներն են այն ստանում, և կան վարորդներ, որոնք կայքում չեն։ Բոլոր
  live-dispatch աղյուսակները հղվում են `FleetDriver.id`-ին։ Հավելվածը ստանում է
  առանձին token՝ `aud: 'driver:app'`, `sub` = `FleetDriver.id`, `sid` (device
  session id, revoke-ելի)։ Գործող վեբ token-ները անփոփոխ են։
- **Ադմին.** `User` մոդել, `enum UserRole { ADMIN }` — միակ դերը։ `AdminJwtGuard`-ը
  մերժում է ամեն ինչ, որը `ADMIN` չէ։ Telegram 2FA կա (կամընտիր)։
  → **Որոշում.** Ավելացվում է `DISPATCHER` արժեքը (additive `ALTER TYPE ... ADD VALUE`)։
  Գործող `AdminJwtGuard`-ը **չի փոխվում**, ուստի dispatcher-ը գործող ադմինի
  ոչ մի էջ չի տեսնում (անվտանգ լռելյայն)։ Նոր `OpsJwtGuard`-ը թույլ է տալիս
  `ADMIN | DISPATCHER`, իսկ dispatch settings-ը՝ միայն `ADMIN`։ 2FA հոսքը նույնն է։
- **Հաստատում/ակտիվություն.** `TowTruck` տողը ստեղծվում է registration-ի
  հաստատումից հետո։ `isActive` + `deactivationReason` (`UNPAID` և այլն)։
  → Dispatch-ի համար «հաստատված» = `isActive = true`։ Առանձին ադմինիստրատիվ
  `dispatchSuspendedAt` դաշտ՝ dispatch-ից կասեցնելու համար՝ առանց կայքից հանելու։

### 1.4 Մեքենայի տեխնիկական տվյալներ (`TowTruck`)

Առկա են՝ `vehicleType`, `capacityTons` (band-ից ստացված ներկայացուցչական թիվ),
`maxLoadTons` (միայն specialist), `winch`, `manipulator` (derived՝ `hasManipulator()`),
`wheelSkates`, `doubleDeck`, `towHitch`, `heavyEquipment`, `platformLengthM/WidthM`։

Բացակայում են՝ ղեկի/փոխանցման տուփի արգելափակման հետ աշխատելու հստակ
հնարավորություն։ → **Որոշում.** `TowTruck`-ում նոր դաշտ չենք ավելացնում
առաջին տարբերակում․ արգելափակված անիվներ/ղեկ/տուփ ունեցող պատվերը պահանջում է
`wheelSkates` կամ manipulator (`hasManipulator`)։ Կանոնը մեկ ֆունկցիայում է
(`requirements.ts`) և նշված է որպես **բիզնես հաստատում պահանջող ենթադրություն**։

### 1.5 Գործող որոնում և «dispatch»

- `/evakuator` էջ + `POST /nearest-tow-trucks`. PostGIS (25 թեկնածու, 150 կմ) →
  ORS matrix → 10 արդյունք։ **Հեռավորությունը չափվում է վարորդի պրոֆիլում նշված
  կայանատեղից** (`TowTruck.latitude/longitude`), ոչ իրական GPS-ից։ Էջում դա
  բացահայտ գրված է։ Այցելուի կոորդինատները չեն պահվում (POST, rounding, no log)։
  Specialist տեսակները բացառվում են SQL-ի ներսում։
- `/admin/dispatch` + `backend/src/dispatch/`. **Սա ձեռքով հեռախոսային
  ուղղորդման գործիք է**՝ օպերատորը գտնում է թեկնածու, զանգում է, և
  «Ուղղորդված է» սեղմելով գրանցում `DispatchReferral`։ Պատվեր, առաջարկ,
  state machine **չկա**։
  → **Որոշում.** Գործող `dispatch` մոդուլը և էջը մնում են անփոփոխ (սա «ուղղակի
  զանգերի մոդելն» է, որը պետք է պահպանել)։ Նոր համակարգը առանձին մոդուլներ է
  (§3), նոր էջեր՝ `/admin/orders`։

### 1.6 Ենթակառուցվածք

- Background jobs՝ միայն `@nestjs/schedule` cron-եր API պրոցեսի ներսում։
- Throttler-ի counter-ները in-memory են (փաստագրված սահմանափակում)։
- Health՝ `GET /health` (DB ping)։ Readiness առանձին չկա։
- Migrations-ը **ձեռքով են գրվում**, `prisma migrate dev`-ը արգելված է
  (`docs/data-model.md`)։ Կիրառվում են `prisma migrate deploy`-ով։
- Թեստեր՝ Vitest, առանց իրական DB-ի (բացառություն՝ PGlite migration test)։

## 2. Միջավայրի սահմանափակումներ այս աշխատանքի ընթացքում

Սա կարևոր է, որովհետև որոշում է, թե ինչ կարելի է հայտարարել «ստուգված»։

| Ռեսուրս | Հասանելի՞ է |
| --- | --- |
| npm registry (package install) | **Ոչ** — ցանցը փակ է և ամպային միջավայրում, և ձեր համակարգչի VM-ում |
| Repo-ի `node_modules` (NestJS, Prisma, Nuxt, vitest) | **Ոչ** |
| PostgreSQL 16 server | **Այո** (առանց PostGIS) |
| PostGIS | **Ոչ** |
| Redis 7 server | **Այո** |
| Node 22, `tsx`, TypeScript, `@types/node` | **Այո** |
| Android/iOS SDK, սարքեր, store/signing credentials | **Ոչ** |
| Google Routes / FCM / APNs credentials | **Ոչ** |

Հետևանքներ.

1. **Բիզնես տրամաբանությունը գրվում է framework-ից անկախ** TypeScript
   մոդուլներով (`backend/src/live-dispatch/**/domain`, `repo`, `engine`)։ Դրանք
   ստուգվում են իրական Node-ով և **իրական PostgreSQL-ով** (մրցակցային թեստեր
   բազմաթիվ միաժամանակյա կապերով)։
2. DB հասանելիությունը կառուցված է `SqlExecutor` interface-ի վրա։ Production-ում
   այն Prisma-ի `$transaction` + `$queryRawUnsafe` adapter է, թեստերում՝ փոքր,
   dependency-free PostgreSQL wire-protocol client (`test-support/pg-wire.ts`)։
   Այսպես **նույն SQL-ը** աշխատում է երկուսում։ Prisma adapter-ը ինքը այստեղ
   չի ստուգվում (Prisma-ն տեղադրված չէ) — նշված է որպես չստուգված։
3. NestJS controller/module-ները, Nuxt էջերը, React Native հավելվածը գրվում են,
   բայց **այստեղ չեն compile/build արվում**։ Դրանք նշվում են «գրված, չստուգված»,
   և ստուգման հրամանները տրված են runbook-ում։
4. PostGIS-ից կախված SQL-ը (թեկնածուների geo-հարցում) առանձնացված է և այստեղ
   **չի գործարկվում**։ Eligibility-ի ամբողջ SQL-ը՝ գործարկվում է։

## 3. Ճարտարապետական որոշումներ (ADR)

### ADR-1. Modular monolith, երեք պրոցես

- `evakuators-frontend` (գործող, 3002)
- `evakuators-backend` API (գործող, 4002) + WebSocket՝ նույն HTTP server-ի վրա, path `/api/v1/realtime`
- `evakuators-worker` (նոր) — `dist/worker.js`, պորտ չի բռնում։ Կատարում է
  outbox-ը, push-երը, dispatch-ի առաջխաղացումը, deadline-ները, reconciliation-ը։

Բիզնես տրամաբանությունը նույն մոդուլներում է, worker-ը և API-ն պարզապես
տարբեր entry point-ներ են → առանձին սերվեր տեղափոխելը չի պահանջում վերագրում։

Նոր մոդուլներ (`backend/src/live-dispatch/`)՝
`platform` (SQL executor, idempotency, errors, settings), `fleet` (device
sessions, presence, location, eligibility), `orders` (state machine, CRUD,
events), `dispatching` (candidates, routing, offers, engine, reconciler),
`notify` (outbox, FCM, realtime)։

### ADR-2. PostgreSQL-ը վերջնական աղբյուրն է, Redis-ը՝ ոչ

- Offer-ի deadline-ը, reservation-ը, assignment-ը, outbox-ը **միայն DB-ում են**։
- Կրկնակի նշանակումն արգելված է **DB constraint-ներով** (partial unique index-ներ),
  ոչ թե application lock-ով։
- Worker-ի աշխատանքները DB-ից են վերցվում `FOR UPDATE SKIP LOCKED`-ով։ Timeout-ը
  չի կախված `setTimeout`-ից կամ Redis-ից. reconciler-ը ամեն մի քանի վայրկյանը
  մեկ փակում է ժամկետանց PENDING offer-ները։

**Շեղում առաջարկված stack-ից.** BullMQ **չի** ավելացվում առաջին տարբերակում։
Պատճառը՝ բոլոր հետաձգված աշխատանքները ամեն դեպքում պետք է վերականգնվեն DB-ից
(առաջադրանքի §15 պահանջը), ուստի BullMQ-ն կլիներ երկրորդ queue, որը պետք է
համաձայնեցնել առաջինի հետ։ 400 վարորդի ծավալով DB-polling-ը (1 վ, index-ով)
աննշան բեռ է։ Redis-ը օգտագործվում է **pub/sub**-ի համար (worker → API
WebSocket), և դրա կորուստը միայն ուշացնում է realtime թարմացումը. client-ները
reconnect-ից հետո միշտ կարդում են snapshot։ Եթե հետագայում պետք լինի BullMQ,
այն կմտնի `OutboxProcessor`-ի հետևում առանց բիզնես կոդի փոփոխության։

Redis client-ը փոքր, dependency-free RESP client է (`notify/redis-resp.ts`),
որը թեստավորվում է իրական `redis-server`-ով։

**Ինչ է լինում առանց Redis-ի (`REDIS_URL` դատարկ).** Realtime hint-երը
հրապարակում է worker-ը (outbox handler), իսկ WebSocket-ները API process-ում են։
Առանց Redis-ի դրանք իրար չեն հանդիպում (`InProcessBus`), worker-ը log-ում
զգուշացնում է։ Բաշխումը, timeout-ները, push-ը աշխատում են նույն կերպ։ Ակնթարթայինը
դառնում է պարբերական․ ադմինի էջերը վերակարդում են 15 վ-ը մեկ, իսկ հավելվածը՝
10 վ-ը մեկ (երբ բաց է և online / ունի առաջարկ կամ պատվեր) + push-ի և reconnect-ի
ժամանակ։ Այդ safety-net-ը կա նաև Redis-ով, որովհետև «բաց, բայց լուռ» socket-ը և
ուշացած FCM-ը նույն ռիսկն են։ Production-ում Redis-ը խորհուրդ է տրվում
(`apt install redis-server`, `bind 127.0.0.1`), տեղական աշխատանքում՝ ըստ ցանկության։

### ADR-3. Reservation = PENDING offer + partial unique index

Առանձին `DriverReservation` աղյուսակ չի ստեղծվում։ Reservation-ը PENDING
offer-ն է, և եզակիությունը պարտադրվում է՝

- `UNIQUE ("driverId") WHERE status = 'PENDING'` — վարորդը մեկից ավելի ակտիվ առաջարկ չունի,
- `UNIQUE ("orderId") WHERE status = 'PENDING'` — sequential dispatch,
- `UNIQUE ("attemptId", "driverId")` — նույն փորձում նույն վարորդին կրկին չենք առաջարկում։

Assignment-ները՝ `OrderAssignment` աղյուսակ՝
`UNIQUE ("orderId") WHERE "endedAt" IS NULL` և `UNIQUE ("driverId") WHERE "endedAt" IS NULL`։

Երկու առանձին աղյուսակ (reservation + offer) կնշանակեր երկու բան, որոնք
պետք է համաձայնեցված մնան — դա ճիշտ այն տեսակի drift-ն է, որից գործող
codebase-ը խուսափում է (տե՛ս `TowTruck.location`-ի generated column-ը)։

### ADR-4. Routing provider

`RoutingProvider` interface (`matrix(origins, destinations)` → ամեն զույգի
`{ ok, meters, seconds } | { ok:false, error }`, `computedAt`, `billableElements`)։
Adapter-ներ՝ `GoogleRoutesProvider` (`computeRouteMatrix`), `OrsProvider`
(գործող ORS endpoint-ը), `FakeRoutingProvider` (թեստեր/load test՝ լռելյայն)։
Ընտրությունը՝ `DISPATCH_ROUTING_PROVIDER` env-ով։ Timeout, սահմանափակ retry
backoff-ով, concurrency limit, օրական billable elements բյուջե **DB-ում**
(ոչ միայն հիշողության մեջ)։

Գործող `/evakuator` որոնումը ORS-ով է և **առաջին տարբերակում մնում է ORS-ով**,
որպեսզի չփոխվի գործող վարքը և բյուջեն։

Caching. provider-ի արդյունքը պահվում է միայն dispatch attempt-ի թեկնածուի
տողում (`DispatchCandidate`) `routedAt`-ով և օգտագործվում է ոչ ավելի, քան
`candidateRouteMaxAgeSeconds` (լռելյայն 120 վ)։ Միջ-request cache Google-ի
արդյունքների համար **չկա**։ Google Maps Platform-ի ընթացիկ պայմանները պետք է
վերանայվեն իրավաբանորեն/ապրանքային պատասխանատուի կողմից մինչև production key-ը միացնելը։

### ADR-5. Push և realtime

- FCM HTTP v1 API՝ service account JWT-ով (`node:crypto` RS256)։ `firebase-admin`
  չի ավելացվում։ iOS-ը՝ FCM-ի միջոցով APNs։
- Push TTL = offer deadline − now։ Lock-screen-ում՝ միայն «Նոր պատվեր․ X կմ»,
  առանց հեռախոսի/հասցեի։
- Delivery վիճակներ՝ `QUEUED → PROVIDER_ACCEPTED → APP_ACKNOWLEDGED`, առանձին
  `OrderOffer.status`-ից։
- WebSocket՝ `ws` (արդեն dependency է) API-ի HTTP server-ի վրա։ Auth՝ token
  առաջին հաղորդագրությամբ, ոչ query string-ով (nginx log)։ Reconnect-ից հետո
  client-ը ստանում է `snapshot`։

### ADR-6. Mobile՝ Expo development build (CNG), ոչ Expo Go

Background location-ը Android-ում պահանջում է foreground service, իսկ iOS-ում՝
`UIBackgroundModes: location` և «Always» թույլտվություն։ Push-ը պահանջում է
FCM/APNs native կոնֆիգուրացիա։ Expo Go-ն չի աջակցում custom native
կոնֆիգուրացիաներ և production background location-ի համար ներկայացուցչական չէ։
Expo development build-ը (config plugins + `expo prebuild`) տալիս է նույն native
վերահսկողությունը, ինչ bare workflow-ը, բայց թույլ է տալիս native նախագիծը
վերագեներացնել config-ից։ Ընտրված է **Expo dev build**՝ `expo-location`
(`startLocationUpdatesAsync` + `foregroundService`), `expo-task-manager`,
`expo-secure-store`, `@react-native-firebase/messaging`։ Մանրամասները՝
`docs/live-dispatch/06-mobile.md`։

### ADR-7. Գումարներ և ժամեր

- Գումար՝ `Int` AMD (դրամ, առանց ենթամիավորի), `currency` = `'AMD'` CHECK-ով։
  Գործող `priceCityCallout` և այլն նույնպես `Int` են։ Floating point չկա։
- Ժամեր՝ `timestamptz` (UTC), UI-ում՝ `Asia/Yerevan` գործող `formatters.ts`-ով։
- Բոլոր deadline-ները հաշվվում են **DB-ի ժամացույցով** (`now()`/`clock_timestamp()`),
  որպեսզի API-ի և worker-ի ժամացույցների շեղումը չազդի accept/expire-ի վրա։

### ADR-8. Հանրային որոնում

Գործող `/evakuator`-ը չի փոխարինվում, այլ ընդլայնվում է։ Նոր endpoint
`POST /nearest-tow-trucks/live` (feature flag `LIVE_NEARBY_ENABLED`)
վերադարձնում է **մեկ ցուցակ** (թարմացված որոշում, սեփականատիրոջ ընտրությամբ)․
կայքի վարորդը, որն առցանց է հավելվածում թարմ GPS-ով, չափվում է իր ներկա դիրքից
(`live` նշանով), մնացածը՝ պրոֆիլի կայանատեղից (գործող որոնումը), նույն վարորդը՝
մեկ անգամ։ Միայն-հավելվածի վարորդները չեն երևում ([11](11-driver-access.md))։ Հանրային պատասխանում **ճշգրիտ
կոորդինատներ չկան**՝ միայն ճանապարհային հեռավորություն/ETA (կամ ուղիղ գծով՝
առանց ժամանակի), availability label, `computedAt`։

### ADR-9. Feature flags

`LIVE_DISPATCH_ENABLED` (API endpoints + worker), `DRIVER_TRACKING_ENABLED`
(location ingest), `LIVE_NEARBY_ENABLED` (հանրային live բաժին), frontend-ում՝
`NUXT_PUBLIC_LIVE_NEARBY_ENABLED`։ Բոլորը լռելյայն `false`։


### ADR-10. Կայքի պրոֆիլը և հավելվածի հասանելիությունը՝ երկու առանձին էություն

**Խնդիր.** Ոչ բոլոր կայքի վարորդներն են պետք է օգտվեն հավելվածից (ադմինը
ընտրում է), և կան վարորդներ, որոնք միայն հավելվածում են (կայքում չեն)։ Երկու
տրամաբանությունը չպետք է խառնվի, իսկ կայքի վարորդի կրկնակի հաշիվ չպետք է լինի։

**Որոշում.** `FleetDriver` աղյուսակ՝ երկու տեսակով (`SITE_LINKED` → `TowTruck`,
`APP_ONLY` → սեփական credential և մեքենայի տվյալներ) և `FleetDriverProfile` view,
որը dispatch-ին տալիս է մեկ ձև։ Live-dispatch-ի բոլոր աղյուսակները հղվում են
`FleetDriver.id`-ին։ Կայքի կոդը չի փոխվում և `FleetDriver`-ի մասին չգիտի։

**Մերժված տարբերակներ.** (1) `TowTruck`-ում «միայն հավելված» flag․ ամեն հանրային
read path (5+ տեղ, sitemap) պետք է հիշեր այն բացառել — հենց այն խառնումը, որից
խուսափում ենք։ (2) Dispatch աղյուսակները թողնել `TowTruck.id`-ի վրա և
app-only-ների համար երկրորդ սյունակ․ ամեն partial unique index (կրկնակի նշանակման
պաշտպանությունը) կկիսվեր երկու սյունակի։

Մանրամասներ՝ [11-driver-access.md](11-driver-access.md)։

## 4. Ինչ ենք օգտագործում / ընդլայնում / ինչ է բացակայում

| Օգտագործում ենք անփոփոխ | Ընդլայնում ենք | Նոր |
| --- | --- | --- |
| `TowTruck` որպես կայքի վարորդի հաշիվ (հավելվածի հասանելիությունը՝ առանձին `FleetDriver`, [11](11-driver-access.md)) | `UserRole` + `DISPATCHER` | Device sessions, presence, current location, history |
| `DriverAuthService.login` credential check | `/evakuator` + live բաժին | Orders, offers, assignments, events, alerts, requests |
| `assertWithinArmenia`, `ARMENIA_BOUNDS` | `ecosystem.config.js` + worker | Outbox, idempotency keys, dispatch settings |
| `hasManipulator`, `SPECIALIST_VEHICLE_TYPES` | nginx՝ WebSocket upgrade | RoutingProvider, Google Routes adapter |
| PostGIS pattern (generated geography + GiST) | `.env.example` | FCM client, Redis pub/sub, WS gateway |
| Admin 2FA, admin JWT | Health՝ readiness | Driver mobile app, admin orders UI |
| Գործող `/admin/dispatch` ձեռքով գործիքը | | Integration թեստեր իրական Postgres-ով |

Բացակայող արտաքին տվյալներ/credentials (աշխատանքը շարունակվում է առանց դրանց)՝

- Google Maps Platform key (Routes API, server-side) և client key (ադմինի քարտեզ)։
- Firebase project, service account JSON, `google-services.json`, `GoogleService-Info.plist`։
- APNs key (.p8), Apple Developer Team ID, bundle id։
- Google Play / App Store հաշիվներ, signing keystore։
- Production/staging DB-ի հասանելիություն (չի պահանջվում և չի օգտագործվում)։
- Push հասանելիություն `Sayadh/evakuators`-ին (արդյունքը տրվում է local ճյուղով)։
