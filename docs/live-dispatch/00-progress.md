# Live dispatch — 00. Փուլերի հաշվետվություն

Ճյուղ՝ `feature/dispatch-v1` (հիմքը՝ `main@7340e3a`)։ Ամսաթիվ՝ 2026-11-08։
Production-ին ոչինչ չի դիպչել։ Push դեպի GitHub չի կատարվել (հասանելիություն չկար)։

Լեգենդ՝ ✅ իրականացված և ստուգված իրական գործարկմամբ · 🟡 իրականացված, ստուգված
մասնակի (pure մաս/typecheck/text-level) · ⬜ իրականացված, չստուգված (պահանջում է
տեղադրված dependency-ներ, սարք կամ credentials) · ❌ չի իրականացվել

## Փուլ 1 — Audit, ճարտարապետություն, պայմանագրեր, schema plan ✅

- Գտնվեց իրական repo-ն (`Sayadh/evakuators`), կարդացվեցին `CLAUDE.md` և բոլոր համապատասխան `docs/*`։
- Փաստեր, որոնք տարբերվում են առաջադրանքից՝ SCSS (ոչ Tailwind), ORS (ոչ Google), վարորդ = `TowTruck`, մեկ ադմին դեր, Redis/WS/FCM չկան, `/admin/dispatch`-ը ձեռքով հեռախոսային գործիք է, `/evakuator`-ը չափում է կայանատեղից։
- Ֆայլեր՝ `docs/live-dispatch/01-audit-and-decisions.md`, `02`, `03`, `04`, `openapi.json`։

## Փուլ 2 — Migrations, auth, presence/location ✅

- 3 additive migration — կիրառված իրական PostgreSQL 16-ի վրա բոլոր 40 գործող migration-ների հետ միասին ✅ (PostGIS migration-ը ⬜ — PostGIS չկար)։
- Device session (revoke-ելի), consent, presence (6 անկախ փաստ), heartbeat, GPS validation/classification, monotonic UPSERT, suspicious jumps, bounded history + retention ✅ (12 integration + domain թեստեր)։
- App token (`aud: driver:app`) գործող credential-ով ⬜ (Nest controller)։
- Ֆայլեր՝ `backend/prisma/migrations/20261108090*`, `backend/src/live-dispatch/fleet/**`, `platform/**`, `common/armenia-bounds.ts`։

## Փուլ 3 — Order state machine, admin CRUD ✅

- Pure state machine + փաստաթուղթը գեներացվում է նույն աղյուսակից ✅։
- Create/edit (material change → termsVersion → offer revoke + re-offer), start/stop, cancel, price confirm, payment, progress, driver requests, flag/resume, release(+restart) ✅ (E2E + race թեստեր)։

## Փուլ 4 — Candidates, routing, sequential dispatch ✅ / ⬜

- Eligibility SQL ≡ TS (parity թեստ 160 պատահական վարորդով) ✅; ranking (transitive buckets) ✅; radius ladder, batches ✅ (plain-SQL finder-ով)։
- `PostgisCandidateFinder` ⬜ (PostGIS չկար)։
- RoutingProvider + Google Routes / ORS / Fake adapters, timeout/retry/concurrency/DB element budget ✅ (fake HTTP + իրական Postgres)։ Իրական Google կանչ ⬜ (key չկա)։

## Փուլ 5 — Reservations, transactions, outbox, worker, reconciliation ✅

- Partial unique index-ներ (reservation, assignment), lock ordering, DB-clock deadlines ✅
- Transactional outbox, SKIP LOCKED claim, lease, backoff, dead letters ✅
- Reconciler՝ overdue offers, stuck searches, alerts ✅
- Բոլոր 18 պարտադիր race/failure դեպքերը ✅ (տես `08-testing.md`)։ Worker entry `worker.ts` ⬜ (Prisma)։

## Փուլ 6 — Driver mobile app 🟡

- Expo SDK 58 dev build, 8 էկրան, hy/ru, background tracking, offline buffer, push, WebSocket, pending/uncertain actions ⬜ (build/device)։
- Pure մոդուլներ (countdown, buffer, policy, pending reconcile, i18n parity) ✅ 15 թեստ + typecheck։ Թեստը գտավ և ուղղվեց իրական սխալ (`jittered` նվազագույն սահման)։

## Փուլ 7 — Admin console 🟡

- `/admin/orders`, `/admin/orders/:id`, `/admin/orders/settings`, սխեմատիկ քարտեզ, realtime ⬜ (Nuxt build)։
- Labels/URL/idempotency/«live-ը չի պահվում» spec ✅ 6 թեստ; գործող frontend թեստերը՝ նույն արդյունքը `main`-ի հետ ✅։
- Գտնված և ուղղված խնդիր՝ DISPATCHER-ը `/admin`-ից դուրս կհանվեր (401) → հիմա 403 + ուղղորդում ✅ (կոդ), ⬜ (runtime)։

## Փուլ 8 — Public nearby ✅ / ⬜

- `NearbyLiveService` (live + fallback, առանց կոորդինատների, առանց կողմնակի ազդեցության, առանձին budget, fail-fast) ✅ 7 integration թեստ։
- `/evakuator` էջի ինտեգրում flag-ի հետևում ⬜ (Nuxt); գործող `nearestSearchLimits.spec.ts` ✅ անցնում է։

## Փուլ 9 — Integration/E2E/concurrency/load ✅

- 109 backend live թեստ ✅; service-level load test 2 սցենար ✅ (գտավ և ուղղվեց հանրային որոնման հերթագրման խնդիր)։
- HTTP-level load ⬜։

## Փուլ 10 — Staging, checklist, runbook ✅ (փաստաթղթեր) / ⬜ (կատարում)

- `09-rollout-and-rollback.md`, `06-mobile.md` checklist, PM2 worker, nginx WS, `.env.example`, `docker-compose.dev.yml` ✅ (գրված)։ Staging-ում կատարում ⬜։

## Բացակայող արտաքին տվյալներ / credentials

| Ինչ | Ում համար |
| --- | --- |
| `Sayadh/evakuators` push հասանելիություն (կամ ձեռքով push) | Ճյուղը GitHub-ում տեսնելու համար |
| Google Maps Platform server key (Routes API) + billing | Իրական ETA |
| Firebase project, service account, `google-services.json`, `GoogleService-Info.plist`, APNs .p8 | Push |
| Apple Developer, Google Play Console, EAS հաշիվ | Build/signing/store |
| Android + iOS իրական սարքեր | Checklist |
| Staging սերվերի հասանելիություն | Smoke, HTTP load test, PostGIS EXPLAIN |
| Բիզնես որոշումներ | Locked wheels/steering/gearbox → wheelSkates/crane; heavy-duty > 3.5 տ; geocoding provider; tile map provider; Google ToS caching review; consent տեքստի իրավական ստուգում |

## Հաջորդ քայլը

1. Ճյուղը push անել (`git push origin feature/dispatch-v1`) և բացել PR։
2. Մեքենայում, որտեղ կա ցանց՝ `cd backend && npm install && npx prisma generate && npm run build && npm run check:di && npm run lint && npm test && npm run test:live` (Postgres-ով)։ `cd frontend && npm run lint && npm test && npm run build`։ Ցանկացած compile սխալ Nest/Nuxt շերտում ուղղել (այդ շերտը այստեղ compile չի արվել)։
3. Staging smoke՝ `09-…` § 3։
4. Firebase + dev build՝ `06-mobile.md`։
