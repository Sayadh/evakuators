# Live dispatch — փաստաթղթերի ինդեքս

Վարորդի հավելված, պատվերների backend, ավտոմատ բաշխում, օպերատորի վահանակ և
`/evakuator`-ի live որոնում։ Ճյուղ՝ `feature/dispatch-v1`։

| Փաստաթուղթ | Բովանդակություն |
| --- | --- |
| [00-progress.md](00-progress.md) | Փուլերի հաշվետվություն — ինչ է արված, ստուգված, չստուգված, ինչ է պակասում |
| [01-audit-and-decisions.md](01-audit-and-decisions.md) | Գործող կոդի audit, ADR-ներ, միջավայրի սահմանափակումներ |
| [02-state-machine.md](02-state-machine.md) | Պատվերի/առաջարկի վիճակներ (գեներացված կոդից) |
| [03-data-model.md](03-data-model.md) | Migration-ներ, աղյուսակներ, constraint-ներ |
| [04-dispatch-and-routing.md](04-dispatch-and-routing.md) | Թեկնածուներ, ranking, routing provider, push/realtime |
| [05-security-and-privacy.md](05-security-and-privacy.md) | Դերեր, rate limits, գաղտնիքներ, retention, դիտարկում, alerts |
| [06-mobile.md](06-mobile.md) | Հավելված, build/signing, real-device checklist |
| [11-driver-access.md](11-driver-access.md) | **Ով կարող է օգտվել հավելվածից**․ կայքի վարորդներ (ադմինը տալիս է հասանելիություն, նույն գաղտնաբառ) և միայն-հավելվածի վարորդներ (ինքնագրանցում + հաստատում), մեկ ցուցակ `/evakuator`-ում |
| [07-admin-console.md](07-admin-console.md) | Օպերատորի վահանակ |
| [08-testing.md](08-testing.md) | Թեստեր, արդյունքներ, ինչ չի ստուգվել |
| [09-rollout-and-rollback.md](09-rollout-and-rollback.md) | Staging, migration plan, backup, rollback, flags |
| [10-load-test-report.md](10-load-test-report.md) | Բեռնվածության թեստի իրական արդյունքներ |
| [openapi.json](openapi.json) | API պայմանագիր (OpenAPI 3.1), կոդի հետ համաժամեցված թեստով |

## Local development

```bash
docker compose -f docker-compose.dev.yml up -d          # PostGIS 16 + Redis 7 on 55432 / 56379
# No Docker? Postgres.app (bundles PostGIS) works; Redis is optional — see 01 § ADR-2
cd backend
cp .env.example .env    # DATABASE_URL → the postgis container; LIVE_DISPATCH_ENABLED=true; REDIS_URL=redis://127.0.0.1:56379
npx prisma migrate deploy && npx prisma generate
npm run start:dev       # API + WebSocket on 4002
npm run build && node dist/worker.js   # worker (separate terminal; or `npx ts-node src/worker.ts`)
npm run admin:create -- ops@local.test 'password1' DISPATCHER
cd ../frontend && npm run dev            # http://localhost:3002/admin/orders
cd ../mobile && npx expo run:android     # development build, EXPO_PUBLIC_API_BASE_URL=http://<LAN-IP>:4002/api/v1
```
