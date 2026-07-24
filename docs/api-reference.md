# API reference

Base: `https://api.evakuators.am/api/v1` (prod) or `http://localhost:4002/api/v1`
(dev). Every route is under the global `/api/v1` prefix (`main.ts`).

Throttle column shows overrides from the global default (60 req/60s per IP,
`app.module.ts`). "—" means the global default applies.

## Public

| Method | Path | Throttle | Notes |
| --- | --- | --- | --- |
| `GET` | `/health` | — | `{ status, database: 'up'|'down', timestamp }` — checks DB with `SELECT 1` |
| `GET` | `/tow-trucks` | — | Query: `city`, `district`, `region` (+`regionCities`), `yerevan`, `limit` |
| `GET` | `/tow-trucks/:slug` | — | 404 if not found or `isActive: false` |
| `GET` | `/tow-trucks/:towTruckId/reviews` | — | Approved reviews only |
| `POST` | `/tow-trucks/:towTruckId/reviews` | 5/60s | Creates with `isApproved: false` — needs admin approval to appear |
| `POST` | `/images` | 10/60s | Multipart, field name `file`, 10MB max (`MAX_UPLOAD_BYTES`, kept in sync by hand with the same-named constant in `image-processor.service.ts`) → returns `{ id, url, width, height }`, unattached until a registration references its id |
| `POST` | `/registrations` | 5/60s | Driver registration submission — `imageIds` must reference images uploaded via `/images` and not already attached elsewhere |
| `GET` | `/free-routes` | — | `ACTIVE` only |
| `POST` | `/admin-auth/login` | 5/60s | `{ email, password }` → `{ token }`, 24h TTL |
| `POST` | `/driver-auth/request-code` | 5/60s (+45s per-phone cooldown enforced in-service) | `{ phone }` → sends Telegram OTP, requires `telegramChatId` already linked |
| `POST` | `/driver-auth/verify-code` | 10/60s | `{ phone, code }` → `{ token, towTruckId, slug }`, 30-day TTL |
| `POST` | `/telegram/webhook` | — | Internal — Telegram calls this, validated via `X-Telegram-Bot-Api-Secret-Token` header (`timingSafeEqual` against `TELEGRAM_WEBHOOK_SECRET`), not meant to be called directly |

## Driver-authenticated (`Authorization: Bearer <driver JWT>`, `DriverJwtGuard`)

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/my/tow-truck` | Own profile; throws if `isActive: false` even with a valid token |
| `PATCH` | `/my/tow-truck` | Partial update; `works24Hours` auto-recomputed if `services` is included |
| `GET` | `/my/free-routes` | Own routes, any status |
| `POST` | `/my/free-routes` | Requires `isActive` profile |
| `PATCH` | `/my/free-routes/:id` | Ownership-checked; force-reactivates to `ACTIVE` |
| `DELETE` | `/my/free-routes/:id` | Immediate hard delete, no grace period |

## Admin-authenticated (`Authorization: Bearer <admin JWT>`, `AdminJwtGuard`)

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/admin/registration-requests` | Query: `?status=PENDING\|APPROVED\|REJECTED` |
| `POST` | `/admin/registration-requests/:id/approve` | Body: `ApproveRegistrationDto` (see `docs/data-model.md`'s `TowTruck` section for what the admin frontend fills in vs. what carries over from the request) → creates `TowTruck`, returns `{ towTruckId, telegramLinkUrl }` |
| `POST` | `/admin/registration-requests/:id/reject` | |
| `GET` | `/admin/reviews` | Pending (`isApproved: false`) only |
| `POST` | `/admin/reviews/:id/approve` | |
| `POST` | `/admin/reviews/:id/reject` | Deletes the review row outright |
| `GET` | `/admin/tow-trucks` | Every truck, active or not (unlike the public `/tow-trucks` list) |
| `PATCH` | `/admin/tow-trucks/:id/active` | Body: `{ isActive: boolean }` — reversible |
| `DELETE` | `/admin/tow-trucks/:id` | Irreversible — cascades to images (DB row + Supabase Storage object), reviews, OTPs, free routes |
| `POST` | `/admin/tow-trucks/:id/telegram-link` | (Re)generates the Telegram link — same underlying call whether the truck has never linked or is switching accounts |

## Response shape conventions

- List endpoints return bare arrays, not `{ data: [...] }` wrappers.
- Mutation endpoints that "create" something return the created/updated
  resource's shape (or a minimal `{ id, ...changedFields }` for
  status-flip-style actions) — check the specific controller method's return
  type rather than assuming a blanket convention.
- Validation errors (`class-validator` failures) come back as NestJS's
  default 400 shape (`{ statusCode, message: string[], error }`) — the
  frontend's `apiFetch()` wrapper doesn't do anything special with this, it's
  handled ad hoc at each call site via `FetchError` (see `frontend/pages/
  login.vue`'s `extractErrorMessage()` for a typical pattern).
