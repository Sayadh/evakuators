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
| `/tow-trucks/[slug]` | `pages/tow-trucks/[slug].vue` | Single tow truck profile — gallery (click-to-open lightbox with swipe/arrow-key navigation between photos, see `TowTruckGallery.vue`), pricing, service areas, reviews (list + submission form), similar trucks, JSON-LD business schema. Also the only page that records analytics: a `PAGE_VIEW` in `onMounted` and contact clicks via `usePhoneActions` (see `docs/analytics.md`) | Mock or API; 404s (fatal `createError`) if slug not found | Public |
| `/free-routes` | `pages/free-routes/index.vue` | Public "Ազատ երթուղիներ" listing | Mock or API; only `ACTIVE` routes | Public |
| `/register` | `pages/register.vue` | Driver registration form (multi-section: identity, vehicle, capacity range, services by category, pricing, image upload) | Submits to `registrationRepository` (needs a real backend to actually persist — meaningless in pure mock mode beyond UI preview) | Public |
| `/login` | `pages/login.vue` | Driver login — phone number → Telegram OTP → JWT. Redirects to `/dashboard` if already logged in (client-side check) | Real API only (mock mode has no OTP flow) | Public (self-redirects once authenticated) |
| `/dashboard` | `pages/dashboard.vue` | Driver's own analytics (`AnalyticsDashboard scope="driver"`) + **full** own-profile editor — it mirrors the registration form field-for-field (name, company, contacts, vehicle facts, equipment, capacity band, platform dimensions, base location, service areas via the shared `ServiceAreaPicker`, description, services, hours, pricing, photos), with `slug` and the main `phone` shown read-only — plus `FreeRoutesManager` for the driver's own routes | Real API only | Driver JWT — redirects to `/login` if not authenticated (client-side check, `import.meta.client` guarded) |
| `/admin` | `pages/admin.vue` | Internal moderation panel — registration requests (approve/reject), pending reviews (approve/reject), tow truck list (activate/deactivate/delete, Telegram link management, expandable per-truck analytics via the same `AnalyticsDashboard` component with `scope="admin"`) | Real API only | Admin JWT; `noindex`, not linked from public nav, excluded from sitemap |
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
image) — `frontend/composables/useSeoMetaData.ts`. `og-image.png` and the whole
favicon set (`frontend/public/`) are built from the same truck artwork as the
header/footer logo (`evakuators-logo.svg`) — regenerate all of them together if
the mark ever changes, not just the header.

### The favicon set, and why the sizes are what they are

`favicon.svg` is the source of truth; every raster file is rendered from it
(cairosvg for the PNGs, then ImageMagick to pack the ICO):

| File | Size | Consumer |
| --- | --- | --- |
| `favicon.svg` | vector | modern browsers |
| `favicon.png` | 96×96 | **Google Search** |
| `favicon-192.png` | 192×192 | Android Chrome (no web manifest exists) |
| `apple-touch-icon.png` | 180×180 | iOS home screen |
| `favicon.ico` | 16+32+48 in one file | legacy, and blind `/favicon.ico` probes |

Two rules worth not breaking:

- **Google wants a multiple of 48px.** It renders the search-result icon at
  roughly 16px and downsizes itself, and its downscaler produces a better 16px
  than any 16px file we could ship. The set was 32×32-only for a while, which
  is below that recommendation and the most likely reason a stale icon kept
  appearing in search results long after the artwork changed.
- **`sizes` on every `<link>`.** Without it a consumer has to fetch each
  candidate to learn how big it is, and Google in particular then chooses
  unpredictably.

Note also that Google crawls favicons on its **own schedule**, separately from
pages — weeks, sometimes months — and there is no Search Console tool to force
it. Requesting indexing of the homepage is the only nudge available, so after
changing the artwork expect a long tail regardless of correctness.

The 16×16 entry inside the ICO is unavoidably muddy: the mark is detailed
line-art (crane, hook, cab, wheels) and that does not survive 16px, which was a
deliberate design choice made with that trade-off understood. Rendering it
directly from the vector at 16px was measured against downscaling a 192px
render with Lanczos — the direct render is crisper, which is why the pipeline
does that.

Structured
data (JSON-LD) is added via `useJsonLd()` on the homepage (`WebSite` schema)
and tow truck profile pages (`LocalBusiness`-style schema via
`buildTowTruckBusinessSchema()`). `frontend/utils/faqContent.ts` builds FAQ
Q&As (rendered via `FaqSection.vue`, with matching `FAQPage` JSON-LD) for the
homepage, `/regions`, and `/free-routes` — `buildHomeFaq()` /
`buildAllRegionsFaq()` / `buildFreeRoutesFaq()`. `frontend/server/routes/
sitemap.xml.ts` generates the sitemap dynamically — `/admin`, `/dashboard`,
`/login` are excluded (`noindex: true` set on those pages' `useSeoMetaData`
calls).

**Every other public route must be listed in that file, and the static ones are
listed by hand.** Region/city/district/tow-truck URLs are generated from
`frontend/data/*` and the API, so adding a city adds itself — but a new
top-level page does not. `/free-routes` shipped missing from the sitemap for
exactly that reason: it was indexable in every other respect (no `noindex`,
canonical set, `BreadcrumbList` + `FAQPage` JSON-LD emitted by
`AppBreadcrumbs.vue` / `FaqSection.vue`, linked from `NAV_LINKS` on every page,
SSR-rendered content) and still never announced to crawlers. If you add a page
under `pages/`, add it here too.
