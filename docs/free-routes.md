# Free Routes ("Ազատ երթուղիներ")

A driver heading somewhere empty (deadheading) posts a route so a customer
going the same way can find and contact them directly. The platform does not
mediate contact — the public card just shows the driver's info and links to
their profile/phone, same as everywhere else on the site.

## Data model

`FreeRoute` (see `docs/data-model.md` for the full model): belongs to one
`TowTruck`, has start/end region+city slugs (same slug convention as
everything else — no backend geography lookup), a `departureAt` timestamp,
optional free-text `description`, and a `status: ACTIVE | FINISHED`.

**`departureAt` doubles as the expiry deadline.** There is no separate
"expires at" field — the route is considered live until the moment of
departure, then automatically wound down. This was a deliberate product
decision (confirmed with the project owner): expiry = exact departure
datetime, not some earlier cutoff.

## Lifecycle (cron-driven state machine)

`FreeRoutesService.cleanupExpiredRoutes()`, `@Cron(CronExpression.EVERY_10_MINUTES)`:

```
ACTIVE  --[departureAt has passed]-->  FINISHED  --[24h grace period]-->  hard deleted
```

1. `markExpiredAsFinished(now)` — bulk-flips any `ACTIVE` route whose
   `departureAt <= now` to `FINISHED`. Still visible in the driver's own
   dashboard (`GET /my/free-routes`) as history, but drops off the public
   listing immediately (public query only ever selects `ACTIVE`).
2. `deleteFinishedBefore(cutoff)` where `cutoff = now - 24h` — hard-deletes
   any `FINISHED` route older than the grace period. This is a real `DELETE`,
   not a soft flag — the project owner was explicit that expired routes
   "must be fully removed from the DB so they don't waste space," not just
   hidden.

Both steps run every 10 minutes via `@nestjs/schedule` (`ScheduleModule.forRoot()`
registered in `app.module.ts`). Manual deletion by the driver
(`DELETE /my/free-routes/:id`, `FreeRoutesService.remove()`) **skips the
grace period entirely** — it's an immediate hard delete, there's no reason to
keep a row around after the owner explicitly asked to remove it.

Editing a route (`PATCH /my/free-routes/:id`) force-reactivates
`status: 'ACTIVE'` even if the cron had already marked it `FINISHED` — the
product framing is "editing is re-posting."

## Endpoints

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| `GET` | `/api/v1/free-routes` | none | Public listing, `ACTIVE` only |
| `GET` | `/api/v1/my/free-routes` | driver JWT | Own routes, any status |
| `POST` | `/api/v1/my/free-routes` | driver JWT | Requires `isActive` truck (`assertActiveDriver`) |
| `PATCH` | `/api/v1/my/free-routes/:id` | driver JWT | Ownership checked (`getOwnedOrThrow`), reactivates status |
| `DELETE` | `/api/v1/my/free-routes/:id` | driver JWT | Immediate hard delete, no grace period |

`departureAt` is validated server-side
(`FreeRoutesService.parseDepartureAt`) to be a real ISO date **strictly in
the future** — rejects both malformed dates and past/present timestamps.

## Frontend

- `frontend/pages/free-routes/index.vue` — public listing
  (`useAsyncData` + `freeRoutesService.getActive()`), renders
  `FreeRouteCard.vue` per route (route path via
  `frontend/utils/freeRouteLocation.ts`'s `formatRouteLocation()`, which
  special-cases Yerevan since its "cities" are actually districts;
  departure time via `formatDepartureAt()` in `frontend/utils/formatters.ts`).
- `frontend/components/dashboard/FreeRoutesManager.vue` — driver's own
  create/edit/delete UI, embedded in `/dashboard`. Uses **two independent**
  `useLocationPicker()` instances (start and end), plus separate `date`/`time`
  `AppInput`s combined into one ISO string via `buildDepartureAt()` before
  submit.
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
