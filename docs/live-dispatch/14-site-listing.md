# 14. App driver → website listing (2026-11-12)

A driver who signs up **in the app** works in the app only. Approving their
registration creates their `TowTruck` (profile, photos, prices, the password
they chose) **hidden from evakuators.am**: `isActive = false`, `appOnly = true`.
`appOnly` is not a deactivation — the profile stays the driver's to see and
edit (moderated as usual), and live dispatch never reads `TowTruck.isActive`
(app access is `FleetDriver.status`).

| `site.state` (GET /driver-app/me/profile) | Meaning | App shows |
|---|---|---|
| `APP_ONLY` | hidden, never asked | «Ուզում եմ լինել նաև կայքում» |
| `REQUESTED` | `SiteListingRequest` PENDING | "being reviewed" |
| `REJECTED` | last request refused | the reason + "ask again" |
| `LISTED` | public | page link + optional «Կապել Telegram-ը» |
| `DEACTIVATED` | an admin switched it off (unpaid, ban) | contact us; not editable |

- Driver: `POST /driver-app/me/site-listing { note? }` (one PENDING per truck —
  partial unique index), `POST /driver-app/me/telegram-link` → `{ url, linked }`
  (only once LISTED; linking never touches the driver's own password).
- Admin: `/admin/site-listing` page → `GET /admin/site-listing-requests[?status]`,
  `GET …/count`, `GET …/:id` (whole profile), `POST …/:id/approve`
  (`isActive = true, appOnly = false`), `POST …/:id/reject { reason }`.
- Re-activating an app-only truck from the trucks list also publishes it
  (`setActive(true)` clears `appOnly`).
- Website sign-ups are unchanged: published on approval, Telegram link from the admin.
