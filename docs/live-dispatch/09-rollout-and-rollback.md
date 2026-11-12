# Live dispatch — 09. Տեղադրում, migration, rollback

> **Production-ը այս աշխատանքի ընթացքում ՉԻ փոփոխվել։** Ոչ մի migration, push,
> deploy չի կատարվել որևէ սերվերի վրա։ Ստորև պլան է, որը պետք է կատարի նախագծի
> պատասխանատուն՝ առանձին թույլտվությամբ։

## 1. Ինչ է փոխվում (ամփոփ)

| Մաս | Փոփոխություն | Ռիսկ |
| --- | --- | --- |
| DB | 3 additive migration (նոր enum արժեք, 16 նոր աղյուսակ, 2 generated geography սյունակ նոր աղյուսակներում) | Ցածր․ գործող տվյալներ չեն փոխվում |
| Backend | Նոր module (`LiveDispatchModule`), `AdminJwtGuard`-ում սխալ դերի համար 401 → 403, `NearestModule`-ը export է անում `NearestService`, `coordinates.ts`-ից pure մասը առանձնացված | Ցածր․ բոլոր նոր endpoint-ները flag-երի հետևում |
| Worker | Նոր PM2 process `evakuators-worker` | Flag-ը անջատված → idle |
| Frontend | Նոր էջեր `/admin/orders/*`, `/evakuator`-ում live բաժին flag-ի հետևում, `apiClient`-ում `/ops/` | `/evakuator`-ը flag-ով անջատված վիճակում նախկինի պես է |
| nginx | `location = /api/v1/realtime` (WebSocket upgrade) | Ձեռքով, `nginx -t` |
| Env | Նոր փոփոխականներ (`.env.example`), բոլորը անվտանգ լռելյայններով | — |

## 2. Feature flags (բոլորը լռելյայն `false`)

| Flag | Որտեղ | Ինչ է միացնում |
| --- | --- | --- |
| `LIVE_DISPATCH_ENABLED` | backend `.env` | Ավտոմատ/ձեռքով առաջարկներ, worker loop, reconciler |
| `DRIVER_TRACKING_ENABLED` | backend `.env` | GPS ingest (`/driver-app/me/locations`) |
| `LIVE_NEARBY_ENABLED` | backend `.env` | `POST /nearest-tow-trucks/live` |
| `NUXT_PUBLIC_LIVE_NEARBY_ENABLED` | ecosystem env | `/evakuator`-ում live բաժինը |
| `DISPATCH_ROUTING_PROVIDER` | backend `.env` | `fake` (լռ.) → `ors` / `google` |
| `PUSH_PROVIDER` | backend `.env` | `recording` (լռ., ոչինչ չի ուղարկում) → `fcm` |

Rollout-ի հերթականություն՝ (1) migration + deploy, flags off → (2) staging-ում
ամբողջ հոսքը → (3) production-ում `DRIVER_TRACKING_ENABLED` 3–5 փորձնական
վարորդի համար (հավելվածը տրվում է միայն նրանց) → (4) `LIVE_DISPATCH_ENABLED` +
`fake`→`google` routing + `fcm` push, օպերատորը պատվերները սկսում է ձեռքով
→ (5) ավելի շատ վարորդներ → (6) `LIVE_NEARBY_ENABLED` (երբ թարմ GPS-ով վարորդների
քանակը բավարար է)։

## 3. Staging (առաջինը)

```bash
# staging checkout (docs/deployment.md § Staging environment), ports 3003/4003
git fetch && git checkout feature/dispatch-v1
(cd backend && npm install && npx prisma migrate deploy && npx prisma generate && npm run build && npm run check:di)
(cd frontend && npm install && npm run build)
pm2 startOrReload ecosystem.staging.config.js
```

Staging `.env`-ում՝ `LIVE_DISPATCH_ENABLED=true`, `DRIVER_TRACKING_ENABLED=true`,
`PUSH_PROVIDER=recording`, `DISPATCH_ROUTING_PROVIDER=fake`, `REDIS_URL=redis://127.0.0.1:6379/1`
(**առանձին Redis DB index**)։ Staging DB-ն production-ի պատճենն է
(`scripts/refresh-staging-db.sh`) — **իրական push-եր staging-ից չուղարկել**։

### Smoke (staging)

1. `npm run test:live` staging մեքենայում scratch Postgres-ի դեմ (`LIVE_DISPATCH_TEST_DATABASE_URL`)։
2. `curl -s https://staging-api…/api/v1/health` → `database: up`։
3. `npm run admin:create -- ops@test 'pass' DISPATCHER` → մուտք `/admin` → ավտոմատ ուղղորդում `/admin/orders`; `/admin/*` API-ները 403 են։
4. Ստեղծել պատվեր → «Սկսել» → (առանց առցանց վարորդների) NEEDS_ATTENTION 1–2 վ-ում։
5. Development build-ով հավելված → staging → consent → online → admin map-ում թարմ կետ։
6. Ամբողջ հոսքը՝ offer → accept → progress → complete; timeline-ը ամբողջական է։
7. `EXPLAIN ANALYZE` PostGIS հարցման համար (տես §7)։
8. WebSocket՝ admin console-ում «Կենդանի»։
9. Worker-ի kill (`pm2 restart evakuators-worker-staging`) offer-ի ժամանակ → offer-ը ժամկետանց է դառնում և հաջորդ վարորդը ստանում է առաջարկ։

### External smoke (առանձին, ձեռքով, staging-ում)

- `DISPATCH_ROUTING_PROVIDER=google` + server key (IP-restricted, միայն Routes API) → 1 պատվեր → admin detail-ում candidates-ը `google-routes` provider-ով։
- `PUSH_PROVIDER=fcm` **միայն** թեստային Firebase project-ով և թեստային սարքով → offer push lock screen-ին։

## 4. Production migration plan

```bash
# 0. Backup (scripts/backup-db.sh) — և ստուգել, որ ֆայլը վավեր է
sudo -u postgres pg_dump -Fc evakuators > /var/backups/evakuators/pre-live-dispatch-$(date +%F-%H%M).dump
pg_restore --list /var/backups/evakuators/pre-live-dispatch-*.dump | head   # readable?

# 1. PostGIS արդեն տեղադրված է (TowTruck.location) — migration-ը կրկնում է CREATE EXTENSION IF NOT EXISTS
# 2. Deploy (docs/deployment.md, schema-ն փոխվել է → prisma generate)
git pull \
  && (cd frontend && npm install && npm run build) \
  && (cd backend && npm install && npx prisma migrate deploy && npx prisma generate && npm run build && npm run check:di) \
  && pm2 startOrReload ecosystem.config.js && pm2 save
# 3. nginx: ձեռքով ավելացնել `location = /api/v1/realtime` block-ը (nginx/evakuators.am.conf), `nginx -t`, reload
# 4. Redis (եթե չկա): apt install redis-server; bind 127.0.0.1; REDIS_URL=redis://127.0.0.1:6379/0
```

Migration-ների տևողությունը՝ նոր դատարկ աղյուսակներ, գործող աղյուսակների վրա
lock չկա (բացի `ALTER TYPE "UserRole" ADD VALUE`-ից, որը կարճ է)։

## 5. Rollback

| Իրավիճակ | Քայլ | Տվյալների կորուստ |
| --- | --- | --- |
| Խնդիր նոր ֆունկցիոնալում | Flag-երը `false` + `pm2 restart` | Ոչ |
| Backend/frontend կոդի խնդիր | `git checkout <նախորդ commit>` + build + restart; migration-ները **թողնել** (additive են, հին կոդը դրանք չի տեսնում) | Ոչ |
| Worker-ի խնդիր | `pm2 stop evakuators-worker` — offer-ների deadline-ները DB-ում են; worker-ի վերադառնալուց հետո reconciler-ը կփակի ժամկետանցները | Ոչ |
| Migration-ի ամբողջական հետկանչ (խորհուրդ չի տրվում) | Ձեռքով `DROP TABLE` նոր աղյուսակների համար — **կջնջի պատվերների պատմությունը**; `UserRole.DISPATCHER`-ը PostgreSQL-ում հնարավոր չէ հեռացնել առանց type-ի վերաստեղծման | Այո |
| Աղետ | `pg_restore` §4-ի backup-ից | Backup-ից հետո ամեն ինչ |

**Սահմանափակում.** Եթե rollback-ից առաջ արդեն կան `DISPATCHER` դերով օգտատերեր,
հին կոդը (որտեղ schema-ում DISPATCHER չկա) Prisma-ով այդ օգտատերերին կարդալիս
սխալ կտա։ Rollback-ից առաջ՝ `UPDATE "User" SET role='ADMIN' WHERE role='DISPATCHER'`
կամ ջնջել այդ օգտատերերին։

## 6. Backup/restore runbook (live dispatch-ի համար լրացում)

`scripts/backup-db.sh`-ը արդեն վերցնում է ամբողջ բազան, ներառյալ նոր աղյուսակները։
`DriverLocationHistory`-ն ամենաարագ աճողն է (400 × 2/ր × 60 × 24 ≈ 1.15 մլն տող/օր
լրիվ առցանց fleet-ի դեպքում)․ retention-ը (լռ. 7 օր) worker-ի housekeeping-ն է։
Restore-ի ստուգում ամսական՝ staging-ում `pg_restore` + `npm run test:live`։

## 7. PostGIS ստուգում (staging/production, read-only)

```sql
EXPLAIN (ANALYZE, BUFFERS)
WITH origin AS (SELECT ST_SetSRID(ST_MakePoint(44.5126, 40.1772), 4326)::geography AS point)
SELECT lc."driverId" FROM "DriverLocationCurrent" lc, origin o
WHERE ST_DWithin(lc."location", o.point, 20000)
ORDER BY lc."location" <-> o.point LIMIT 10;
-- Սպասվում է "Index Scan using DriverLocationCurrent_location_gist"
```
