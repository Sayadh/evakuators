# Live dispatch — 08. Թեստավորում

## Ինչպես գործարկել

```bash
# Backend — unit + integration (իրական PostgreSQL, ըստ ցանկության Redis)
cd backend
export LIVE_DISPATCH_TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5432/postgres   # scratch SERVER URL
export LIVE_DISPATCH_TEST_REDIS_URL=redis://127.0.0.1:6379                          # optional
npm run test:live

# Գործող Vitest թեստերը (անփոփոխ)
npm run test

# Mobile — pure modules, i18n parity
cd ../mobile && npm test

# Frontend — Vitest (ներառյալ նոր tests/opsDispatch.spec.ts)
cd ../frontend && npm run test
```

`LIVE_DISPATCH_TEST_DATABASE_URL`-ը **սերվերի** URL է․ յուրաքանչյուր թեստային ֆայլ
ստեղծում և ջնջում է իր `ld_test_<random>` բազան։ `DATABASE_URL`-ը երբեք չի կարդացվում։
Առանց այդ փոփոխականի integration թեստերը **բաց են թողնվում և դա ասում են**, ոչ թե
լուռ «անցնում»։ PostGIS առկայության դեպքում օգտագործվում է, բացակայության դեպքում
PostGIS migration-ները բաց են թողնվում (ինչպես `migrations.pglite.spec.ts`-ում)։

## Արդյունքներ (2026-11-08, իրական գործարկում)

| Հավաքածու | Միջավայր | Արդյունք |
| --- | --- | --- |
| `backend/test-live/*.test.ts` | PostgreSQL 16.15 + Redis 7.0.15, Node 22.23 | **109 / 109 pass**, 0 skip, ~16 վ |
| Typecheck (framework-free կոդ + թեստեր) | TypeScript 6.0.3, strict, `noUnusedLocals` | 0 սխալ |
| `mobile/test/*.test.ts` | Node 22 | **15 / 15 pass** |
| Mobile pure modules typecheck | TypeScript 6.0.3 strict | 0 սխալ |
| `frontend/tests/opsDispatch.spec.ts` | vitest-համատեղելի shim (node:test) | **6 / 6 pass** |
| Գործող frontend թեստեր (ռեգրեսիա) | նույն shim-ը, `main` vs ճյուղ | **նույնական արդյունքներ** (723 pass; 9 ձախողում և՛ `main`-ում, և՛ ճյուղում — shim-ի սահմանափակում, ոչ իմ փոփոխություն) |
| Load test | տե՛ս `10-load-test-report.md` | 0 սխալ, 0 կրկնակի նշանակում |

## Պարտադիր դեպքերի ծածկույթ

| # | Դեպք | Թեստ |
| --- | --- | --- |
| 1 | Նույն պատվերի միաժամանակյա accept | `concurrency…#1` (20 զուգահեռ → 1 assignment), `#1b` |
| 2 | Նույն վարորդ, երկու պատվեր | `#2` (engine + DB index ուղղակի գրառմամբ), `#2b` |
| 3 | Accept vs expire | `#3` — 25 round, երկու ելքն էլ իրականում կատարվում են (20/5) |
| 4 | Accept vs admin cancel | `#4` — 20 round |
| 5 | Կրկնվող accept | `#5` (նույն key → replay) |
| 6 | Կրկնվող timeout job | `#6` (1 expiry, 1 advance; հին job-ը չի դիպչում ACCEPTED-ին) |
| 7 | Հին GPS-ը նորից հետո | `fleet…#7`, `#7b`, concurrent ingest |
| 8 | Նոր heartbeat, հին GPS | `fleet…#8`, `domain…` |
| 9 | Push deadline-ից հետո | `#9` (SKIPPED, ոչինչ չի ուղարկվում) |
| 10 | Worker-ը մեռնում է commit-ից հետո | `#10` (lease-ը լրանում է, հաջորդ worker-ը առաքում է) |
| 11 | Redis/worker restart → reconciliation | `#11` (բոլոր job-երը ջնջված → reconciler-ը վերականգնում է) + Redis reconnect (`adapters…`) |
| 12 | Կապի կորուստ ակտիվ պատվերի ժամանակ | `#12` (alert, ոչ երկրորդ նշանակում) |
| 13 | Routing matrix-ի մասնակի սխալներ | `#13` + adapter թեստեր |
| 14 | Հնացած public search → order | `#14`, `public-nearby…#14` |
| 15 | Unauthorized access | `#15` (data layer), WS gateway (`ws-gateway…`), contract-ում guard-ներ; HTTP guard-երը՝ **չստուգված** (Nest-ը տեղադրված չէր) |
| 16 | Idempotency key misuse | `#16` |
| 17 | Գնի փոփոխություն ակտիվ առաջարկի ժամանակ | `#17` |
| 18 | Cancel request vs progress | `#18` — 15 round |

E2E (`e2e.integration.test.ts`)՝ create → dispatch → accept → progress → complete;
reject/timeout → next; no candidates → NEEDS_ATTENTION; negotiated price; manual
reassignment; manual offer overrides; capability filtering։ Public nearby՝
`public-nearby.integration.test.ts`։

## Ինչ ՉԻ ստուգվել (անկեղծ ցուցակ)

| Մաս | Պատճառ | Ինչպես ստուգել |
| --- | --- | --- |
| NestJS controller-ներ, guard-եր, module wiring | Nest/Prisma տեղադրված չէին (ցանցը փակ էր) | `npm run build && npm run check:di`, ապա staging smoke (`09-…` § Smoke) |
| `PrismaSqlDatabase` adapter | Prisma տեղադրված չէր | staging-ում `npm run test:live` իրական Prisma-ով կարելի է կատարել` փոխարինելով pool-ը (ցուցում՝ adapter-ի մեկնաբանությունում) + smoke |
| PostGIS հարցումներ (`PostgisCandidateFinder`, `PostgisLiveQuery`) | PostGIS չկար | `npm run test:live` PostGIS-ով սերվերի դեմ — integration թեստերը հիմա օգտագործում են plain-SQL finder-ը. PostGIS ճշտման համար staging-ում `EXPLAIN` (`09-…`) |
| Nuxt էջեր (build/render) | Nuxt տեղադրված չէր | `cd frontend && npm run build && npm run lint && npm run test` |
| React Native հավելված (build, native) | SDK/սարքեր/credentials չկային | `06-mobile.md` § Build + Real-device checklist |
| Google Routes իրական կանչ, FCM/APNs իրական առաքում | Credentials չկային | `09-…` § External smoke (առանձին, ձեռքով) |
| HTTP-level load test | Nest-ը չէր գործարկվում | k6/autocannon staging-ում |
