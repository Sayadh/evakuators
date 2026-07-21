# Evakuators.am

Հայաստանի էվակուատորների որոնման հարթակի frontend՝ Nuxt 3 + TypeScript + Pinia + SCSS։

⚠️ Բոլոր տվյալները (անուններ, հեռախոսահամարներ, գներ, նկարներ) ցուցադրական են (mock/demo)։

## Գործարկում

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production build
npm run lint     # ESLint
npm run format   # Prettier
```

## Կառուցվածք

```
/assets/styles   SCSS design tokens (CSS variables, 4px spacing system)
/components      layout · common · location · tow-truck · filters · home · seo
/composables     useRegions, useTowTrucks, useTowTruckFilters, useSeoMetaData …
/constants       labels, nav, sort options, site config
/data            ՍՏԱՏԻԿ տվյալներ՝ regions, cities, districts (մշտական, API-ից ՉԻ գալու)
/layouts         default layout (header + main + footer)
/mocks           API-ով փոխարինվող demo տվյալներ՝ towTrucks
/pages           /, /regions, /regions/[region]/[city], /yerevan/[district], /tow-trucks/[slug], /register …
/plugins         localStorage-backed stores init
/repositories    API layer (apiClient + towTruck/registration/image repositories)
/services        service layer (regions, cities, districts, towTrucks)
/stores          Pinia: towTruckFilters, recentlyViewed, location
/types           interfaces + enums
/utils           formatters, validators, route helpers, schema.org builders, analytics
```

## Տվյալների ճարտարապետություն

Երկու շերտ՝

1. **`/data` — ստատիկ, կայուն**․ Հայաստանի մարզերը, քաղաքները և Երևանի շրջանները։
   Երբեք API-ից չեն գալու, մնում են frontend-ում որպես source of truth։
2. **`/mocks` — API-ով փոխարինվող**․ էվակուատորներ (`towTrucks`)։
   Գրանցումներն ու պրոֆիլները գալու են backend-ից։

## Backend-ի միացում

UI-ն կապված չէ mock ֆայլերին. ամեն ինչ անցնում է `services/*.service.ts` շերտով, որն էլ
HTTP հարցումների համար օգտագործում է `repositories/` API շերտը (NestJS backend)։

- `NUXT_PUBLIC_API_BASE` դատարկ է → mock ռեժիմ (`/mocks`), backend պետք չէ
- `NUXT_PUBLIC_API_BASE=https://api.evakuators.am` → բոլոր տվյալները գալիս են API-ից,
  գրանցման ձևը նկարներով submit է անում backend

`regions/cities/districts` service-ները միշտ կարդում են `/data`-ից․ միայն
`towTruckCount` վիճակագրությունն է հաշվվում tow truck տվյալներից։

Նույն սկզբունքով՝
- `utils/analytics.ts` — console log → Google Analytics/Matomo
