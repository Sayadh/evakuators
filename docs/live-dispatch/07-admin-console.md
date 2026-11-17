# Live dispatch — 07. Ադմինի վահանակ (`/admin/orders`)

| Էջ | Ինչ կա |
| --- | --- |
| `/admin/orders` | Պատվերների ցուցակ (tabs՝ ակտիվ / ուշադրություն / փակված / բոլորը, որոնում, cursor pagination), alerts (ack), նոր պատվերի ձև, վարորդների քարտեզ + ցուցակ (availability, GPS age, accuracy) |
| `/admin/orders/:id` | Մանրամասներ, առաջարկի countdown, նշանակված վարորդ, գործողություններ, քարտեզ pickup-ով, առաջարկների պատմություն, թեկնածուներ (road vs straight-line՝ առանձին), audit timeline |
| `/admin/orders/drivers` | **Հավելվածի վարորդներ** (միայն ADMIN)․ նոր հայտեր (հաստատել/մերժել), կայքի վարորդին հասանելիություն տալ, կասեցնել/վերականգնել, կապել կայքի պրոֆիլին — [11](11-driver-access.md) |
| `/admin/orders/settings` | Dispatch settings (կարդալ՝ բոլորը, պահել՝ ADMIN), health (flags, outbox) |

Գործողություններ՝ սկսել/դադարեցնել որոնումը, ձեռքով առաջարկ (hard constraint-ները
անշրջանցելի, soft-երը՝ audit-ված պատճառով), չեղարկում (պատճառ, OTHER→մեկնաբանություն),
գնի հաստատում, վճարման կարգավիճակ, progress վարորդի անունից, նշանակման հանում (+ նոր
որոնում նույն transaction-ում), շարունակել նույն վարորդով, override անհայտ պահանջների,
pickup→destination երթուղի (հաշվարկ կամ ձեռքով՝ նշված որպես ձեռքով)։

Յուրաքանչյուր գործողություն ուղարկում է `expectedVersion` և Idempotency-Key (մեկ
սեղմում = մեկ key, retry-ը նույն key-ով)։ `VERSION_CONFLICT`-ի դեպքում էջը վերակարդում է։

**Realtime.** WebSocket-ով գալիս են պատվերի/առաջարկի փոփոխությունները (hint →
re-read)։ Քարտեզը թարմացվում է 15 վ-ը մեկ viewport-ով (Ամբողջ Հայաստան / Երևան
bbox)։ 400 վարորդի ամբողջական ցուցակը ամեն GPS կետի համար **չի** ուղարկվում։

**Հին կետը** քարտեզում գծված է դատարկ, մոխրագույն, կետագծով շրջանակով։

## Քարտեզ — գիտակցված սահմանափակում

> **Ժամանակավորապես թաքցված է (2026-11).** Առանց tile-երի սխեմատիկ քարտեզը օպերատորին «կոտրված» էր թվում։ `SHOW_OPS_DRIVER_MAP = false` (`frontend/constants/admin.ts`). մնում է վարորդների ցուցակը՝ ամեն վարորդի Google Maps հղումով։ Իրական provider ընտրելուց հետո միացնել կամ փոխարինել component-ը։

Գործող codebase-ը map SDK չունի, CSP-ն tile host չի թույլատրում, և
`docs/nearest-search.md`-ը հիմնավորում է, թե ինչու embedded map չկա։ Առաջին
տարբերակում քարտեզը **սխեմատիկ SVG** է (առանց ճանապարհների), իսկ ամեն կետ
բացվում է Google Maps-ում։ Pickup/destination-ը նշվում է կոորդինատներով (Google
Maps-ից copy — նույն մոտեցումը, ինչ `CoordinatesInput`-ը)։ **Հասցեի որոնում
(geocoding) չկա** — provider ընտրված չէ։

Իրական tile map ավելացնելու համար անհրաժեշտ որոշումներ՝ provider (Google Maps JS
domain-restricted key-ով / MapLibre + կոմերցիոն tiles), CSP-ի ճշգրիտ host-եր,
cookie/consent ազդեցություն (ադմին էջերում analytics-ը արդեն անջատված է), billing։
Ինտեգրման կետը `components/ops/OpsDriverMap.vue`-ն է (նույն props-ը)։

## DISPATCHER դեր

`npm run admin:create -- ops@evakuators.am '<password>' DISPATCHER`։ Մուտքը նույն
`/admin` էջից (2FA-ն նույնն է)։ Մուտքից հետո ավտոմատ ուղղորդում `/admin/orders`։
Գործող `/admin/*` API-ները DISPATCHER-ի համար վերադարձնում են **403** (ոչ 401), որպեսզի
frontend-ը նրան դուրս չհանի։

## Միջադեպեր՝ չեղարկում, վարորդի խնդրանք, հրաժարում (2026-11-16)

Ամեն ինչ հաշվարկվում է արդեն եղած տվյալներից (`OrderEvent`, `OrderAlert`, assignments), նոր API չկա․ բառերը և «բաց է, թե ոչ» որոշումը՝ `frontend/utils/orderIncidents.ts` (թեստեր՝ `tests/orderIncidents.spec.ts`)։

- **Պատվերի էջ.** բաց միջադեպերը՝ մեծ գունավոր բաններով վերնագրի տակ (`components/ops/OrderIncidentBanner.vue`)․ կարմիր՝ չեղարկված, դեղին՝ վարորդը խնդրում է չեղարկել / խնդիր է հայտնել, կապույտ՝ վարորդը հրաժարվեց և պատվերը վերադարձվեց որոնման (բաց է, մինչև մեկ ուրիշը չընդունի)։ Ով, երբ, պատճառը, մեկնաբանությունը և կոճակներ՝ զանգել վարորդին / հաճախորդին, շարունակել նույն վարորդով, հանել վարորդից և նոր որոնում, չեղարկել (տանում է չեղարկման ձևին, պատճառը պետք է ընտրել)։ «Միջադեպեր» բաժինը՝ ամբողջ պատմությունը։
- **Ցանկ.** խնդրահարույց տողը ստանում է գունավոր նշան և եզր․ վարորդի alert-ով կամ NEEDS_ATTENTION պատվերները բարձրանում են վերև։
- **Ձայն + բրաուզերի ծանուցում** (`composables/useIncidentAlarm.ts`)․ 10 վ-ը մեկ նոր `DRIVER_CANCEL_REQUEST`, `DRIVER_PROBLEM`, `DRIVER_CANCELLED_REDISPATCHED` alert-ի դեպքում։ Միացվում է OpsNav-ի «🔕 Միացնել ձայնը» կոճակով (բրաուզերը ձայն և ծանուցում թույլ է տալիս միայն օգտատիրոջ սեղմումից հետո), ընտրությունը պահվում է այս բրաուզերում։ Console-ը բացելու պահին արդեն եղած alert-ները չեն զանգում։

### Wallets list: status and period totals (2026-11-16)

`GET /ops/dispatch/wallets?days=N` (same `days` as the summary cards) adds per driver:
`orderStatus` (`OK` / `LOW_BALANCE` / `BILLING_OFF` / `NOT_ACTIVE`), `shortfallAmd`,
`periodInAmd` (TOPUP + TOPUP_BONUS + ADMIN_CREDIT), `periodFeesAmd` (net fees) and
`periodFeeOrders`. `orderStatus` **mirrors** dispatch and never decides it:
`walletPredicate` compares balance + credit with the fee of the order at hand, and
`walletFeeBaseAmd` is the smallest non-zero fee, so `LOW_BALANCE` means "no paid
orders" — a minimum-price (free) order still reaches him. The page refreshes only
on load, on a period change and after an operator action (no polling, by choice).

### Editing an order (2026-11-16)

«✏️ Խմբագրել» on `/admin/orders/:id` opens the **same** form as «+ Նոր պատվեր»:
`components/ops/OrderFormFields.vue` + `frontend/utils/orderForm.ts` (state,
rules, body), rendered by both pages — add a question there, never in a page.
`frontend/tests/orderForm.spec.ts` fails if either page stops using the component.

- Only changed groups are sent (`orderEditBody`), never a locked one. The backend
  (`orders.repository.ts` `update`) refuses an assigned order's material columns
  by **presence**, so resending an unchanged weight would fail the whole save.
- Locks mirror that rule (`orderFormLocks`): closed → internal note only; a driver
  attached → pickup, weight, requirements and price **type** are greyed out
  (release the driver first). The server stays the authority.
- The save carries the version the form was **opened** at. On `VERSION_CONFLICT`
  the form reopens on the fresh order instead of rebasing the operator's typing,
  which would silently revert the other change.
- No new backend code: a material change already pushes the assigned driver
  (`TERMS_CHANGED`, the app refreshes on any push/realtime event), and while
  `SEARCHING` revokes the pending offer and re-offers the same driver.

### Pickup precision (2026-11-17)

Whenever pickup coordinates are written — the order form (create/edit) or the
order page's «add coordinates» box — the operator must answer «exact or
approximate?» (`components/ops/PickupPrecisionPicker.vue`, no default on
purpose). Stored as `DispatchOrder.pickupPrecision` (`EXACT` / `APPROXIMATE`,
NULL without coordinates or on older orders); the API refuses coordinates
without it (`order-input.ts` `pickupPoint`). It travels as `pickup.precision`
in the admin, offer and active-order views. The driver app shows it on the
offer and under «Նավիգացիա» while heading to the pickup; an approximate point
reads «call the customer for the exact spot». Editing an older assigned order
(coordinates, no precision) still works: the locked pickup is never sent, so
it is not validated either (`orderEditBody`).

### Operator alerts on Telegram + watchdogs (2026-11-17)

The console's sound and browser notification work only while the admin page is
open. The alerts that need a person now also go to Telegram:

- **What**: `OPS_TELEGRAM_ALERT_KINDS` in `backend/src/live-dispatch/notify/ops-telegram.ts`
  — driver cancel / «customer will call» / problem / cancel screen left open,
  search failed, minimum-price review. GPS-lost and «not moving» stay console-only.
  New registrations were already sent by `AdminNotificationService`.
- **How**: `raiseAlert` enqueues an `ops.alert` outbox message in the same
  transaction; the worker sends it through the ADMIN bot
  (`ADMIN_TELEGRAM_BOT_TOKEN`) to every admin with `User.telegramChatId` —
  linking Telegram for 2FA (`npm run admin:telegram-link -- <email>`) is the
  subscription. Retried by the outbox when nobody could be reached; one admin
  who blocked the bot does not make the others get it twice.
- Off production every message starts with the host (`[staging.evakuators.am]`):
  staging's database is a copy of production's, the same admins are linked.
- **Watchdogs** (`notify/ops-watch.ts`), each process watched from outside:
  the API watches the worker's `SystemHeartbeat` row (stale > 2 min) and the
  nightly backup's (> 26 h, or never); the worker GETs the API's
  `/api/v1/health` every minute (two failures in a row). One «🔴 down» per
  incident, one «🟢 back» on recovery; the state is in `SystemHeartbeat.alertedAt`.

### Errors page — in-house error tracking (2026-11-17)

No outside service (by decision). `ErrorGroup` holds one row per distinct
problem (source + message with ids/numbers blanked + first stack frame) with a
counter — `backend/src/error-tracking/error-store.ts`.

- **Who writes**: the API's 5xx (`AllExceptionsFilter`, grouped by route, not
  URL), the worker's jobs that fail 3 times and reconciler crashes, the admin
  pages (`frontend/plugins/error-report.client.ts`, `/admin/*` only, filtered
  by `utils/errorReport.ts`), the driver app (`mobile/src/telemetry/`,
  installed first in `index.ts`). Clients post to the public, throttled
  `POST /api/v1/errors/client` (20/min/IP; past 2 000 open groups a NEW kind is
  dropped, an existing one still counts).
- **Telegram**: a new group, or one that comes back after «Լուծված է», goes to
  the operators (max 10/hour per process).
- **Privacy**: phone numbers and long digit runs are blanked before storage.
- Page: `/admin/orders/errors` (ADMIN), tab «Սխալներ».

### Driver rating (2026-11-17)

On a COMPLETED order's page the operator gives 1–5 stars (and an optional
comment), usually after asking the customer: `PUT /ops/dispatch/orders/:id/rating`
→ `OrderRating` (one per order, for the driver who completed it; rating again
replaces it; `ORDER_RATED` in the timeline). The average shows on the drivers
page (⭐ 4.5 (3)) and the stats page. **Information only** — dispatch does not
read it.

### Stats page (2026-11-17)

`/admin/orders/stats` ← `GET /ops/dispatch/stats?days=N` (`adminStats`), read
from what is already recorded — nothing stored for it. Tiles: orders; time to
find a driver (median and p90, search start → FIRST assignment, so a
re-dispatch does not restart the clock); offer acceptance
(accepted ÷ (accepted + rejected + expired) — a system-revoked offer is not the
driver's answer); search failures. Tables: driver cancellations by reason,
operator cancellations by reason, per driver (offers / accepted / rejected /
no answer / completed / cancelled / rating), per day.
