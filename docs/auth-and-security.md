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
specific controller (`images`, `registration`, `reviews`, `driver-auth`)
rather than assuming the global limit is what applies; grep for `@Throttle`
to see current overrides.

## Things that are NOT implemented (don't assume otherwise)

- No refresh tokens for either auth system — both are long-lived JWTs
  (24h admin, 30d driver) with no rotation/refresh endpoint. Logout is purely
  client-side (`localStorage.removeItem`).
- No rate limiting keyed on anything other than raw IP (no per-account
  limiting beyond the driver-auth phone cooldown described above).
- No verification that the Telegram account tapping a link matches the
  `telegram` username entered at registration — see the linking section
  above, this is by design, not an oversight.
