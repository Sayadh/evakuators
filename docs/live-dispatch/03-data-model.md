# Live dispatch — 03. Տվյալների մոդել

Միգրացիաներ (բոլորը **additive**, ոչ մի գործող աղյուսակ/սյունակ չի փոխվում կամ ջնջվում, backfill չկա)՝

| Ֆայլ | Ինչ է անում |
| --- | --- |
| `20261108090000_add_dispatcher_role` | `UserRole` + `DISPATCHER` |
| `20261108090100_live_dispatch_core` | 16 աղյուսակ, 6 enum, sequence (ստորև) |
| `20261108090200_live_dispatch_postgis` | `DriverLocationCurrent.location` և `DispatchOrder.pickupLocation` — `GENERATED ALWAYS … STORED` geography + GiST |

Բոլոր նոր ժամերը `TIMESTAMPTZ(3)` են (UTC)։ Գործող աղյուսակների `TIMESTAMP(3)`-ի
փոխարեն՝ դիտավորյալ․ բոլոր deadline-ները համեմատվում են `now()`-ի հետ SQL-ի
ներսում, և `timestamptz`-ը չի կախված սերվերի `TimeZone`-ից (`common/sql-utc.ts`-ի
լուծած սխալի դասը)։ UI-ում ցուցադրվում է `Asia/Yerevan`։

## Էություններ

| Աղյուսակ | Դեր | Կարևոր constraint-ներ |
| --- | --- | --- |
| `DriverDeviceSession` | Հավելվածի մուտք, revoke-ելի | `one_active_per_driver` (partial unique, `revokedAt IS NULL`) |
| `PushDeviceToken` | FCM token ↔ session | `token_active` (partial unique) |
| `DriverPresence` | Վարորդի ընտրություն, heartbeat, արտաքին զբաղվածություն, ադմինի կասեցում, consent, `availableSince` | PK = `towTruckId` |
| `DriverLocationCurrent` | Վերջին **վստահելի** fix | PK = `towTruckId`; monotonic UPSERT (session → seq → measuredAt) |
| `DriverLocationHistory` | Սահմանափակ պատմություն (`late`, `suspicious`) | `(sessionId, seq)` unique → կրկնվող առաքումը կլանվում է; retention cleanup |
| `DispatchOrder` | Պատվեր | `attention_check` (NEEDS_ATTENTION ⇔ attentionKind), գնի ≥ 0, AMD-only, destination զույգ |
| `DispatchAttempt` | Մեկ որոնման փորձ՝ բացարձակ `alertAt`/`deadlineAt` | `one_open_per_order` |
| `DispatchCandidate` | Փորձի դասավորված ցուցակ + road figures + ինչ եղավ յուրաքանչյուրի հետ | `(attemptId, towTruckId)` unique — նույն վարորդը նույն փորձում երկու անգամ չի դիտարկվում |
| `OrderOffer` | Առաջարկ = **reservation** | `one_pending_per_driver`, `one_pending_per_order`, `(attemptId, towTruckId, termsVersion)` unique, `expiresAt > createdAt` |
| `OrderAssignment` | Նշանակում (պատմությամբ) | `one_active_per_order`, `one_active_per_driver` (partial unique, `endedAt IS NULL`), `offerId` unique |
| `OrderEvent` | Audit trail (append-only) | ամեն փոփոխության հետ նույն transaction-ում |
| `OrderAlert` | Ազդանշաններ, որոնք վիճակ չեն փոխում | `dedupeKey` unique |
| `OrderDriverRequest` | Վարորդի cancel/problem հարցում | `one_open_per_order`; `OTHER` ⇒ comment պարտադիր (CHECK) |
| `NotificationDelivery` | QUEUED / PROVIDER_ACCEPTED / APP_ACKNOWLEDGED — առանձին offer status-ից | `(offerId, channel, kind)` unique |
| `OutboxEvent` | Transactional outbox + scheduler (`availableAt`) | `dedupeKey` unique |
| `IdempotencyKey` | `(scope, key)` → fingerprint + պահված պատասխան | PK; TTL 24 ժ |
| `DispatchSetting` | Runtime կարգավորումներ (validated) | — |
| `RoutingUsageDay` | Routing **elements** օրական, provider/budget key-ով | PK `(day, provider)` |

## Պատվերի դաշտեր (ըստ պահանջի)

| Պահանջ | Դաշտ(եր) |
| --- | --- |
| ID և մարդուն հասկանալի համար | `id`, `number` (`EV-000123`, sequence) |
| Աղբյուր | `source` (`ADMIN`, ապագայում `WEBSITE`) |
| Ստեղծող operator | `createdByUserId` |
| Հաճախորդի հեռախոս | `customerPhone` (`+374XXXXXXXX`), `customerName` |
| Pickup / destination | `pickup*`, `destination*` (destination-ը կամընտիր, զույգը CHECK-ով) |
| Մեքենա | `vehicleMake/Model/Plate/WeightKg` |
| Խնդիր | `problemDescription` |
| Տեխնիկական պահանջներ | `wheelsRoll`, `steeringLocked`, `gearboxLocked`, `needsManipulator` (null = չի ճշտվել) + `requirementsOverride*` |
| Գին և վճարում՝ առանձին | `pricingMode`, `quotedPriceAmd`, `agreedPriceAmd`, `priceConfirmed*`, `currency='AMD'`; `paymentStatus` (`UNKNOWN/UNPAID/PAID`) |
| Կարգավիճակ | `status`, `attentionKind`, `statusBeforeAttention` |
| Ակտիվ assignment | `activeAssignmentId` → `OrderAssignment` |
| Optimistic concurrency | `version` (ամեն գրառում), `termsVersion` (էական պայմաններ) |
| Ժամեր | `createdAt … cancelledAt` |
| Չեղարկման պատճառ | `cancelReason`, `cancelComment` |

## Prisma

Նոր աղյուսակները **schema.prisma-ում մոդելավորված չեն** — օգտագործվում են միայն
parameterised raw SQL-ով `backend/src/live-dispatch/`-ում, քանի որ նրանց
ճշտության բոլոր կանոնները (partial unique index, `FOR UPDATE`, DB-clock
deadline, `ON CONFLICT … WHERE`) typed client-ից դուրս են։ Schema-ում ավելացված
է միայն `UserRole.DISPATCHER` (առանց դրա Prisma-ն չէր կարդա այդ դերով օգտատիրոջը)։
Հետևանք՝ `prisma migrate diff`-ը ցույց կտա այս աղյուսակների `DROP TABLE` տողեր
(գործող `DROP DEFAULT` baseline-ի կողքին)։ **Այդ diff-ը երբեք չկիրառել** —
ինչպես արդեն գրված է `docs/data-model.md § Migrations`-ում։ `prisma migrate dev`-ը
արգելված է, ինչպես միշտ։

## Գումարներ

`INTEGER` դրամ (AMD-ն ենթամիավոր չունի գործնականում), `currency` = `'AMD'`
CHECK-ով։ Ոչ մի floating-point հաշվարկ գումարի վրա։ Ավտոմատ գին, միջնորդավճար
կամ դինամիկ գնագոյացում **չկա**։
