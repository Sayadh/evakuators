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
| `offerTimeoutSeconds` | 30 |
| `searchAlertSeconds` | 90 → `SEARCH_SLOW` alert |
| `searchMaxSeconds` | 600 → `NEEDS_ATTENTION (SEARCH_TIMEOUT)` |
| `maxOffersPerAttempt` | 25 → `NEEDS_ATTENTION (SEARCH_EXHAUSTED)` |
| `candidateRouteMaxAgeSeconds` | 120 → queued թեկնածուները re-route են արվում իրենց **ընթացիկ** fix-ից |
| `etaTieSeconds` | 60 |

Batch-ը սպառվելիս վերցվում է հաջորդ batch-ը նույն շառավղում, հետո՝ ավելի մեծ
շառավիղ։ Նույն փորձում նույն վարորդին կրկին չի առաջարկվում (`DispatchCandidate`
unique)։ Երբ շառավիղները սպառված են → `NEEDS_ATTENTION`, ոչ անվերջ շրջան։

## Տեխնիկական համապատասխանություն

`orders/domain/requirements.ts` (TS) և նույն ֆայլում SQL twin-ը։ Համապատասխանությունը
ստուգվում է `test-live/eligibility-parity.integration.test.ts`-ով։

**Բիզնես հաստատում պահանջող ենթադրություններ** (մեկ ֆայլում են, փոխելը մեկ տեղ է)՝

1. Չպտտվող անիվներ / արգելափակված ղեկ / արգելափակված տուփ → `wheelSkates` կամ crane։
2. Բեռնատարողություն → `maxLoadTons ?? capacityTons` (band-ի ներկայացուցչական արժեքը)։
3. `heavy-duty` տեսակը սովորական պատվերի համար չի առաջարկվում (միայն > 3500 կգ)։
4. `manipulator` տեսակը՝ միայն երբ crane է պետք։

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
