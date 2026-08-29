import { apiFetch } from './apiClient'
import type { RegistrationPayload } from './registration.repository'
import { useAdminAuthStore } from '~/stores/adminAuth'

/** Mirrors backend RegistrationWithImages (RegistrationRequest & images) */
export interface AdminRegistrationRequest {
  id: number
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  firstName: string
  lastName: string
  companyName?: string
  phone: string
  secondaryPhone?: string
  whatsapp?: string
  telegram?: string
  email?: string
  vehicleBrand: string
  vehicleModel?: string
  vehicleYear: number
  vehicleType: string
  capacityRange: string
  platformLengthM?: number
  platformWidthM?: number
  /** The specialist technical answers — absent for an ordinary evacuator */
  craneCapacityTons?: number
  craneReachM?: number
  maxLoadTons?: number
  platformLoadHeightCm?: number
  winch: boolean
  manipulator: boolean
  wheelSkates: boolean
  doubleDeck: boolean
  towHitch: boolean
  /**
   * The driver's CLAIM to «Ծանր տեխնիկայի տեղափոխում» — optional because every
   * request filed before the question existed carries none, which is not the
   * same as a driver answering "no".
   */
  heavyEquipment?: boolean
  /** «Ամբողջ Հայաստան» — same optionality, same reason */
  servesAllArmenia?: boolean
  workingHoursText?: string
  /** Up to 2 marzes for an ordinary evacuator, unlimited for a specialist */
  regionSlugs: string[]
  /** Empty when the driver answered «Ամբողջ Հայաստան» */
  citySlugs: string[]
  services: string[]
  priceCityCallout?: number
  pricePerKm?: number
  priceWaitingPerHour?: number
  priceNightSurchargePercent?: number
  priceExtraLoading?: number
  /**
   * The base parking coordinates the driver sent at registration, if any —
   * numbers, because the backend converts the two `Decimal` columns before
   * they reach the wire (see `admin-registration.mapper.ts`). Both undefined
   * for the many drivers who skip the question; it is optional at registration.
   */
  latitude?: number
  longitude?: number
  createdAt: string
  images: { id: number; url: string }[]
  /**
   * Whether — and when — this driver ticked the privacy-consent checkbox at
   * registration. `null` for a request filed before the consent dialog
   * existed, and also (by backend design) for one already APPROVED/REJECTED
   * — see `AdminRegistrationSummary.privacyConsent` on the backend for why.
   */
  privacyConsent?: {
    policyVersion: string
    acceptedAt: string
    revokedAt: string | null
  } | null
}

/**
 * Mirrors backend `ApproveRegistrationDto` — the **whole profile**, as the
 * moderator last saw it on `/admin/registrations/:id`, not a handful of extra
 * fields bolted onto a stored record.
 *
 * `RegistrationPayload` is the driver's half of the same shape (the backend's
 * shared `RegistrationProfileDto`); this adds what only the platform can
 * supply, and drops `imageIds`, since the review page cannot change photos.
 */
export interface ApproveRegistrationPayload extends Omit<RegistrationPayload, 'imageIds'> {
  slug: string
  /** Resolved from `capacityRange` by `representativeCapacityTons` — the backend has no taxonomy */
  capacityTons: number
  locationName: string
  citySlug?: string
  districtSlug?: string
  /**
   * The served road corridor the truck is based on, when it is based on one.
   *
   * Validation-only and never stored: a corridor base IS an empty
   * `citySlug`/`districtSlug` with the corridor's name as `locationName`, and
   * this is how the backend is told that emptiness was a choice. See
   * `placementFor`, which produces all of these together.
   */
  routeSlug?: string
  /**
   * The truck's "best-effort" browsing region (TowTruck.regionSlug) —
   * resolved here (not on the backend, which has no geography data) from
   * whichever region citySlug/districtSlug actually belongs to. Omitted for
   * Yerevan, same as before.
   */
  regionSlug?: string
  description?: string
  /**
   * The coverage list with Armenian names attached, which the inherited
   * `citySlugs` cannot carry — the backend has no geography to resolve them
   * with, so whatever is sent here is what a public profile shows forever.
   *
   * Built by `buildServiceAreas()` on the review page from whichever coverage
   * question the driver was asked, so the payload and the picker on screen
   * cannot describe different sets.
   *
   * `region` is the newest member and the narrowest: only an uncapped driver
   * (`hasUncappedCoverage`) can produce one, and only the two specialist
   * listings match it. See `ServiceAreaDto` on the backend, which is the
   * enforcing copy of this union.
   */
  serviceAreas: { slug: string; name: string; type: 'city' | 'district' | 'route' | 'region' }[]
}

/**
 * A queued driver edit, as the panel lists it — mirrors backend
 * `ProfileChangeApi`.
 *
 * `fields` carries only what differs, with raw values on both sides. The words
 * for a service, a city or a vehicle type live in this app's static data and
 * the backend has none of them (CLAUDE.md), so translating them is the
 * frontend's job — see `utils/profileChangeLabels.ts`.
 */
export interface AdminProfileChange {
  id: number
  towTruckId: number
  towTruckSlug: string
  driverName: string
  companyName?: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  fields: { field: string; before: unknown; after: unknown }[]
  rejectionReason?: string
  createdAt: string
  reviewedAt?: string
}

/** Mirrors backend ReviewWithTruck */
export interface AdminReview {
  id: number
  towTruckId: number
  authorName: string
  rating: number
  text: string
  cityName?: string
  isApproved: boolean
  createdAt: string
  towTruck: { slug: string; driverName: string }
}

/** Mirrors backend AdminTowTruckSummary */
export interface AdminTowTruck {
  id: number
  slug: string
  driverName: string
  companyName?: string
  phone: string
  isActive: boolean
  /** Admin-curated "best tow trucks" homepage pick */
  isFeatured: boolean
  vehicleBrand: string
  vehicleModel?: string
  vehicleYear: number
  /** Raw slug — read together with `heavyEquipment` to decide if the box is editable */
  vehicleType: string
  /**
   * Whether this truck appears on `/tsanr-tehnika`. **Derived** server-side:
   * always true for a `heavy-duty` truck, whatever the stored column says.
   * The panel ticks AND disables the box in that case, because the vehicle
   * type is the same claim and there is no "off" for it.
   */
  heavyEquipment: boolean
  locationName: string
  /**
   * Base parking coordinates. Both undefined for every driver approved before
   * this field existed — which is what the panel renders as
   * «Տեղադիրքը նշված չէ».
   *
   * Present here and not on any public shape: this endpoint is behind
   * `AdminJwtGuard`. See `TowTruckApi.location` on the backend.
   */
  latitude?: number
  longitude?: number
  /** ISO datetime of the last coordinate write; undefined when never set */
  locationUpdatedAt?: string
  /**
   * Everywhere the driver claims to work, with the Armenian names resolved at
   * write time — the panel renders these labels as-is rather than looking them
   * up, so an admin sees exactly the words the public profile shows.
   */
  serviceAreas: AdminServiceArea[]
  /** Structural placement — at most one of the two, both unset for corridor-only coverage */
  citySlug?: string
  districtSlug?: string
  /** Unset for Yerevan, which is a pseudo-region */
  regionSlug?: string
  hasTelegramLinked: boolean
  /**
   * Whether the driver can log in right now. False means either "never
   * onboarded" or "reset and has not tapped the new link yet" — indistinguishable
   * here, and the same action either way: send them a link.
   */
  hasPassword: boolean
  createdAt: string
  images: { id: number; url: string }[]
  /**
   * Whether this driver currently clears the dashboard's privacy-consent
   * block. `null` covers three cases the panel does not need to tell apart:
   * never asked (published before the consent dialog existed), asked at an
   * older policy version, or withdrawn — all three mean "owes a consent"
   * right now, same as the driver's own dashboard.
   */
  privacyConsent?: {
    policyVersion: string
    acceptedAt: string
    revokedAt: string | null
  } | null
}

/** Mirrors backend PaymentStatus (admin-payment.mapper.ts) */
export type PaymentStatus = 'unpaid' | 'paid' | 'due-soon' | 'overdue'

/** Mirrors backend AdminPaymentSummary — the lean shape behind `/admin/payments` */
export interface AdminPayment {
  id: number
  driverName: string
  companyName?: string
  phone: string
  lastPaymentAt?: string
  status: PaymentStatus
  /** Lets the payments page offer "Ապաակտիվացնել" on an overdue row and hide it once already inactive */
  isActive: boolean
}

/** One entry of a truck's stored coverage — mirrors backend ServiceAreaJson */
export interface AdminServiceArea {
  slug: string
  name: string
  type: 'city' | 'district' | 'route'
}

/**
 * Mirrors backend RemoveServiceAreaDto.
 *
 * Names the area to REMOVE, never the resulting list — so the endpoint cannot
 * grow a driver's coverage, only shrink it. The placement fields are read only
 * when the removed area is the truck's own `citySlug`/`districtSlug` and are
 * ignored otherwise; the backend rejects a placement that is not among the
 * areas that survive.
 *
 * A `type` rather than an `interface` on purpose: only a type alias gets an
 * implicit index signature, so this is assignable to `apiFetch`'s
 * `Record<string, unknown>` body directly. `ApproveRegistrationPayload` above is
 * an interface and therefore needs `as unknown as Record<string, unknown>` at
 * its call site — a double cast that silences every future mismatch in that
 * payload too, which is exactly what a cast should not do.
 */
/**
 * Mirrors backend SetPrimaryAreaDto — the truck's base.
 *
 * Exactly one of `citySlug`/`districtSlug`, and it must be one of the truck's
 * served areas (the backend rejects anything else, including a road corridor).
 * `locationName` is the composed label — see `composeLocationName`.
 *
 * A `type`, not an `interface`, so it satisfies `apiFetch`'s
 * `Record<string, unknown>` body without a cast — see the note below.
 */
export type SetPrimaryAreaPayload = {
  citySlug?: string
  districtSlug?: string
  /** Validation-only corridor base — see ApproveRegistrationPayload.routeSlug */
  routeSlug?: string
  regionSlug?: string
  locationName: string
}

export type RemoveServiceAreaPayload = {
  slug: string
  citySlug?: string
  districtSlug?: string
  regionSlug?: string
}

/** Mirrors the backend's `GET /admin/tow-trucks/count` — `inactive` is `total - active` */
export interface AdminTowTruckCounts {
  total: number
  active: number
  inactive: number
}

/**
 * One driver who could be handed a password right now: Telegram linked, no
 * password of their own yet. No `telegramChatId` — it is a BigInt the API
 * cannot serialise, and being on this list already means "linked".
 */
export interface PasswordCandidate {
  id: number
  slug: string
  driverName: string
  phone: string
}

export interface IssuePasswordsResult {
  issued: number
  failed: Array<{ id: number; slug: string }>
  /** Named in the request but no longer eligible — the list can go stale between load and send */
  skipped: number
}

/**
 * One driver reachable by the broadcast: active, Telegram linked. Same shape
 * as `PasswordCandidate`, kept as its own type rather than reused because the
 * two lists answer different eligibility questions (has no password yet, vs.
 * is currently active) and could drift independently on the backend.
 */
export interface BroadcastCandidate {
  id: number
  slug: string
  driverName: string
  phone: string
}

export interface BroadcastMessageResult {
  sent: number
  failed: Array<{ id: number; slug: string }>
  /** Named in the request but no longer eligible — the list can go stale between load and send */
  skipped: number
}

/** Every /admin/* route requires a valid admin JWT — attach it here */
function authHeader(): Record<string, string> {
  return useAdminAuthStore().authHeader
}

/**
 * Paging for the admin listings. These are the tables that grow forever —
 * registration requests are kept as an audit trail and nothing deletes them —
 * so the panel loads a page at a time and offers "load more" rather than
 * fetching every row it has ever accumulated on each visit.
 */
export interface AdminListParams {
  limit?: number
  offset?: number
}

/** `listTowTrucks`'s own extra params — see its own comment */
export interface AdminTowTrucksParams extends AdminListParams {
  /** Plain equality on the raw column — see `listTowTrucks`'s own comment */
  vehicleType?: string
  /**
   * Base-location filters — plain equality on the truck's own columns, same
   * cascade as the hero search (`useLocationSearch`): `regionSlug` alone is
   * every driver based anywhere in that marz, `regionSlug` + `citySlug`
   * narrows to one town. `districtSlug`/`yerevan` are Yerevan's branch of the
   * same cascade — see backend `AdminTowTrucksQuery`'s own comment for why
   * Yerevan needs a separate flag rather than a shared slug.
   */
  regionSlug?: string
  citySlug?: string
  districtSlug?: string
  yerevan?: boolean
}

/** All moderation reads/writes against the backend admin endpoints */
export const adminRepository = {
  listRegistrations(
    status?: string,
    params: AdminListParams = {},
  ): Promise<AdminRegistrationRequest[]> {
    return apiFetch<AdminRegistrationRequest[]>('/admin/registration-requests', {
      query: { ...(status ? { status } : {}), limit: params.limit, offset: params.offset },
      headers: authHeader(),
    })
  },

  /**
   * One request by id — what the review page loads.
   *
   * Not served out of `listRegistrations`: that endpoint is paginated and
   * status-filtered, so a request an admin reached by URL, by bookmark, or
   * after a page reload may simply not be in any page of it.
   */
  getRegistration(id: number): Promise<AdminRegistrationRequest> {
    return apiFetch<AdminRegistrationRequest>(`/admin/registration-requests/${id}`, {
      headers: authHeader(),
    })
  },

  /* ── Driver profile edits awaiting review ─────────────────────────────── */

  listProfileChanges(params: AdminListParams = {}): Promise<AdminProfileChange[]> {
    return apiFetch<AdminProfileChange[]>('/admin/profile-changes', {
      query: { limit: params.limit, offset: params.offset },
      headers: authHeader(),
    })
  },

  countProfileChanges(): Promise<{ pending: number }> {
    return apiFetch<{ pending: number }>('/admin/profile-changes/count', {
      headers: authHeader(),
    })
  },

  approveProfileChange(id: number): Promise<{ id: number }> {
    return apiFetch<{ id: number }>(`/admin/profile-changes/${id}/approve`, {
      method: 'POST',
      headers: authHeader(),
    })
  },

  /** The reason is required and is shown to the driver verbatim — see the backend DTO */
  rejectProfileChange(id: number, reason: string): Promise<{ id: number }> {
    return apiFetch<{ id: number }>(`/admin/profile-changes/${id}/reject`, {
      method: 'POST',
      body: { reason },
      headers: authHeader(),
    })
  },

  approveRegistration(
    id: number,
    payload: ApproveRegistrationPayload,
  ): Promise<{ towTruckId: number; telegramLinkUrl: string }> {
    return apiFetch<{ towTruckId: number; telegramLinkUrl: string }>(
      `/admin/registration-requests/${id}/approve`,
      { method: 'POST', body: payload as unknown as Record<string, unknown>, headers: authHeader() },
    )
  },

  /** (Re)generate the Telegram-login link, e.g. if the driver lost the first one */
  regenerateTelegramLink(towTruckId: number): Promise<{ telegramLinkUrl: string }> {
    return apiFetch<{ telegramLinkUrl: string }>(`/admin/tow-trucks/${towTruckId}/telegram-link`, {
      method: 'POST',
      headers: authHeader(),
    })
  },

  /**
   * Revokes the driver's current password and returns a fresh link to send them.
   *
   * Sends nothing itself — the admin passes the link on out-of-band, and the
   * new temporary password is minted when the driver taps it. Deliberately not
   * a message to an already-linked chat: a driver who lost their Telegram is
   * exactly who needs a reset, and that chat may now belong to someone else.
   * See AdminService.resetDriverPassword.
   */
  resetDriverPassword(
    towTruckId: number,
  ): Promise<{ telegramLinkUrl: string; hadPassword: boolean }> {
    return apiFetch<{ telegramLinkUrl: string; hadPassword: boolean }>(
      `/admin/tow-trucks/${towTruckId}/reset-password`,
      { method: 'POST', headers: authHeader() },
    )
  },

  /**
   * The drivers who could be handed a password right now — linked Telegram, no
   * password yet. Read-only: the panel lists these with checkboxes so an admin
   * chooses recipients before anything leaves the system.
   */
  listPasswordCandidates(): Promise<PasswordCandidate[]> {
    return apiFetch<PasswordCandidate[]>('/admin/tow-trucks/password-candidates', {
      headers: authHeader(),
    })
  },

  /**
   * Sends a temporary password to exactly the drivers named, over Telegram.
   *
   * Always takes an explicit id list — there is no "send to everyone" call,
   * deliberately, because a Telegram message cannot be unsent. The backend
   * re-checks eligibility and counts anything stale as `skipped`.
   */
  issuePasswords(towTruckIds: number[]): Promise<IssuePasswordsResult> {
    return apiFetch<IssuePasswordsResult>('/admin/tow-trucks/issue-passwords', {
      method: 'POST',
      body: { towTruckIds },
      headers: authHeader(),
    })
  },

  /**
   * Drivers the broadcast can currently reach — active, Telegram linked.
   * Read-only: the panel lists these with checkboxes so an admin chooses
   * recipients before anything leaves the system, same discipline as the
   * password picker.
   */
  listBroadcastCandidates(): Promise<BroadcastCandidate[]> {
    return apiFetch<BroadcastCandidate[]>('/admin/tow-trucks/broadcast-candidates', {
      headers: authHeader(),
    })
  },

  /**
   * Sends one admin-authored message, verbatim, to exactly the drivers named.
   *
   * Always takes an explicit id list — there is no "send to everyone" call,
   * deliberately, because a Telegram message cannot be unsent. The backend
   * re-checks eligibility and counts anything stale as `skipped`.
   */
  broadcastMessage(message: string, towTruckIds: number[]): Promise<BroadcastMessageResult> {
    return apiFetch<BroadcastMessageResult>('/admin/tow-trucks/broadcast-message', {
      method: 'POST',
      body: { message, towTruckIds },
      headers: authHeader(),
    })
  },

  rejectRegistration(id: number): Promise<{ id: number; status: string }> {
    return apiFetch<{ id: number; status: string }>(
      `/admin/registration-requests/${id}/reject`,
      { method: 'POST', headers: authHeader() },
    )
  },

  listPendingReviews(params: AdminListParams = {}): Promise<AdminReview[]> {
    return apiFetch<AdminReview[]>('/admin/reviews', {
      query: { limit: params.limit, offset: params.offset },
      headers: authHeader(),
    })
  },

  approveReview(id: number): Promise<{ id: number; isApproved: boolean }> {
    return apiFetch<{ id: number; isApproved: boolean }>(`/admin/reviews/${id}/approve`, {
      method: 'POST',
      headers: authHeader(),
    })
  },

  rejectReview(id: number): Promise<{ id: number }> {
    return apiFetch<{ id: number }>(`/admin/reviews/${id}/reject`, {
      method: 'POST',
      headers: authHeader(),
    })
  },

  /**
   * `vehicleType`, when given, is plain equality on the truck's own raw
   * column — not the manipulator/heavy-duty union the public `/tow-trucks`
   * listing applies (see `TowTrucksRepository.buildWhere` on the backend).
   * Each admin card already shows that truck's own `vehicleType` label, so a
   * filter pulling in trucks via a *different* field (the `manipulator`/
   * `heavyEquipment` checkboxes) would show cards whose own label disagrees
   * with the filter that surfaced them.
   */
  listTowTrucks(params: AdminTowTrucksParams = {}): Promise<AdminTowTruck[]> {
    return apiFetch<AdminTowTruck[]>('/admin/tow-trucks', {
      query: {
        limit: params.limit,
        offset: params.offset,
        vehicleType: params.vehicleType,
        regionSlug: params.regionSlug,
        citySlug: params.citySlug,
        districtSlug: params.districtSlug,
        yerevan: params.yerevan,
      },
      headers: authHeader(),
    })
  },

  /**
   * Totals across every page. `listTowTrucks` is paginated, so the length of
   * what it returned answers "how many are loaded", never "how many exist".
   */
  getTowTruckCounts(): Promise<AdminTowTruckCounts> {
    return apiFetch<AdminTowTruckCounts>('/admin/tow-trucks/count', {
      headers: authHeader(),
    })
  },

  /** Deactivate (isActive: false) hides the truck publicly and blocks driver login — reversible */
  setTowTruckActive(id: number, isActive: boolean): Promise<{ id: number; isActive: boolean }> {
    return apiFetch<{ id: number; isActive: boolean }>(`/admin/tow-trucks/${id}/active`, {
      method: 'PATCH',
      body: { isActive },
      headers: authHeader(),
    })
  },

  /** Toggle whether this truck shows in the homepage "best tow trucks" section */
  setTowTruckFeatured(id: number, isFeatured: boolean): Promise<{ id: number; isFeatured: boolean }> {
    return apiFetch<{ id: number; isFeatured: boolean }>(`/admin/tow-trucks/${id}/featured`, {
      method: 'PATCH',
      body: { isFeatured },
      headers: authHeader(),
    })
  },

  /**
   * Toggle whether this truck can move heavy machinery — which is what puts it
   * on `/tsanr-tehnika`. Unlike `setTowTruckFeatured` this changes public
   * listing results, not just the homepage.
   *
   * The response carries the **derived** value, so the caller must assign what
   * comes back rather than the value it sent: a `heavy-duty` truck answers
   * `true` to an attempt to turn it off.
   */
  setTowTruckHeavyEquipment(
    id: number,
    heavyEquipment: boolean,
  ): Promise<{ id: number; heavyEquipment: boolean }> {
    return apiFetch<{ id: number; heavyEquipment: boolean }>(
      `/admin/tow-trucks/${id}/heavy-equipment`,
      { method: 'PATCH', body: { heavyEquipment }, headers: authHeader() },
    )
  },

  /**
   * Marks this driver's payment as received (or, with `paid: false`,
   * corrects a mistaken click) — see `/admin/payments`, the only page that
   * calls this. Purely informational, with no effect on `isActive` or any
   * public page.
   */
  setTowTruckPayment(
    id: number,
    paid: boolean,
  ): Promise<{ id: number; lastPaymentAt?: string; status: PaymentStatus }> {
    return apiFetch<{ id: number; lastPaymentAt?: string; status: PaymentStatus }>(
      `/admin/tow-trucks/${id}/payment`,
      { method: 'PATCH', body: { paid }, headers: authHeader() },
    )
  },

  /**
   * Every driver's payment status — the lean shape behind `/admin/payments`.
   * Deliberately not part of `listTowTrucks`/`AdminTowTruck`: that page is
   * already the busiest one in the panel, and payment status is checked on
   * its own. See backend AdminPaymentSummary.
   *
   * `search`, when given, is matched server-side against driver name,
   * company name and phone (see `AdminPaymentsQuery` on the backend) — that
   * page loads its whole unpaginated table client-side, but the search box
   * still goes to the backend so it keeps working if that ever changes.
   */
  listTowTruckPayments(search?: string): Promise<AdminPayment[]> {
    return apiFetch<AdminPayment[]>('/admin/tow-trucks/payments', {
      query: { search: search || undefined },
      headers: authHeader(),
    })
  },

  /**
   * Corrects the main login phone (the driver's own dashboard can't edit this
   * field). Backend rejects it if another active truck already uses it.
   */
  setTowTruckPhone(id: number, phone: string): Promise<{ id: number; phone: string }> {
    return apiFetch<{ id: number; phone: string }>(`/admin/tow-trucks/${id}/phone`, {
      method: 'PATCH',
      body: { phone },
      headers: authHeader(),
    })
  },

  /**
   * Sets or corrects a truck's base parking coordinates.
   *
   * Unlike `setTowTruckPhone`, this is not an admin-only field — the driver can
   * edit it from their own dashboard too. This endpoint exists so support can
   * fix a pair pasted in the wrong order without asking them to log in.
   */
  setTowTruckCoordinates(
    id: number,
    latitude: number,
    longitude: number,
  ): Promise<{ id: number; latitude: number; longitude: number; locationUpdatedAt: string }> {
    return apiFetch<{ id: number; latitude: number; longitude: number; locationUpdatedAt: string }>(
      `/admin/tow-trucks/${id}/coordinates`,
      { method: 'PATCH', body: { latitude, longitude }, headers: authHeader() },
    )
  },

  /**
   * Sets which single place the truck is based in, plus the label its cards
   * show. `locationName` is composed by the caller — the backend has no
   * geography and cannot turn a slug into Armenian.
   */
  setTowTruckPrimaryArea(
    id: number,
    payload: SetPrimaryAreaPayload,
  ): Promise<{
    id: number
    locationName: string
    citySlug?: string
    districtSlug?: string
    regionSlug?: string
  }> {
    return apiFetch(`/admin/tow-trucks/${id}/primary-area`, {
      method: 'PATCH',
      body: payload,
      headers: authHeader(),
    })
  },

  /**
   * Drops one served area from an approved truck.
   *
   * Returns the coverage as it now stands, read back from the row — the panel
   * patches its list from the response rather than from what it sent, so a
   * placement the backend re-pointed is reflected without a reload.
   */
  removeTowTruckServiceArea(
    id: number,
    payload: RemoveServiceAreaPayload,
  ): Promise<{
    id: number
    serviceAreas: AdminServiceArea[]
    citySlug?: string
    districtSlug?: string
    regionSlug?: string
  }> {
    return apiFetch(`/admin/tow-trucks/${id}/service-areas`, {
      method: 'PATCH',
      body: payload,
      headers: authHeader(),
    })
  },

  /**
   * The full drivers list as a downloadable CSV — name, company, phone,
   * active status, and each driver's all-time traffic totals in one file.
   *
   * Returns the raw `Blob` rather than text: the caller (the panel's download
   * button) hands it straight to `URL.createObjectURL`, and going through a
   * string in between would only cost a UTF-8 re-encode for no benefit —
   * `apiFetch`'s `responseType: 'blob'` is what makes this endpoint's
   * `text/csv` body skip the client's default JSON parsing.
   */
  exportDrivers(): Promise<Blob> {
    return apiFetch<Blob>('/admin/tow-trucks/export.csv', {
      headers: authHeader(),
      responseType: 'blob',
    })
  },

  /** Permanent — deletes the truck, its images (DB + Supabase Storage), reviews and OTPs */
  deleteTowTruck(id: number): Promise<{ id: number }> {
    return apiFetch<{ id: number }>(`/admin/tow-trucks/${id}`, {
      method: 'DELETE',
      headers: authHeader(),
    })
  },
}
