# Free Routes ("Ազատ երթուղիներ")

A driver heading somewhere empty (deadheading) posts a route so a customer
going the same way can find and contact them directly. The platform does not
mediate contact — the public card just shows the driver's info and links to
their profile/phone, same as everywhere else on the site.

## Data model

`FreeRoute` (see `docs/data-model.md` for the full model): belongs to one
`TowTruck`, has start/end region+city slugs (same slug convention as
everything else — no backend geography lookup), a `departureAt` timestamp, an
`estimatedArrivalAt` timestamp, optional free-text `description`, and a
`status: ACTIVE | FINISHED`.

**`estimatedArrivalAt` is the expiry deadline.** The public card shows a
range — "12:00–19:00" — not just a departure instant, and the route stays
findable for the whole trip, not just until the driver sets off: it is
considered live until the moment it's expected to arrive, then automatically
wound down. `estimatedArrivalAt` is required on every route created from the
point this field shipped; it must be strictly after `departureAt`
(`FreeRoutesService.parseEstimatedArrivalAt`). It is nullable in the schema
only for migration safety — a route posted before this column existed has
none — and every reader that keys off it (the cron, `update()`'s reactivation
check) falls back to `departureAt` for exactly that case. This replaced the
original design where `departureAt` alone was the deadline (a deliberate
product decision at the time); once a real arrival estimate existed, keeping
the old rule would have removed a route from the listing while the driver was
still mid-trip.

## Lifecycle (cron-driven state machine)

`FreeRoutesService.cleanupExpiredRoutes()`, `@Cron(CronExpression.EVERY_10_MINUTES)`:

```
ACTIVE  --[estimatedArrivalAt has passed*]-->  FINISHED  --[24h grace period]-->  hard deleted

* falls back to departureAt when estimatedArrivalAt is null (legacy rows)
```

1. `markExpiredAsFinished(now)` — bulk-flips any `ACTIVE` route whose
   `estimatedArrivalAt <= now` (or, when `estimatedArrivalAt IS NULL`,
   `departureAt <= now`) to `FINISHED`. Still visible in the driver's own
   dashboard (`GET /my/free-routes`) as history, but drops off the public
   listing immediately (public query only ever selects `ACTIVE`).
2. `deleteFinishedBefore(cutoff)` where `cutoff = now - 24h` — hard-deletes
   any `FINISHED` route whose effective deadline (same `estimatedArrivalAt`
   -first, `departureAt`-fallback field as step 1) is older than the grace
   period. This is a real `DELETE`, not a soft flag — the project owner was
   explicit that expired routes "must be fully removed from the DB so they
   don't waste space," not just hidden. Using `departureAt` unconditionally
   here would be wrong even for rows that do have an `estimatedArrivalAt`:
   the grace window would run from the wrong instant, or for a long trip
   could already be in the past the moment the route finishes.

Both steps run every 10 minutes via `@nestjs/schedule` (`ScheduleModule.forRoot()`
registered in `app.module.ts`). Manual deletion by the driver
(`DELETE /my/free-routes/:id`, `FreeRoutesService.remove()`) **skips the
grace period entirely** — it's an immediate hard delete, there's no reason to
keep a row around after the owner explicitly asked to remove it.

Editing a route (`PATCH /my/free-routes/:id`) reactivates `status: 'ACTIVE'`
even if the cron had already marked it `FINISHED` — the product framing is
"editing is re-posting" — **but only when the resulting `estimatedArrivalAt`
is still in the future.** If it isn't, the edit is rejected with a message
asking for a new date/time. Unlike `departureAt`, a `departureAt` in the past
is explicitly allowed on update — that's exactly the case the arrival range
exists for: a driver already en route editing their own still-active route.
`estimatedArrivalAt` is re-validated even when the request only touches
`departureAt`: pushing departure past an untouched, already-stored arrival is
rejected rather than silently stored as an arrival-before-departure route.

That deadline condition is not a nicety. Reactivating unconditionally (which
is what this did originally, against `departureAt`) republished a route whose
deadline had already passed, so it stayed publicly listed until the next cron
tick — and if the deadline was further back than the grace period, that same
tick flipped it to `FINISHED` and step 2 immediately hard-deleted it. A driver
fixing a typo in the description watched their route vanish.

## Endpoints

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| `GET` | `/api/v1/free-routes` | none | Public listing, `ACTIVE` only |
| `GET` | `/api/v1/my/free-routes` | driver JWT | Own routes, any status |
| `POST` | `/api/v1/my/free-routes` | driver JWT | Requires `isActive` truck (`assertActiveDriver`) |
| `PATCH` | `/api/v1/my/free-routes/:id` | driver JWT | `assertActiveDriver` + ownership (`getOwnedOrThrow`); reactivates status, rejected if the effective `departureAt` is in the past |
| `DELETE` | `/api/v1/my/free-routes/:id` | driver JWT | `assertActiveDriver` + ownership; immediate hard delete, no grace period |

All three write endpoints run `assertActiveDriver`, not just `POST`. A
deactivated profile is frozen everywhere else (`MyTowTruckService` re-checks
`isActive` on every call), and this module used to be the one exception —
a deactivated driver could still write to their rows behind a still-valid
30-day JWT. Nothing they wrote reached the public list (`findActive()` joins on
`towTruck.isActive`), but a rule enforced in three places and skipped in a
fourth is a rule that drifts.

`departureAt` is validated server-side (`FreeRoutesService.parseDepartureAt`)
to be a real ISO date **strictly in the future** on `create()` — rejects both
malformed dates and past/present timestamps (on `update()`, a past
`departureAt` is allowed — see above). `estimatedArrivalAt` is validated
server-side (`FreeRoutesService.parseEstimatedArrivalAt`) to be a real ISO
date **strictly after `departureAt`**, on both `create()` and `update()`.

## Admin notification

`FreeRoutesService.create()` fires `AdminNotificationService.notifyNewFreeRoute()`
(the same admin Telegram bot and pattern as the new-registration notice — see
`docs/auth-and-security.md` § "Admin 2FA — a second, dedicated Telegram bot")
right after a route is saved: every admin with a linked Telegram gets a
heads-up naming the driver, phone, the route's raw region/city slugs (no
geography resolution on the backend, same reasoning as the registration
notice) and both the departure and estimated-arrival time
(`armeniaDateTimeLabel()`, `backend/src/common/armenia-day.ts`), with a
button to the public `/free-routes` listing. **Only `create()` fires it** — `update()`'s
reactivate-on-edit path does not, so a driver fixing a typo doesn't re-page
every admin. Best-effort like every other admin notice: a Telegram failure
here must never fail the driver's request.

## Frontend

- `frontend/pages/free-routes/index.vue` — public listing
  (`useAsyncData` + `freeRoutesService.getActive()`), renders
  `FreeRouteCard.vue` per route (route path via
  `frontend/utils/freeRouteLocation.ts`'s `formatRouteLocation()`, which
  special-cases Yerevan since its "cities" are actually districts; departure
  range via `formatDepartureRange()` in `frontend/utils/formatters.ts` — falls
  back to the single-instant `formatDepartureAt()` when a route has no
  `estimatedArrivalAt`).
- `frontend/components/dashboard/FreeRoutesManager.vue` — driver's own
  create/edit/delete UI, embedded in `/dashboard`. Uses **two independent**
  `useLocationPicker()` instances (start and end), a `date` `AppInput` plus
  two `time` `AppInput`s (departure, arrival) combined via `buildDepartureAt()`
  and `frontend/utils/freeRouteArrival.ts`'s `buildEstimatedArrivalAt()`
  before submit. There is no separate arrival-date field — the arrival time
  is applied to the same date as departure, and rolls over to the next
  calendar day when the clock time is at or before departure (an overnight
  trip, not a rejected input).
- Mock mode: `frontend/mocks/freeRoutes.ts` has 3 fixture routes referencing
  real mock tow truck IDs and real static geography slugs — useful as a
  reference for the exact shape expected end-to-end.

## If you're extending this feature

- Any new lifecycle transition should go through the cron, not an ad-hoc
  endpoint — the existing pattern (bulk update, then bulk delete, both
  logged only when they actually changed something) keeps the job cheap to
  run every 10 minutes indefinitely.
- If you add a new required field, update `create-free-route.dto.ts` **and**
  `update-free-route.dto.ts` separately (they're not derived from each
  other) and update `frontend/types/freeRoute.ts` + the two repository files
  (`freeRoutes.repository.ts` public, `myFreeRoutes.repository.ts`
  authenticated) to match.
