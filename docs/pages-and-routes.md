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
| `/evakuator` | `pages/evakuator.vue` | "Գտնել մոտակա էվակուատորները" — one-shot browser geolocation, then the nearest drivers with a road distance and a driving estimate. **Nothing happens until the button is pressed**: no geolocation on mount, no SSR fetch, no `useAsyncData`, because a permission prompt that appears because a page loaded is one the visitor did not ask for. Results render through the ordinary `TowTruckCard`, so the call button and its analytics are unchanged. The search is gated by `NEAREST_SEARCH_ENABLED` (`constants/features.ts`), currently off — the button then reports that the feature is being worked on and never prompts for a position. The nav link, the CTA banners and the sitemap entry deliberately stay up regardless: they are how visitors learn it is coming, so the page reads as an announcement rather than an error. See `docs/nearest-search.md` | Real API only (mock mode says so instead of prompting) | Public |
| `/manipulator` | `pages/manipulator.vue` | Every «Մանիպուլյատորով էվակուատոր» in the country — heading, cards, "show more", and deliberately nothing else. Both vehicle-type pages are thin files rendering `VehicleTypeListing` from a `VEHICLE_TYPE_PAGES` entry — see § "Vehicle-type landing pages" | Mock or API | Public |
| `/tsanr-tehnika` | `pages/tsanr-tehnika.vue` | Every «Ծանր տեխնիկայի էվակուատոր» in the country, same shape | Mock or API | Public |
| `/free-routes` | `pages/free-routes/index.vue` | Public "Ազատ երթուղիներ" listing | Mock or API; only `ACTIVE` routes | Public |
| `/register` | `pages/register.vue` | Driver registration form (multi-section: identity, vehicle, capacity range, services by category, **base parking coordinates**, pricing, image upload). The coordinates section is its own fieldset rather than part of "Տարածքներ" — service areas are where a driver is willing to *go*, the coordinates are where they *are*, and the two answers get confused under one heading. It is also the only **optional** section: copying a coordinate out of Google Maps on a phone is the step most likely to end a registration, and the value is editable from the dashboard the moment the driver is approved. A typed value must still parse; an empty box submits | Submits to `registrationRepository` (needs a real backend to actually persist — meaningless in pure mock mode beyond UI preview) | Public |
| `/login` | `pages/login.vue` | Driver login — phone + password in one form → JWT. No self-service reset, deliberately (the only channel is Telegram, which proves possession of a link rather than identity — see `docs/auth-and-security.md`), so the footnote points a locked-out driver at an admin instead. Redirects to `/dashboard` if already logged in (`driver-guest` route middleware, client-only) | Real API only (mock mode has no accounts) | Public (self-redirects once authenticated) |
| `/dashboard` | `pages/dashboard.vue` | Driver's own analytics (`AnalyticsDashboard scope="driver"`) + **full** own-profile editor — it mirrors the registration form field-for-field (name, company, contacts, vehicle facts, equipment, capacity band, platform dimensions, base location, service areas via the shared `ServiceAreaPicker`, description, services, hours, pricing, photos), with `slug` and the main `phone` shown read-only — plus a **Տեղադիրք** block (base parking coordinates, edited in a dialog that saves through its own `PATCH /my/tow-truck/coordinates` — deliberately outside the profile form, so fixing a price never resubmits the coordinates and an invalid coordinate never blocks an unrelated save) and `FreeRoutesManager` for the driver's own routes, plus a collapsed **Գաղտնաբառ** section (`ChangePasswordForm`). When the session carries `mustChangePassword`, that same form is rendered **instead of** the whole dashboard rather than over it — a driver still holding the generated password has exactly one thing to do here, and a blocking screen has nothing behind it to tab into and no dialog to dismiss | Real API only | Driver JWT — redirects to `/login` if not authenticated (`driver-auth` route middleware, client-only) |
| `/admin` | `pages/admin.vue` | Internal moderation panel — registration requests (approve/reject), pending reviews (approve/reject), tow truck list (activate/deactivate/delete, Telegram link management, base parking coordinates via the same `CoordinatesDialog` the driver gets — with the Google Maps steps switched off — expandable per-truck analytics via the same `AnalyticsDashboard` component with `scope="admin"`). The "Էվակուատորներ" section header shows the total/active/inactive counts from `GET /admin/tow-trucks/count`, refetched after any action that changes them (approve, delete, activate/deactivate) — independent of the paginated list itself, see `docs/api-reference.md` — and an "Ուղարկել գաղտնաբառեր" button opening a picker of the drivers who linked Telegram but have no password yet — checkboxes, nothing pre-ticked, sends only to the ticked ones (see `docs/auth-and-security.md` for why the selection is the safety mechanism rather than a convenience) | Real API only | Admin JWT; `noindex`, not linked from public nav, excluded from sitemap |
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

The `/dashboard` and `/login` redirects are **route middleware**
(`frontend/middleware/driver-auth.ts`, `driver-guest.ts`) that decide nothing
on the server — the session lives in `localStorage`, so the server genuinely
cannot know. The actual security boundary for driver/admin data is entirely on
the backend (`DriverJwtGuard`/`AdminJwtGuard` on the API routes); these
frontend checks are UX conveniences (don't show an empty/broken dashboard to a
logged-out visitor), not access control. Don't treat a missing client-side
redirect as a security bug in itself; check whether the underlying API call is
actually guarded.

They must stay middleware. The same checks used to sit in each page's
`setup()`, where `navigateTo` can silently return without navigating — a login
that stored the session and then went nowhere until the page was reloaded by
hand. See `docs/auth-and-security.md` § "The redirects are route middleware"
for the mechanism.

## Vehicle-type landing pages

`/manipulator` and `/tsanr-tehnika` answer "what do you need" rather than
"where are you": a crane, or something that can carry a bus. Geography cannot
answer either, and they are what someone with an unusual vehicle arrives
searching for — so they took the header slots that `/regions` and `/yerevan`
used to hold.

**They show the drivers and nothing else.** No filter sidebar, no sort control,
no active-filter chips, no "find the nearest" banner, no prose, no FAQ — a
breadcrumb, an `<h1>`, the cards and a "show more" button. Someone who lands
here has already said what they need: the URL *is* the filter, and every
control on top of it is one more thing between them and a phone number. The
city pages keep all of it because "everyone who covers this town" is a set
worth narrowing; "every manipulator in the country" is already the answer.

Two consequences worth knowing. The meta description is the whole of what a
search result shows under the title, since there is no on-page prose to fall
back on — so it has to stand alone. And with no `v-if="isDesktop"` child and no
grid, these pages sidestep the SSR auto-placement trap the city pages pin
around (`docs/architecture.md`); if a sidebar ever returns here, that rule
returns with it. `frontend/tests/vehicleTypePages.spec.ts` asserts the page
stays bare, because the way this regresses is someone copying the city page.

**Everything about both pages is one object.** `frontend/constants/vehicleTypePages.ts`
holds the slug, the `VehicleType`, the nav label, the heading and the metadata;
the header nav, the sitemap and the breadcrumb all read that same list. A page that is in the nav but missing from the sitemap is
the failure this shape prevents — `/free-routes` was exactly that once.
`frontend/tests/vehicleTypePages.spec.ts` asserts the derivation holds, that
each slug has a page file, and that both geography hubs kept a link.

**Adding a third** means an entry in that file plus a `pages/<slug>.vue` that
renders `VehicleTypeListing`. Nothing else. The page files are thin because
Nuxt routes by filename and the slugs are unrelated words — a single dynamic
route would have to sit at the root and would swallow every other top-level URL.

**Only these two, deliberately.** `flatbed` is most of the fleet, so its page
would be the tow-truck listing with extra steps, and `sliding-platform` is a
detail of how a flatbed loads rather than something people search for.

**Backend.** One query parameter on the existing listing endpoint —
`GET /tow-trucks?vehicleType=…` — not a route of its own, for the same reason
`city`, `district`, `region` and `zone` are parameters: this is the card list,
narrowed. A second endpoint would be a second place for the card shape, the
rating join and the row cap to drift. Two things about it are easy to get
wrong:

- it **narrows** the geography clause and must never be pushed into its `OR`,
  or "manipulators in Kotayk" becomes "everything in Kotayk or every
  manipulator in the country";
- `manipulator` is a **union**, not an equality — see `docs/taxonomies.md`
  § "«Մանիպուլյատոր» is asked twice".

Both are covered by `backend/test/vehicle-type-filter.spec.ts`.

**`/regions` and `/yerevan` were not orphaned.** The footer lists every marz
and every district on every page, and its two column *headings* now link the
hubs themselves. Both keep their sitemap entries.

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
data (JSON-LD) is added via `useJsonLd()` on the homepage (single `Organization`
+ `WebSite` `@graph`, see "Brand identity surfaces" below) and tow truck profile
pages (`AutomotiveBusiness`-style schema via `buildTowTruckBusinessSchema()`).
`frontend/utils/faqContent.ts` builds FAQ
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

## Brand identity surfaces

The site's name is `Evakuators.am`, spelled that way everywhere. A singular
`.am` domain one letter away belongs to somebody else, and the failure mode of
getting this wrong is silent — nothing breaks, a search engine or an AI
assistant simply attributes the wrong entity.

`SITE_NAME` in `frontend/constants/site.ts` is the only place the string is
written; every surface below derives from it, and
`frontend/tests/brandIdentity.spec.ts` asserts both the derivation and that the
singular spelling appears **nowhere** in the project — including in a comment
explaining why it must not appear. That absolute rule is what makes the check
trustworthy; an exception list would be the first thing a future edit slips
through.

| Surface | Where |
| --- | --- |
| `<title>`, `og:site_name`, canonical | `composables/useSeoMetaData.ts` (every page) |
| `application-name`, `apple-mobile-web-app-title` | `nuxt.config.ts` — hard-coded, since the config is evaluated outside the app's module graph and cannot import `~`; the test pins it against `SITE_NAME` |
| PWA manifest `name` / `short_name` | `public/site.webmanifest` |
| `Organization` + `WebSite` JSON-LD | `utils/schemaOrg.ts` → `buildSiteIdentitySchema()` |
| Logo `alt` | `AppHeader.vue`, `AppFooter.vue` |
| Footer copyright | `AppFooter.vue` |

Three decisions worth not undoing:

- **The homepage title and `<h1>` lead with the brand; every other page leads
  with the service keyword.** The homepage is what a crawler reads to answer
  "what is this site", so it answers in the exact words we want quoted back
  (`SITE_TAGLINE`). Location pages exist to match «էվակուատոր <city>» and are
  built the other way round. Brand is `Evakuators.am`; service is «էվակուատոր»;
  neither replaces the other.
- **One `@graph`, not two scripts.** `Organization` and `WebSite` were separate
  `<script>` blocks that cross-referenced by `@id`. Both were valid, but a
  consumer reading only the first — several do — saw half the identity. They
  now arrive together or not at all, and only the homepage emits them (never
  `/tow-trucks/[slug]`, where the subject is the driver's own business).
- **`display: "browser"` in the manifest.** The manifest exists to declare a
  name to Android Chrome, which otherwise derives one from whichever `<title>`
  happened to be open. It deliberately does not make the site an installable
  standalone app — that would change how it opens for anyone who added it to a
  home screen, which is a product decision, not a metadata one.

Host canonicalisation is nginx's half of the same job: `nginx/evakuators.am.conf`
301s http-apex, http-www and https-www to `https://evakuators.am`, so the
canonical tags the app emits describe an address that is actually the only one
serving content.
