# Auth & security

Two completely independent auth systems, deliberately using **separate JWT
secrets** (`ADMIN_JWT_SECRET` vs `DRIVER_JWT_SECRET`) so compromising one
token type can't be used to forge the other.

## Admin auth

Classic email/password → JWT. `User` model, `role: ADMIN` (the only role that
exists). No self-registration — accounts are created by running
`npm run admin:create -- <email> <password>` on the server (upserts by
email, so it doubles as "reset password").

Flow: `POST /api/v1/admin-auth/login` (`AdminAuthService.login`) → bcrypt
compares against `User.passwordHash` → signs a JWT (`{ sub, role }`, 24h TTL,
secret = `ADMIN_JWT_SECRET`) → frontend stores it in `localStorage`
(`frontend/stores/adminAuth.ts`) and attaches it as `Authorization: Bearer`
on every `/admin/*` call.

Timing-attack mitigation worth knowing about: when the email doesn't match
any user, `login()` still runs `bcrypt.compare()` against a hardcoded dummy
hash (`DUMMY_HASH` in `admin-auth.service.ts`) before rejecting — otherwise
"unknown email" would respond measurably faster than "wrong password",
letting an attacker enumerate valid admin emails by timing alone.

`AdminJwtGuard` validates the token on **every** `/admin/*` request,
independent of nginx — so the guard is the real security boundary even if
nginx config changes or the app is accessed via an unexpected path.

### Admin 2FA — a second, dedicated Telegram bot

`POST /admin-auth/login` no longer always returns a token. Once an admin has
linked Telegram (see below), password success returns `{ requiresCode: true }`
instead, and the frontend must call `POST /admin-auth/verify-code` with the
6-digit code sent to that admin's Telegram before a JWT is issued
(`AdminAuthService.verifyCode`, mirrors the driver OTP logic almost exactly:
`AdminOtp` model, 5-minute TTL, 5 max attempts, `timingSafeEqual` compare).

This uses a **separate bot** from the driver-facing one
(`ADMIN_TELEGRAM_BOT_TOKEN` / `_BOT_USERNAME` / `_WEBHOOK_SECRET`, all
independent from the `TELEGRAM_*` driver bot vars) — see
`AdminTelegramService`, `AdminTelegramWebhookController`
(`POST /admin-telegram/webhook`). Fully optional: if unconfigured,
`AdminTelegramService.isConfigured` is `false`, `sendMessage()` is a no-op,
and login stays single-factor exactly like before this feature existed.

Linking an admin's Telegram (equivalent of the driver's approval-time
link-generation, but manual since there's no admin-of-the-admin UI):

```bash
npm run admin:telegram-link -- admin@evakuators.am
```

prints a one-time `t.me/<bot>?start=<token>` link (7-day expiry, same
token/expiry/unique-constraint-safe-linking pattern as
`TowTrucksRepository.linkTelegramChat` — see
`AdminUserRepository.linkTelegramChat`). The admin taps it, the webhook links
`User.telegramChatId`, and from that login onward `requiresCode` is always
`true` for that account. A freshly `admin:create`-d account that hasn't
linked yet is deliberately never locked out — 2FA only turns on once linked.

`ADMIN_TELEGRAM_ALLOWED_CHAT_IDS` (comma-separated numeric chat ids) locks the
bot down further: `AdminTelegramWebhookController` checks it before anything
else, even before parsing `/start` or touching the DB — a disallowed chat
gets no reaction whatsoever (no reply, just a server-side log line), so it
can't even confirm the bot exists or does anything. This means a leaked or
guessed link token from `admin:telegram-link` is still useless to anyone
whose chat id isn't on the list. Empty (default) = unrestricted, so this is
opt-in hardening on top of the token, not a replacement for it.

The same bot also fires a best-effort notification
(`AdminNotificationService.notifyNewRegistration`, called from
`RegistrationService.submit`) to every linked admin whenever a new
registration request comes in — name, phone, vehicle, and a button back to
`/admin`. No geography in the message (backend has none — see CLAUDE.md);
open the panel for full details. A Telegram failure here is logged and
swallowed, it never fails the registration submission itself.

## Driver auth — Telegram OTP

This is the more involved one. Two separate steps happen at very different
times:

### Step 0 (once, at approval time): linking Telegram

Telegram's Bot API gives no way to message a user who hasn't first messaged
the bot. So a driver's `telegramChatId` starts `null` and can only be
populated by the driver tapping a one-time deep link
(`t.me/<bot>?start=<token>`).

- `AdminService.generateTelegramLink(towTruckId)` creates a random 48-hex-char
  token, stores it + a 7-day expiry on the `TowTruck` row
  (`telegramLinkToken`, `telegramLinkTokenExpiresAt`), returns the `t.me` URL.
  Called automatically right after approving a registration, and again
  on-demand from `/admin`'s "resend / change Telegram" button
  (`POST /admin/tow-trucks/:id/telegram-link` — same function both times,
  it always overwrites whatever token/chat was there before).
- Admin copies that link and sends it to the driver out-of-band (Telegram/
  WhatsApp/SMS to the phone number given at registration). **The link itself
  is the entire security boundary** — Telegram gives no way to verify the
  tapping account matches any identity claimed at registration, so possession
  of the link is what "authorizes" the link. See `docs/local-development.md`
  for why this also means the link only works against whichever backend the
  bot's webhook currently points to.
- Driver taps it → Telegram sends `/start <token>` to
  `POST /api/v1/telegram/webhook` (`TelegramWebhookController.handleStart`) →
  looks up the `TowTruck` by token (must match AND not be expired) → if found,
  `TowTrucksRepository.linkTelegramChat()` sets `telegramChatId` and clears
  the token fields (one-time use). This **unconditionally overwrites**
  whatever `telegramChatId` was already on the row — which is exactly how
  "change Telegram account" works: generate a fresh link, have the driver tap
  it with the new account, old one is silently replaced with no separate
  unlink step.
- Webhook auth: Telegram echoes back a secret token
  (`TELEGRAM_WEBHOOK_SECRET`) in the `X-Telegram-Bot-Api-Secret-Token` header
  on every call, set once via `setWebhook`'s `secret_token` param (see
  `docs/deployment.md`). Compared with `timingSafeEqual`, not `!==`.

### Step 1/2 (every login): phone → OTP → JWT

- `POST /api/v1/driver-auth/request-code` (`DriverAuthService.requestCode`):
  looks up `TowTruck` by phone, requires `telegramChatId` to already be set
  (else "Telegram not linked yet" error), enforces a 45s per-phone cooldown
  (in-memory `Map`, resets on process restart — fine for a single instance,
  would need Redis if ever scaled horizontally), **invalidates any still-open
  OTP** for that truck (`DriverOtpRepository.invalidateActive` — added
  specifically because a driver re-reading an older Telegram message and
  entering a technically-still-valid older code was landing in a confusing
  state), generates a 6-digit code, stores `sha256(code + DRIVER_JWT_SECRET)`
  (never the raw code) with a 5-minute expiry, sends it via
  `TelegramService.sendMessage()` with an inline "Login" button linking to
  `FRONTEND_URL/login`.
- `POST /api/v1/driver-auth/verify-code` (`DriverAuthService.verifyCode`):
  looks up the truck's currently-active OTP, rejects if none (expired/
  consumed), rejects after 5 failed `attempts` on that OTP (auto-consumes it
  at that point so a 6th guess isn't even checked), compares hashes with
  `timingSafeEqual`, and on success issues a 30-day JWT (`{ sub: towTruckId }`,
  secret = `DRIVER_JWT_SECRET`).
- Frontend stores the session in `localStorage`
  (`frontend/stores/driverAuth.ts`) and attaches
  `Authorization: Bearer <token>` on every `/my/*` call.
- `MyTowTruckService` re-checks `isActive` on **every** call, not just at
  login — a 30-day token from a driver who gets deactivated mid-lifetime
  stops working immediately, it doesn't just "eventually" get invalidated.
- **Any 401 auto-logs out**, for both sessions. `apiFetch`
  (`frontend/repositories/apiClient.ts`) is the single chokepoint every
  repository calls through, so it's the one place watching for a 401 rather
  than each page catching it separately: a 401 on a `/my/*` path clears
  `driverAuth` and redirects to `/login`; a 401 on `/admin/*` clears
  `adminAuth` and redirects to `/admin` (the login form and the panel are the
  same route, gated on `adminAuth.isLoggedIn`). The path prefix is what tells
  the two sessions apart — `apiFetch` has no other way to know which store
  issued a given call. This deliberately does not fire for the login calls
  themselves (`/admin-auth/*`, `/driver-auth/*`) — a wrong password/code there
  is a normal 401 with its own message, not an expired session.

### The driver bot carries login codes AND marketing notices

The same bot that delivers OTP codes also sends the "someone just took your
number" contact notices (`DriverNotificationService`, see `docs/analytics.md`),
and those notices have **no opt-out** — every linked driver receives them.

That coupling is an accepted operational risk, not an oversight: a driver who
finds the notices noisy and **mutes or blocks the bot loses the ability to log
in**, with nothing on screen to explain why — the login page just keeps saying
a code was sent. The single mitigation is the link-confirmation message
(`TelegramWebhookController.handleStart`), which names both kinds of message
and warns explicitly not to block the bot.

Two consequences to keep in mind:

- **When triaging "I never get my login code", check whether that chat has
  blocked the bot before touching the OTP code path.** The two failures are
  indistinguishable from the driver's side and nearly so from ours — a blocked
  chat just makes `sendMessage` fail, which `DriverAuthService` currently
  surfaces as a generic error.
- **Anything new added to this bot raises the same risk.** The more reasons a
  driver has to silence it, the more likely a self-inflicted login outage
  becomes. A third message type should come with a real justification, or with
  the opt-out this one deliberately doesn't have.

### The Telegram bot's webhook is singular — this bites people

A Telegram bot has exactly one webhook URL, registered globally via
`setWebhook`. In this project it's normally pointed at
`https://api.evakuators.am/api/v1/telegram/webhook`. If you generate a
Telegram link from a **local** admin panel while the webhook still points at
**production**, the driver's `/start` tap goes to production, which looks the
token up in the production database and won't find it (it only exists
locally) → "link is invalid or expired," even though the link was just
generated correctly. This is not a token bug — see
`docs/local-development.md` for the actual fix (a second test bot + tunnel).

## Throttling

Global default (`ThrottlerModule.forRoot`, `app.module.ts`): 60 requests /
60 seconds per IP. Endpoints prone to abuse override with a stricter
`@Throttle()` decorator directly on the controller method — check the
specific controller (`images`, `registration`, `reviews`, `driver-auth`,
`analytics`) rather than assuming the global limit is what applies; grep for
`@Throttle` to see current overrides.

**"Per IP" depends entirely on `app.set('trust proxy', 1)` in `main.ts` — do not
remove it.** `ThrottlerGuard` keys its buckets on `req.ip`, and behind nginx
Express reports `127.0.0.1` for everyone unless it is told to trust
`X-Forwarded-For`. Before that line existed, every limit in the app was one
global cap shared by the whole internet: five failed logins from one client
returned 429 to the next login attempt from a different IP, which made a
one-line denial of service against login/registration/upload/tracking possible.
Verified both directions — a forged `X-Forwarded-For` does not move the bucket
(nginx appends the real address to the right of the chain, and `1` means "trust
one hop"), and two genuinely different clients get separate buckets. See
`docs/deployment.md` § "Why the API binds loopback".

Also note `HOST` now defaults to `127.0.0.1`: with the API previously listening
on `*:4002`, a client could skip nginx entirely and hit the app with no
`X-Forwarded-For` at all.

### SSR is exempt — `SsrAwareThrottlerGuard`

The global guard is `SsrAwareThrottlerGuard`
(`backend/src/common/ssr-aware-throttler.guard.ts`), not the stock
`ThrottlerGuard`: it skips throttling entirely when `req.ip` is loopback.

This is not a loosening for convenience, it fixes a self-inflicted outage.
Server-side rendering fetches are made by the **Nuxt process**, not by the
visitor, so they all reach the backend from one address and shared a single
60/min bucket. A page render costs 2-3 API calls, so the site began returning
429 to its own renderer at roughly 20-30 page views per minute — site-wide,
regardless of how many distinct visitors were browsing.

Matching on loopback is safe precisely because of the two rules above: the API
binds `127.0.0.1`, so only a process on the same machine can present a loopback
peer address, and public traffic always comes through nginx, where
`trust proxy 1` resolves `req.ip` to the real client and ignores a forged
`X-Forwarded-For: 127.0.0.1`.

For this to apply, the frontend must call the backend over loopback during SSR —
that is what `NUXT_INTERNAL_API_BASE_URL` (`ecosystem.config.js`) is for. Going
out through the public hostname would present the server's *public* address,
which is not loopback, and put every rendered page back in the shared bucket.
Browser-originated requests are unaffected and still throttled per client IP.

## Things that are NOT implemented (don't assume otherwise)

- No refresh tokens for either auth system — both are long-lived JWTs
  (24h admin, 30d driver) with no rotation/refresh endpoint. Logout is purely
  client-side (`localStorage.removeItem`).
- No rate limiting keyed on anything other than client IP (no per-account
  limiting beyond the driver-auth phone cooldown described above). The IP is
  resolved from `X-Forwarded-For` — see the Throttling section.
- Throttle counters live in memory, so they reset on every deploy/restart and
  would not be shared if the app were ever run as more than one PM2 instance
  (that needs a Redis storage adapter).
- No verification that the Telegram account tapping a link matches the
  `telegram` username entered at registration — see the linking section
  above, this is by design, not an oversight.
