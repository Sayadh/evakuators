# Live dispatch — 07. Ադմինի վահանակ (`/admin/orders`)

| Էջ | Ինչ կա |
| --- | --- |
| `/admin/orders` | Պատվերների ցուցակ (tabs՝ ակտիվ / ուշադրություն / փակված / բոլորը, որոնում, cursor pagination), alerts (ack), նոր պատվերի ձև, վարորդների քարտեզ + ցուցակ (availability, GPS age, accuracy) |
| `/admin/orders/:id` | Մանրամասներ, առաջարկի countdown, նշանակված վարորդ, գործողություններ, քարտեզ pickup-ով, առաջարկների պատմություն, թեկնածուներ (road vs straight-line՝ առանձին), audit timeline |
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
