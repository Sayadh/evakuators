# Live dispatch — 10. Բեռնվածության թեստի հաշվետվություն

**Իրական չափումներ, ոչ թե գնահատականներ։** Գործարկվել է 2026-11-08-ին
`backend/load-test/run.ts`-ով (`npm run load:live`)։

## Միջավայր (ինչ է իրականում չափվել)

| | |
| --- | --- |
| CPU | 2× Intel Xeon @ 2.10 GHz (ամպային կոնտեյներ) |
| RAM | 7.8 GiB |
| Node | v22.23.4 |
| PostgreSQL | 16.15, նույն մեքենայի վրա, **առանց PostGIS** (թեկնածուների հեռավորությունը՝ plain-SQL haversine) |
| Pool | 40 կապ (test driver) |
| Routing | `FakeRoutingProvider` (առանց վճարի, առանց ցանցի) |
| Push | `RecordingPushSender` (ոչ մի իրական ծանուցում) |
| Մակարդակ | **Service level** — նույն application service-ը և repository-ները, ինչ HTTP controller-ները կանչում են, **առանց** HTTP/TLS/JSON/Nest guard-throttler շերտի |

Ինչ **չի** չափվել (բաց կետեր)՝ HTTP-մակարդակի թեստ իրական Nest process-ով
(k6/autocannon staging-ի դեմ), PostGIS-ով geo-հարցում, nginx + TLS, իրական
Google Routes latency, իրական FCM, իրական VPS-ի ռեսուրսներ։ Սրանք պետք է
կատարվեն staging-ում՝ `09-rollout-and-rollback.md` § Staging-ի քայլերով։

## Սցենար A — 400 գրանցված, 400 առցանց, 60 վ

Յուրաքանչյուր առցանց վարորդ՝ GPS ~30 վ ± 10 վ, heartbeat ~45 վ; 1 պատվեր 2 վ-ը մեկ
(70% accept, 20% reject, 10% timeout); 5 հանրային այցելու ~1 որոնում/վ; snapshot-ներ
~10/վ; կեսին՝ **reconnect burst** (բոլոր 400-ը միաժամանակ heartbeat + snapshot);
2/3-ին՝ **worker restart**։

| Գործողություն | n | rps | p50 | p95 | p99 | max | սխալներ |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| location ingest (1 fix) | 821 | 13.7 | 3.1 ms | 5.4 ms | 8.5 ms | 120.7 ms | 0 |
| heartbeat | 41 | 0.7 | 0.9 ms | 1.6 ms | 3.0 ms | 3.0 ms | 0 |
| driver snapshot | 582 | 9.7 | 2.2 ms | 3.3 ms | 5.7 ms | 380.4 ms | 0 |
| order create + start | 30 | 0.5 | 10.2 ms | 47.9 ms | 290.7 ms | 290.7 ms | 0 |
| offer accept | 30 | 0.5 | 6.0 ms | 10.5 ms | 12.8 ms | 12.8 ms | 0 |
| public live nearby | 297 | 5.0 | 5.2 ms | 10.0 ms | 42.0 ms | 194.6 ms | 0 |
| reconnect burst (400 միաժամանակ) | 400 | — | 433.8 ms | 484.3 ms | 485.0 ms | 486.7 ms | 0 |

Worker՝ 190 outbox հաղորդագրություն, tick p95 26.2 ms։ Պատվերներ՝ 30, բոլորը ASSIGNED։
Push (գրանցված, չուղարկված)՝ 36։ Routing կանչեր՝ 246։ Process RSS՝ 96 MiB։

**Invariant-ներ բեռնվածությունից հետո.** >1 ակտիվ assignment ունեցող պատվեր՝ **0**,
>1 ակտիվ assignment ունեցող վարորդ՝ **0**, 10 վ-ից ավելի ժամկետանց PENDING offer՝ **0**։

Reconnect burst-ի 434–487 ms-ը **pool-ի հերթագրում** է (400 միաժամանակյա
խնդրանք, 40 կապ), ոչ թե առանձին հարցման դանդաղություն։

## Սցենար B — դանդաղ routing provider (1500 ms), 400 գրանցված / 240 առցանց, 45 վ

Առաջին գործարկումը **բացահայտեց իրական խնդիր**. հանրային որոնումը հերթագրվում էր
routing-ի concurrency slot-երի վրա՝

| | p50 | p95 | p99 |
| --- | ---: | ---: | ---: |
| public live nearby (մինչև ուղղումը) | 1948 ms | 2941 ms | 3657 ms |

Ուղղում՝ `GuardedRouting.rejectWhenBusy` հանրային որոնման համար (բոլոր slot-երը
զբաղված → անմիջապես ուղիղ գծով պատասխան, առանց ժամանակի) և 2 վ timeout։ Կրկին
գործարկում՝

| Գործողություն | n | p50 | p95 | p99 | max | սխալներ |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| location ingest | 363 | 3.2 ms | 5.3 ms | 12.2 ms | 228.0 ms | 0 |
| driver snapshot | 437 | 2.2 ms | 3.0 ms | 4.9 ms | 222.4 ms | 0 |
| order create + start | 23 | 10.6 ms | 14.1 ms | 43.4 ms | 43.4 ms | 0 |
| offer accept | 21 | 5.1 ms | 8.8 ms | 135.7 ms | 135.7 ms | 0 |
| public live nearby (ուղղումից հետո) | 155 | **4.2 ms** | 1506.9 ms | 1532.0 ms | 3028.6 ms | 0 |
| reconnect burst (240) | 240 | 307.4 ms | 328.3 ms | 328.5 ms | 328.6 ms | 0 |

p95 ≈ 1.5 վ-ը այն որոնումներն են, որոնք routing slot ստացան և սպասեցին provider-ի
1.5 վ-ին — սա provider-ի ուշացումն է, ոչ հերթ։ Worker tick p95 = 1523 ms (նույն
պատճառով․ dispatch-ը **սպասում** է routing-ին, դա ճիշտ է)։ Invariant-ներ՝ **0 / 0 / 0**։

## Եզրակացություններ

1. 400 առցանց վարորդ ~30 վ թարմացումով = ~14 GPS հարցում/վ — DB-ի կողմից p99 < 10 ms, մեկ VPS-ի համար լուրջ բեռ չէ։
2. Կրկնակի նշանակում չի եղել ոչ մի սցենարում, ներառյալ worker restart-ը։
3. Routing provider-ի դանդաղությունը չի դանդաղեցնում driver/admin API-ն (առանձին process, առանձին semaphore)։
4. Հանրային որոնումն այլևս չի հերթագրվում provider-ի վրա։

## Ինչպես կրկնել

```bash
cd backend
export LIVE_DISPATCH_TEST_DATABASE_URL=postgres://user@127.0.0.1:5432/postgres  # scratch server, NOT production
npm run load:live                                         # Սցենար A
LOAD_ROUTING_LATENCY_MS=1500 LOAD_ONLINE_FRACTION=0.6 LOAD_DURATION_S=45 npm run load:live   # Սցենար B
```

Սկրիպտը ստեղծում և ջնջում է իր `ld_test_*` բազան, invariant-ի խախտման դեպքում վերադարձնում է exit code 2։
