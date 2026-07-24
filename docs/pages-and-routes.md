# Pages & routes

File-based routing (Nuxt 3) — path = file path under `frontend/pages/`.
"Data source" below means: does this page work in mock mode (no backend),
and what auth (if any) gates it.

| Route | File | Purpose | Data source | Auth |
| --- | --- | --- | --- | --- |
| `/` | `pages/index.vue` | Homepage — hero, popular locations, region picker, how-it-works, benefits, featured trucks | Mock or API | Public |
| `/regions` | `pages/regions/index.vue` | List of Armenia's 10 marzes + Yerevan entry | Static geography + truck counts | Public |
| `/regions/[region]` | `pages/regions/[region]/index.vue` | Cities within one marz | Static geography + truck counts | Public |
| `/regions/[region]/[city]` | `pages/regions/[region]/[city].vue` | Tow trucks serving one city | Mock or API | Public |
| `/yerevan` | `pages/yerevan/index.vue` | The 12 Yerevan districts (Yerevan is a pseudo-region — its "cities" are districts) | Static geography + truck counts | Public |
| `/yerevan/[district]` | `pages/yerevan/[district].vue` | Tow trucks serving one district | Mock or API | Public |
| `/tow-trucks/[slug]` | `pages/tow-trucks/[slug].vue` | Single tow truck profile — gallery, pricing, service areas, reviews, similar trucks, JSON-LD business schema | Mock or API; 404s (fatal `createError`) if slug not found | Public |
| `/free-routes` | `pages/free-routes/index.vue` | Public "Ազատ երթուղիներ" listing | Mock or API; only `ACTIVE` routes | Public |
| `/register` | `pages/register.vue` | Driver registration form (multi-section: identity, vehicle, capacity range, services by category, pricing, image upload) | Submits to `registrationRepository` (needs a real backend to actually persist — meaningless in pure mock mode beyond UI preview) | Public |
| `/login` | `pages/login.vue` | Driver login — phone number → Telegram OTP → JWT. Redirects to `/dashboard` if already logged in (client-side check) | Real API only (mock mode has no OTP flow) | Public (self-redirects once authenticated) |
| `/dashboard` | `pages/dashboard.vue` | Driver's own-profile editor (contact info, description, services, pricing) + embeds `FreeRoutesManager` for the driver's own routes | Real API only | Driver JWT — redirects to `/login` if not authenticated (client-side check, `import.meta.client` guarded) |
| `/admin` | `pages/admin.vue` | Internal moderation panel — registration requests (approve/reject), pending reviews (approve/reject), tow truck list (activate/deactivate/delete, Telegram link management) | Real API only | Admin JWT; `noindex`, not linked from public nav, excluded from sitemap |
| `/about` | `pages/about.vue` | Static "about us" content | Static | Public |
| `/contact` | `pages/contact.vue` | Static contact info | Static | Public |

`pages/error.vue` (actually `frontend/error.vue` at the app root, Nuxt
convention) handles uncaught errors / 404s app-wide.

## What "works" without a backend

Everything except `/register` (form submits nowhere useful), `/login` +
`/dashboard` (no OTP flow in mock mode), and `/admin` (nothing to moderate)
works purely on `frontend/mocks/towTrucks.ts` + `frontend/data/*`. This is
intentional — see `docs/architecture.md`'s mock/API switch section. If
someone reports "the whole site looks fine but registration/login/admin
don't work," the first question is whether `NUXT_PUBLIC_API_BASE_URL` is set
at all.

## Auth guards are client-side only (know this before assuming security)

The `/dashboard` and `/login` redirect checks
(`if (import.meta.client && !driverAuth.isLoggedIn) await navigateTo(...)`)
run **in the browser**, not as Nuxt server middleware. The actual security
boundary for driver/admin data is entirely on the backend
(`DriverJwtGuard`/`AdminJwtGuard` on the API routes) — these frontend checks
are UX conveniences (don't show an empty/broken dashboard to a logged-out
visitor), not access control. Don't treat a missing client-side redirect as a
security bug in itself; check whether the underlying API call is actually
guarded.

## SEO

Every public page calls `useSeoMetaData()` (title/description/canonical/OG
image) — `frontend/composables/useSeoMetaData.ts`. Structured data
(JSON-LD) is added via `useJsonLd()` on the homepage (`WebSite` schema) and
tow truck profile pages (`LocalBusiness`-style schema via
`buildTowTruckBusinessSchema()`). `frontend/server/routes/sitemap.xml.ts`
generates the sitemap dynamically — `/admin`, `/dashboard`, `/login` are
excluded (`noindex: true` set on those pages' `useSeoMetaData` calls).
