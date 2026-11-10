# Live dispatch — 04. Ավտոմատ բաշխում և routing

## Հոսքը

```
ADMIN: create (DRAFT) ──► start (SEARCHING, attempt + alertAt/deadlineAt in DB, outbox: dispatch.advance)
                                │
WORKER: engine.advance(order) ◄─┘   (also re-queued by the reconciler if lost)
   1. tx: lock order → open attempt → pending offer? → deadline/limit? → QUEUED candidates?
   2. none queued → expand: PostGIS (radius stage s, batch N, exclude this attempt) → ONE matrix call
                    → rank (ETA buckets, longest-waiting, id) → insert batch (re-validated under lock)
   3. tx: re-check eligibility of queued candidates NOW → INSERT offer … ON CONFLICT DO NOTHING
          (unique index = reservation) → outbox: offer.expire @ expiresAt, push.offer, realtime
DRIVER: accept → tx (lock order, lock offer, DB-clock deadline, terms version, no assignments)
                 → ACCEPTED + OrderAssignment + order ASSIGNED/PRICE_CONFIRMATION_PENDING + attempt ended
        reject → REJECTED → outbox: dispatch.advance (next candidate immediately)
WORKER: offer.expire → EXPIRED only if still PENDING and now() ≥ expiresAt → dispatch.advance
RECONCILER (3 s): overdue offers, stuck searches, slow-search alerts, GPS-lost / not-moving alerts
```

## Թեկնածուների ընտրություն — երկու փուլ

**Փուլ 1 (մեր բազա).** `ELIGIBLE_FROM` + `availabilityPredicate` + `capabilityPredicate`
(`dispatching/eligibility-sql.ts`) + `ST_DWithin` GiST index-ով + `<->` KNN +
`LIMIT batch`։ Գրանցված քաղաքը/կայանատեղը **չի** օգտագործվում՝ միայն թարմ GPS։

**Փուլ 2 (ճանապարհ).** Մեկ matrix հարցում ամբողջ batch-ի համար (driver → pickup)։
Դասավորում՝ `rankCandidates` (`dispatching/domain/ranking.ts`)։

| Կարգավորում (լռելյայն) | Արժեք |
| --- | --- |
| `candidateBatchSize` | 10 |
| `yerevanRadiiMeters` | 8 / 20 / 40 կմ (pickup-ը Երևանի կենտրոնից ≤ 15 կմ) |
| `regionRadiiMeters` | 25 / 60 / 120 կմ |
| `offerTimeoutSeconds` | 45 |
| `searchAlertSeconds` | 90 → `SEARCH_SLOW` alert |
| `searchMaxSeconds` | 600 → `NEEDS_ATTENTION (SEARCH_TIMEOUT)` |
| `maxOffersPerAttempt` | 25 → `NEEDS_ATTENTION (SEARCH_EXHAUSTED)` |
| `candidateRouteMaxAgeSeconds` | 120 → queued թեկնածուները re-route են արվում իրենց **ընթացիկ** fix-ից |
| `etaTieSeconds` | 60 |

Batch-ը սպառվելիս վերցվում է հաջորդ batch-ը նույն շառավղում, հետո՝ ավելի մեծ
շառավիղ։ Նույն փորձում նույն վարորդին կրկին չի առաջարկվում (`DispatchCandidate`
unique)։ Երբ շառավիղները սպառված են → `NEEDS_ATTENTION`, ոչ անվերջ շրջան։

## Կայանատեղիով պահուստային որոնում (2026-11)

Եթե շառավիղների ամբողջ սանդուղքով **թարմ GPS-ով** ոչ մի վարորդ չի գտնվել, engine-ը նույն սանդուղքով անցնում է երկրորդ անգամ՝ `source: 'BASE'`։ Թեկնածու են այն վարորդները, որոնք միացված են («Ընդունում եմ պատվերներ»), **հավելվածը կապված է** (heartbeat ≤ `heartbeatMaxAgeSeconds`), բայց GPS-ը հին է, անճշգրիտ, կասկածելի կամ բացակայում է, և ունեն կայանատեղի։ Հեռավորությունը հաշվվում է կայանատեղիից։

- Կայանատեղին՝ SITE_LINKED-ի համար `TowTruck.latitude/longitude` (կայքի գրանցումից), APP_ONLY-ի համար `FleetDriver.baseLatitude/baseLongitude` (հավելվածի գրանցման ժամանակ ըստ ցանկության)։ Միավորված է `FleetDriverProfile` view-ում։
- Թարմ GPS-ով վարորդը **միշտ** առաջարկվում է կայանատեղիով վարորդից առաջ. `searchStage`-ը 0…n-1 GPS է, n…2n-1՝ BASE։
- `DispatchCandidate.locationSource`-ը պահում է, թե ինչով է գտնվել թեկնածուն. առաջարկի պահին նույն կանոնով է կրկին ստուգվում (`eligibleAmong(…, source)`), route refresh-ը՝ կայանատեղիից։
- Հաճախորդին երևացող «Հիմա առցանց մոտակայքում» (`nearby-live`) ցուցակը **միայն GPS** է, երբեք կայանատեղի։
- Վարորդի հավելվածում `availability.baseFallback`-ը ցույց է տալիս «Պատվերներ՝ միայն ըստ կայանատեղիի»՝ «պատվերներ չեք ստանա»-ի փոխարեն։

## Տեխնիկական համապատասխանություն

`orders/domain/requirements.ts` (TS) և նույն ֆայլում SQL twin-ը։ Համապատասխանությունը
ստուգվում է `test-live/eligibility-parity.integration.test.ts`-ով։

**Բիզնես հաստատում պահանջող ենթադրություններ** (մեկ ֆայլում են, փոխելը մեկ տեղ է)՝

1. Չպտտվող անիվներ / արգելափակված ղեկ / արգելափակված տուփ → `wheelSkates` կամ crane։
2. Բեռնատարողություն → `maxLoadTons ?? capacityTons` (band-ի ներկայացուցչական արժեքը)։
3. `heavy-duty` տեսակը սովորական պատվերի համար չի առաջարկվում (միայն > 3500 կգ)։
4. `manipulator` տեսակը՝ միայն երբ crane է պետք։

- **Անիվային ռոլիկներ (2026-11).** Օպերատորը կարող է նշել «Պետք են անիվային ռոլիկներ» (`needsWheelSkates`) և ըստ ցանկության քանակը 1–4 (`wheelSkatesCount`)։ `true`-ի դեպքում թեկնածու են **միայն** `wheelSkates`-ով մեքենաները. կռունկը այստեղ չի փոխարինում (ի տարբերություն «անիվները չեն պտտվում» կանոնի)։ Քանակը միայն վարորդի համար է. պրոֆիլներում ռոլիկների թիվ չկա, ուստի ըստ քանակի ֆիլտր չկա։

## Routing provider

`RoutingProvider` interface → `GoogleRoutesProvider` (`computeRouteMatrix`),
`OrsProvider`, `FakeRoutingProvider`։ `GuardedRouting`-ը ավելացնում է՝
timeout, սահմանափակ retry (backoff + jitter, միայն 429/5xx/timeout), concurrency
semaphore, օրական **element** բյուջե DB-ում (`RoutingUsageDay`, ատոմար reservation
մինչև կանչը)։ Հանրային որոնումը ունի առանձին budget key և `rejectWhenBusy`։

Google Routes API-ի փաստերը (ստուգված 2026-11-08 պաշտոնական էջերից)՝
`POST https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix`,
`X-Goog-Api-Key`, `X-Goog-FieldMask` (`status`-ը պարտադիր է mask-ում, այլապես
սխալ element-ները OK են թվում), ≤ 625 element/request (100՝ `TRAFFIC_AWARE_OPTIMAL`),
3000 EPM, billing՝ ըստ element-ի (origins × destinations)։ proto3 JSON-ը բաց է թողնում
զրոյական index-ները — adapter-ը `originIndex ?? 0` է կարդում (թեստավորված)։

**ORS key-ը կիսված է կայքի հետ (2026-11).** ORS-ը հաշվում է **հարցումները**, ոչ element-ները, իսկ key-ը մեկն է կայքի `/evakuator` որոնման հետ։ Բաժանումը մեկ տեղում է՝ `backend/src/routing/routing.constants.ts`. կայք՝ 100/օր, բաշխում՝ 380/օր (`DISPATCH_ROUTING_DAILY_REQUESTS`-ով կարելի է փոխել), 20՝ պահուստ։ Ամեն փորձ (retry-ն էլ) նախօրոք ամրագրվում է `RoutingUsageDay.requests`-ում. սահմանից հետո՝ ուղիղ գիծ, պատվերը չի կանգնում։ Հանրային live որոնումը ORS-ով 0 հարցում ունի, մինչև `PUBLIC_NEARBY_DAILY_REQUESTS`-ը չտրվի։

**Ինչ չենք անում.**

- Routing request ամեն GPS թարմացումից հետո — **ոչ**։ Միայն batch-ի կառուցման կամ refresh-ի ժամանակ։
- Ուղիղ գիծը ճանապարհային չենք ներկայացնում։ Provider-ի սխալի դեպքում offer-ը գնում է `etaSeconds: null`, `straightLineMeters`-ով, որը UI-ն գրում է «ուղիղ գծով»։
- Սովորական մեքենայի route-ը **չի** երաշխավորում բեռնված էվակուատորի անցանելիությունը — UI-ում «մոտավոր»։
- Destination-ի բացակայության դեպքում pickup → destination արժեք չենք հորինում։ Provider-ի սխալի դեպքում օպերատորը կարող է ձեռքով մուտքագրել (`routeManual = true`, ցուցադրվում է որպես ձեռքով)։

**Caching.** Provider-ի արդյունքը պահվում է միայն տվյալ attempt-ի
`DispatchCandidate` տողում և վերօգտագործվում ≤ 120 վ (հետո՝ refresh)։ Հանրային
որոնումը պահում է պատասխանը հիշողության մեջ ≤ 60 վ, ~110 մ բջջով։ Ավելի երկար
պահպանում չկա։ **Google Maps Platform-ի պայմանները (caching, պահպանում, ցուցադրում)
պետք է վերանայի պատասխանատու անձը մինչև production key-ը միացնելը** — այս
փաստաթուղթը իրավական եզրակացություն չէ։

## Push և realtime

- Push = ծանուցում, ոչ վիճակ։ App-ը push-ից բացվելիս կարդում է `GET /driver-app/me`։
- Offer push-ի TTL = `expiresAt − now`; deadline-ից հետո push-ը **չի** ուղարկվում (`SKIPPED`)։
- Lock-screen՝ «Նոր պատվեր · մոտ X կմ», առանց հասցեի/հեռախոսի։
- `UNREGISTERED` / `INVALID_ARGUMENT` / `SENDER_ID_MISMATCH` → token-ը անվավեր է նշվում։
- Logout / session replacement → session-ի token-ները անվավեր։
- WebSocket event-ները կրում են `eventId` (outbox row id) — client-ը dedupe է անում push-ի և WS-ի միջև։
- Ադմինի քարտեզը թարմացվում է viewport-ով polling-ով (10–15 վ), ոչ թե 400 վարորդի ցուցակով ամեն GPS կետի համար. WS-ով գնում են միայն պատվերի/առաջարկի փոփոխությունները։
