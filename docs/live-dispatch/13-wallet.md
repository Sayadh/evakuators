# Live dispatch — 13. Վարորդի հաշիվ (wallet, 2026-11-12)

Վարորդը նախապես համալրում է հաշիվը (դրամով) Idram-ով, և ամեն պատվեր, որը
ընդունում է հավելվածում, արժե միջնորդավճար այդ հաշվից։ Հաշիվը չբավարարող
վարորդին պատվերներ չեն առաջարկվում։ Կայքի ամսական բաժանորդագրությունից
**անկախ** է (բաժանորդագրությունը՝ կայքում երևալու համար, հաշիվը՝ հավելվածի
պատվերների համար)։

**Լռելյայն անջատված է.** `walletBillingEnabled = 0`։ Միացնելը բիզնես որոշում է՝
`/admin/orders/settings` → «Վարորդի հաշվից միջնորդավճար» = 1։ Միացնելուց առաջ
վարորդներին հնարավորություն տվեք համալրել (կամ մուտքագրեք սկզբնական գումար
`/admin/orders/wallets`-ից), այլապես զրո մնացորդով բոլորը կդադարեն պատվերներ ստանալ։

## Միջնորդավճար (product decision 2026-11-12)

| Պատվերի գինը | Միջնորդավճար |
| --- | --- |
| մինչև 5 000 ֏ ներառյալ (նվազագույն գինը) | **0 ֏** |
| 5 001 – 15 000 ֏ (կամ գինը դեռ հայտնի չէ) | 1 000 ֏ |
| 15 000 ֏-ից վեր | **ամբողջ գնի 7%**, կլորացված 100 ֏-ով, ոչ պակաս 1 000 ֏-ից, **առավելագույնը 6 000 ֏** |

Օրինակներ՝ 20 000 → 1 400 · 25 000 → 1 800 · 30 000 → 2 100 · 50 000 → 3 500 · 86 000+ → 6 000։

Կարգավորումներ՝ `walletFeeFreeMaxPriceAmd`, `walletFeeBaseAmd`, `walletFeeBaseMaxPriceAmd`,
`walletFeePercent`, `walletFeeRoundAmd`, `walletFeeMaxAmd`։ Կոդը՝
`backend/src/live-dispatch/wallet/domain/fees.ts`։ Սանդղակը պատճենվում է ամեն
ORDER_FEE տողի վրա, ուստի սանդղակը փոխելուց հետո արդեն ընդունված պատվերները
հաշվարկվում են այն պայմաններով, որոնցով ընդունվել են (նաև առաջին՝ «+1000 ամեն 10 000-ից» սանդղակով ընդունվածները)։

## Երբ է շարժվում գումարը (`wallet/wallet-ledger.ts`)

- **Ընդունելիս** — նույն transaction-ում, որտեղ պատվերը դառնում է նրանը
  (`offers.repository.accept`)։ Գինը՝ ֆիքսված գինը, իսկ «պայմանավորվող» պատվերի
  համար՝ հիմնական 1000 ֏-ը։ Կիրառված սանդղակը պահվում է տողի վրա (`feeRules`)։
- **Գինը հաստատելիս** (`confirmPrice`) և **ավարտելիս** (`COMPLETE`) — միջնորդավճարը
  բերվում է վերջնական գնին՝ ընդունման պահի սանդղակով (`ORDER_FEE_ADJUSTMENT`, միայն տարբերությունը)։
- **Վերադարձ** (`ORDER_FEE_REFUND`) — երբ **օպերատորը** չեղարկում է պատվերը կամ
  հանում է վարորդից, **մինչ նա տեղ կհասներ** (`arrivedAt` դատարկ է)։ Վարորդի իր
  չեղարկումը չի վերադարձվում։ Տեղ հասնելուց հետո չեղարկումը՝ նույնպես ոչ։
- Մնացորդը կարող է բացասական դառնալ միայն ճշգրտումից (գինը համաձայնեցվեց ավելի
  բարձր) կամ օպերատորի գանձումից. մինչ համալրումը նոր պատվերներ չեն գալիս։

Idempotency-ն՝ տվյալների բազայում. մեկ միջնորդավճար և մեկ վերադարձ մեկ
assignment-ի համար, մեկ մուտքագրում մեկ վճարման համար (partial unique index-ներ)։

## Ով է ստանում առաջարկ

`walletPredicate` (`candidate-finder`, առաջարկի պահի կրկնակի ստուգում
`eligibleAmong`)՝ մնացորդ ≥ **այդ պատվերի** միջնորդավճարը։ Օպերատորի ձեռքով
առաջարկի դեպքում ցածր մնացորդը «փափուկ» պատճառ է (`BALANCE_LOW`)՝ կարելի է
շրջանցել պատճառով (audit), միջնորդավճարը գանձվում է, մնացորդը կարող է բացասական դառնալ։
Snapshot-ում՝ `wallet { billingEnabled, balanceAmd, low }` և availability պատճառ `BALANCE_LOW`.
Առաջարկի վրա՝ `fee { amountAmd, provisional }`։

## Համալրում Idram-ով

1. Հավելվածը՝ `POST /driver-app/me/wallet/topups { amountAmd }` → սերվերը ստեղծում է
   PENDING հաշիվ `SubscriptionPayment`-ում (`kind = WALLET_TOPUP`, նույն Idram bill
   համարների տարածքը) + `WalletTopup` (ում համար է), և վերադարձնում `payUrl` (30 րոպե)։
2. Հեռախոսի browser-ը բացում է `GET /driver-app/wallet/pay/:id?t=…` — էջը POST է անում
   Idram-ի ձևը (գումարը՝ մեր տողից, ոչ թե հղումից)։ Էջն ունի իր CSP-ն (մեկ nonce script,
   `form-action` միայն Idram)։
3. Idram-ի precheck-ը և confirmation-ը գալիս են **նույն** `POST /api/v1/idram/result`-ին։
   `IdramService`-ը WALLET_TOPUP-ը փոխանցում է `PaymentHandlerRegistry`-ում գրանցված
   handler-ին (`nest/wallet-payments.ts`) — IdramModule-ը live dispatch չի import անում։
   Confirmation-ը մեկ transaction-ում վճարումը նշում է PAID և մուտքագրում հաշվին,
   realtime `wallet.updated`։ Կրկնված callback-ը՝ «OK», կրկին չի մուտքագրում։
4. Հավելվածը սպասում է (`GET me/wallet/topups/:id` ամեն 3 վ, և վերադառնալիս)։

Միայն կայքում պրոֆիլ ունեցող վարորդը կարող է համալրել Idram-ով (վճարումների մատյանը
tow truck-ով է)։ Հին «միայն հավելվածի» հաշիվներին՝ օպերատորի մուտքագրում։

## Admin

`/admin/orders/wallets` — բոլոր մնացորդները (ցածրից), վարորդի քաղվածքը, Idram
համալրումները, ձեռքով մուտքագրում/գանձում (միայն ADMIN, Idempotency-Key, պարտադիր
նշում, որը վարորդը տեսնում է)։ Idram-ի WALLET_TOPUP վճարումները երևում են նաև
`/admin/payments`-ում («Հավելվածի հաշվի համալրում»)։

## Տվյալներ (`20261112000000_wallet_payment_kind`, `20261112000100_driver_wallet`)

`DriverWallet (driverId, balanceAmd)`, `WalletEntry` (append-only, `balanceAfterAmd`
ամեն տողում), `WalletTopup (paymentId → driverId)`, `PaymentKind.WALLET_TOPUP`։

## Երկրորդ փուլ (2026-11-12)

**Նվազագույն գնի ստուգում.** Վարորդը պայմանավորվող պատվերի համար գրում է նվազագույն
գինը (≤ `walletFeeFreeMaxPriceAmd`, 5 000 ֏).
- եթե երթուղին (`routeMeters`) > `walletFreeMaxRouteMeters` (5 կմ) → մերժվում է
  `PRICE_TOO_LOW_FOR_DISTANCE`, վարորդը պետք է գրի իրական գինը;
- այլապես գինն ընդունվում է, բայց ընդունելիս գանձված 1000 ֏-ը **չի** վերադարձվում
  ավտոմատ (ոչ գինը հաստատելիս, ոչ ավարտելիս)․ բացվում է `OrderPriceReview` + admin
  ազդանշան `PRICE_REVIEW`։ Օպերատորը զանգում է հաճախորդին.
  **«Ճիշտ է»** → վերադարձ, **«Ուղղել»** → իրական գինը գրվում է պատվերին, միջնորդավճարը
  հաշվարկվում է ըստ դրա, վարորդը ստանում է push `PRICE_CORRECTED`։
  `GET/POST /ops/dispatch/price-reviews`, նաև պատվերի էջում և `/admin/orders/wallets`-ում։

**Վարկային սահման.** `DriverWallet.creditLimitAmd` — օպերատորը (ADMIN) տալիս է վստահելի
վարորդին (`PUT …/wallet/credit-limit`). վարորդը պատվերներ է ստանում, քանի դեռ
`balance + creditLimit ≥ միջնորդավճար`։ Admin ցուցակում երևում է ավարտված պատվերների քանակը։

**«Մնացորդը քիչ է» push.** Երբ գանձումից հետո `balance + credit` < `walletFeeBaseAmd ×
walletLowBalanceOrders` (2 պատվեր) — մեկ push մեկ անկման համար (`lowNotifiedAt`),
համալրումից հետո նորից «զինվում» է։

**Հաճախորդը հրաժարվեց տեղ հասնելուց հետո.** Վարորդը՝ «Խնդիր» → «Հաճախորդը
հրաժարվեց» (ազդանշան)։ Օպերատորը զանգում է և չեղարկում `refundDriverFee: true`-ով
(«Վարորդը տեղ էր հասել․ վերադարձնել միջնորդավճարը»)։ Նույնը՝ release-ի համար։

**Համալրման բոնուս.** `walletTopupBonusEnabled`, `walletTopupBonusThresholdsAmd`
[20 000, 50 000] / `walletTopupBonusPercents` [5, 10] — Idram-ի հաստատման նույն
transaction-ում առանձին `TOPUP_BONUS` տող։

**Ֆինանսական dashboard.** `GET /ops/dispatch/wallets/summary?days=` — զուտ միջնորդավճար,
համալրումներ, բոնուսներ, վերադարձներ, ձեռքով գործողություններ, վարորդների հաշիվներում
պահվող գումար, պարտք, «պատվեր չեն ստանում» վարորդներ, սպասող գնի ստուգումներ, ըստ օրերի։
`/admin/orders/wallets` էջի վերևում։

Միգրացիաներ՝ `20261112200000_wallet_bonus_kind`, `20261112200100_wallet_credit_price_review`։

## Բաց հարցեր բիզնեսի համար

- **Հարկային կտրոն (ՀԴՄ / e-receipt)** — համալրման համար կտրոն տրամադրելու կարգը։
- **Մնացորդի վերադարձ** — վարորդը հեռանալիս կարո՞ղ է հետ ստանալ մնացորդը։
- **App Store** — ֆիզիկական ծառայության միջնորդավճար է, ոչ թե թվային ապրանք, ուստի
  Apple-ի In-App Purchase պարտադիր չէ (Guideline 3.1.3(e)/3.1.5)։ Ինտերֆեյսում գումարը
  դրամ է, ոչ «coin»՝ review-ում «virtual currency» չընկալվելու համար։

### A driver's cancel always refunds the fee (2026-11-17)

Every driver CANCEL refunds the fee in the same transaction as the release
(`orders.repository.ts` `driverRequest` → `release({ refundDriverFee: true })`),
whatever the reason — a cancel is only possible before setting off, so the job
was never done. Customer reasons (`CUSTOMER_WILL_CALL`, `CUSTOMER_DECLINED`) go
to `NEEDS_ATTENTION / CUSTOMER_PENDING` with the driver free at once; every
other reason redispatches automatically. The one exception is an order with no
pickup coordinates: the assignment is kept for the operator, and the refund
then follows the operator's release (before arrival → refunded).
An operator's cancel is unchanged: refunded before arrival, after arrival only
with «the driver came for nothing».
Tested in `test-live/wallet.integration.test.ts`.

### A minimum-price review dies with its driver (2026-11-17)

`OrderPriceReview` belongs to one assignment. When that driver leaves the order
(any release: his cancel or an operator's), `release()` marks a PENDING review
`VOID` and acknowledges its `PRICE_REVIEW` alert (`voidPriceReview`). Before
this, the review stayed PENDING: the next driver's own minimum price then hit
the one-pending-per-order unique index and his price confirmation failed, and a
CORRECT wrote a price onto another driver's negotiation. A cancel or a
completion does NOT void it — the order keeps that driver's price, so the call
to the customer still matters. Test: `wallet.integration.test.ts` (fails
without the fix).

### Referred orders — the referrer's share (2026-11-17)

A driver sometimes hands an order to us (the customer called him). The
operator marks it on the order: «Փոխանցող վարորդ» (`DispatchOrder.referrerDriverId`,
create and edit forms; locked once the order is closed). When ANOTHER driver
completes it, `creditReferrer` (`orders.repository.ts`) credits the referrer
`walletReferralSharePercent` (setting, default **80**) of the order's fee as a
`REFERRAL_CREDIT` line, pushes «Ձեր հաշիվը համալրվեց» and records
`REFERRAL_CREDITED` in the timeline. Example: a 5 001–15 000 ֏ order → fee 1 000 ֏
→ 800 ֏ to the referrer, 200 ֏ stays with us.

- Base = what the completing driver finally **paid** (after settlements and
  refunds). Billing off → the fee the schedule would have charged for the
  final price: he is paid either way (product decision).
- Waits while a minimum-price review is open (`REFERRAL_WAITING`);
  `resolvePriceReview` pays it on the operator's decision.
- Nothing (`REFERRAL_SKIPPED`) when the referrer did the job himself or the
  share rounds to 0 (free order); nothing at all for a cancelled order.
- Exactly once: checked in code and by the unique index
  `WalletEntry_one_referral_per_order`.
- Shown: order page (status and amount), Wallets summary («Փոխանցված
  պատվերների բաժիններ»), Stats per driver («Փոխանցել է»), the driver's own
  statement («Ձեր փոխանցած պատվերի բաժինը»). The order's `netFeeAmd` excludes it.
- Tests: `backend/test-live/referral.integration.test.ts`.
