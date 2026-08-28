import { apiFetch } from './apiClient'

/** Mirrors the backend CreateRegistrationDto */
export interface RegistrationPayload {
  firstName: string
  lastName: string
  companyName?: string
  phone: string
  secondaryPhone?: string
  whatsapp?: string
  telegram?: string
  vehicleBrand: string
  vehicleModel?: string
  vehicleYear: number
  vehicleType: string
  capacityRange: string
  /** Two numbers, not a formatted string — see PlatformDimensionsInput.vue */
  platformLengthM?: number
  platformWidthM?: number
  /**
   * The specialist technical answers — see `SPECIALIST_SPEC_FIELDS`. Omitted
   * entirely for an ordinary evacuator, which is never asked for them.
   */
  craneCapacityTons?: number
  craneReachM?: number
  maxLoadTons?: number
  platformLoadHeightCm?: number
  winch: boolean
  manipulator: boolean
  wheelSkates: boolean
  doubleDeck: boolean
  /**
   * «Ծանր տեխնիկայի տեղափոխում», proposed by the driver and confirmed by the
   * moderator — see `RegistrationProfileDto.heavyEquipment` for why this is a
   * request rather than the flag itself.
   */
  heavyEquipment: boolean
  /** «Ամբողջ Հայաստան» — see `TowTruck.servesAllArmenia` */
  servesAllArmenia: boolean
  workingHoursText?: string
  /**
   * The marzes covered — up to 2 for an ordinary evacuator, unlimited for a
   * crane truck or a machinery transporter (`hasUncappedCoverage`). The cap is
   * applied by the API in `assertRegistrationAreasWithinLimit`, which is the
   * only place that can see which driver this is.
   */
  regionSlugs: string[]
  /** May be empty when `servesAllArmenia` is true — there is no list to send */
  citySlugs: string[]
  services: string[]
  /**
   * Base parking coordinates — optional, and omitted together when the driver
   * left the box empty. The API rejects one without the other (see
   * `RegistrationService`), so these two are never independently present.
   *
   * Two numbers, never the "40.1792, 44.4991" string the driver typed: the
   * form parses it with `parseCoordinates` before building this payload, the
   * same way the platform dimensions stopped being a formatted string. See
   * `utils/coordinates.ts`.
   */
  latitude?: number
  longitude?: number
  priceCityCallout?: number
  pricePerKm?: number
  priceWaitingPerHour?: number
  priceNightSurchargePercent?: number
  priceExtraLoading?: number
  imageIds: number[]
  /**
   * The consent dialog's checkbox. Always `true` — the API rejects anything
   * else with `@Equals(true)`, and `buildRegistrationPayload` is only ever
   * called after the driver ticked it. Sent explicitly rather than implied by
   * the request existing, so the recorded consent has a field to point at.
   */
  privacyConsentAccepted: boolean
  /**
   * Which policy version was displayed. Checked against the server's own
   * constant, so a tab left open across a deploy is told to reload rather than
   * silently registering against a document it never showed.
   *
   * There is deliberately no hash here: the server hashes its own canonical
   * text. See the backend's `AcceptPrivacyConsentDto`.
   */
  privacyPolicyVersion: string
}

export interface RegistrationResult {
  id: number
  status: string
}

export const registrationRepository = {
  submit(payload: RegistrationPayload): Promise<RegistrationResult> {
    return apiFetch<RegistrationResult>('/registrations', {
      method: 'POST',
      body: payload as unknown as Record<string, unknown>,
    })
  },
}
