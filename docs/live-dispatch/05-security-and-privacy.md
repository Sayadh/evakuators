# Live dispatch — 05. Անվտանգություն, մասնավորություն, դիտարկում

> Սա տեխնիկական նկարագրություն է, **ոչ իրավական եզրակացություն**։ Տվյալների
> պաշտպանության օրենսդրությանը համապատասխանությունը (ներառյալ consent-ի տեքստը,
> retention-ը, Google Maps Platform-ի պայմանները) պետք է ստուգի իրավաբանը։

## Դերեր և հասանելիություն

| Դեր | Token | Ինչ կարող է |
| --- | --- | --- |
| Driver | App token (`aud: driver:app`, `sub` = `FleetDriver.id`, `sid` → revoke-ելի session)։ Միայն ադմինի տված/հաստատած հասանելիությամբ — [11](11-driver-access.md) | Միայն իր presence/location-ը, իր PENDING offer-ը, իր assigned order-ը, իր պատմությունը։ Ուրիշի offer/order → 404 (չի հաստատվում գոյությունը) |
| Dispatcher | Admin session, role DISPATCHER | `/ops/dispatch/*` (բացի settings PATCH-ից)։ Գործող `/admin/*`-ը՝ 403 |
| Administrator | Admin session, role ADMIN | Ամեն ինչ + settings |
| Public visitor | — | `POST /nearest-tow-trucks/live`՝ առանց կոորդինատների, առանց հաճախորդի տվյալների, առանց պատմության |

Բոլոր HTTP endpoint-ները ունեն server-side guard։ WebSocket-ը՝ auth առաջին frame-ով,
audience-ով routing (`driver:<id>` / `admin`), driver session-ը վերստուգվում է ամեն րոպե։
Driver ID-ն միշտ token-ից է, երբեք request body-ից։

## Rate limits

| Endpoint | Սահման |
| --- | --- |
| `POST /driver-app/sessions` | 10/ր/IP (գործող driver login-ի պես) |
| `POST /driver-app/registrations` | 5/ժամ/IP |
| `/me/heartbeat` | 12/ր |
| `/me/locations` | 30/ր |
| `/offers/:id/accept`, `/reject` | 20/ր |
| `POST /nearest-tow-trucks/live` | 10/ր/IP + 60 վ cache + առանձին routing budget + `rejectWhenBusy` |
| Մնացածը | Գլոբալ 60/ր/IP |

Throttler-ը in-memory է (գործող սահմանափակում, `docs/auth-and-security.md`)։

## Գաղտնիքներ

- Server routing key (`GOOGLE_ROUTES_API_KEY`) միայն backend `.env`-ում, IP-restricted, միայն Routes API։ **Ոչ** browser-ում, **ոչ** app bundle-ում։
- Mobile app-ը routing/maps key չի պարունակում (նավիգացիան արտաքին հավելված է)։
- Ադմինի քարտեզը առանց map SDK է (սխեմատիկ) — client key դեռ պետք չէ։ Երբ ավելացվի, domain-restricted և CSP-ում միայն կոնկրետ host։
- FCM service account JSON՝ միայն `.env`-ում։
- `.env.example`-ում իրական գաղտնիք չկա (գործող `env-example-secrets.spec.ts`-ը ստուգում է)։

## Logs-ում ինչ ՉԻ գրվում

Token-ներ, ամբողջական հեռախոսահամարներ, կոորդինատներ, provider-ի response body
(որը կոորդինատներ է կրկնում)։ Worker-ի log-երը JSON են՝ միայն id-ներ, քանակներ,
latency։ Հանրային որոնման կոորդինատները չեն պահվում (cache key = ~110 մ բջիջ, հիշողության մեջ)։

## Տվյալների նվազեցում և retention

| Տվյալ | Պահպանում |
| --- | --- |
| `DriverLocationCurrent` | 1 տող վարորդի համար (վերջին fix) |
| `DriverLocationHistory` | `locationHistoryRetentionDays` (լռ. 30), ժամային cleanup |
| `IdempotencyKey` | 24 ժ |
| `OutboxEvent` (processed) | 7 օր |
| Հանրային որոնման դիրք | Ոչ մի տեղ (միայն 60 վ in-memory cache key՝ կլորացված) |
| Push lock-screen | «Նոր պատվեր · մոտ X կմ» — առանց հասցեի/անվան/հեռախոսի |

Tracking consent՝ app-ում պարզ բացատրություն + switch, պահվում է
`DriverPresence.trackingConsentVersion/At`; առանց consent-ի online լինել հնարավոր չէ
(`TRACKING_CONSENT_REQUIRED`)։ Offline + առանց ակտիվ պատվերի → tracking `OFF`։

## Դիտարկում և alerts

Հավաքվում է՝

| Ազդանշան | Աղբյուր |
| --- | --- |
| Outbox backlog, ամենահին due, dead letters | `GET /ops/dispatch/health` |
| Outbox processed/failed/retried, lag p95, routing requests/**elements**/errors/budget refusals, RSS | worker-ի `metrics` JSON log՝ րոպեն մեկ |
| Reconciler-ի գործողություններ (expired, requeued, alerts) | worker log |
| Թարմ GPS ունեցող վարորդներ, stale presence | `GET /ops/dispatch/drivers/map` (availability.gps) |
| Offer acceptance/rejection/timeout, assignment-ի ժամանակ | `OrderOffer` + `OrderEvent` (SQL) |
| Routing usage | `RoutingUsageDay` |

Առաջարկվող alerts (Uptime Kuma / cron + Telegram admin bot, որը արդեն կա)՝

| Alert | Շեմ | Ինչու |
| --- | --- | --- |
| Outbox oldest due | > 30 վ, 2 անգամ անընդմեջ | Worker-ը կանգնած է → offer-ները չեն ուղարկվում |
| Dead letters | > 0 | Մշտական ձախողում (FCM credentials, schema) |
| PENDING offers past deadline > 15 վ | > 0 | Reconciler-ը չի աշխատում |
| Routing errors / requests | > 20% 10 ր-ում | Provider-ի խնդիր → ETA-ներ չկան |
| Routing elements | > 80% օրական բյուջե | Վճարի ռիսկ |
| Fresh-GPS drivers | 0 աշխատանքային ժամերին | App/push/tracking խափանում |
| NEEDS_ATTENTION բաց > 5 ր | > 0 | Օպերատորը չի տեսել |
| API 5xx rate | > 2% 5 ր | Ընդհանուր |
| DB connections | > 80% max | Pool exhaustion |

**Չի իրականացվել**՝ Prometheus/OpenTelemetry exporter, API latency histogram
(Nest-ի մակարդակում), event-loop lag metric։ Սրանք ավելացնելու տեղը
`worker.ts`-ի metrics loop-ն է և Nest interceptor-ը։

## Վարորդի գաղտնիության կառավարում (store-ի պահանջներ)

- Համաձայնության հետ կանչում՝ `DELETE /driver-app/consent/tracking` — offline, tracking-ը կանգնում է; ակտիվ պատվերի կամ սպասող առաջարկի ժամանակ `409 ACTIVE_ORDER_IN_PROGRESS`։
- Հաշվի ջնջում՝ `POST /driver-app/me/delete` (գաղտնաբառով) կամ ադմինից `POST /ops/dispatch/fleet/:id/delete-account` (վարորդի դիմումով)։ Ջնջվում են location history/current, presence, sessions, push tokens; APP_ONLY-ի դեպքում նաև phone/name/password/vehicle/base (status `DELETED`, համարը կրկին ազատ է)։ `FleetDriver` տողը **չի** ջնջվում, քանի որ FK-երը `ON DELETE CASCADE` են և կջնջեին պատվերների նշանակումները — փոխարենը անանունացվում է։ SITE_LINKED՝ ավարտվում է միայն app access-ը, կայքի պրոֆիլը անձեռնմխելի է։
- Հրապարակային էջեր՝ `/driver-app/privacy`, `/driver-app/delete-account`։ Store checklist՝ `12-store-submission.md`։
