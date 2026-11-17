/**
 * The order form — ONE state, ONE set of rules, ONE body builder — shared by
 * «+ Նոր պատվեր» (pages/admin/orders/index.vue) and «✏️ Խմբագրել»
 * (pages/admin/orders/[id].vue), through components/ops/OrderFormFields.vue.
 * Same pattern as utils/registrationForm.ts: a question added here reaches
 * both forms, so creating and editing can never ask different things.
 *
 * Editing sends only the GROUPS that changed (`orderEditBody`), and never a
 * locked one. That is not cosmetic: the backend (orders.repository.ts
 * `update`) refuses an assigned order's material fields by PRESENCE, not by
 * change — resending an unchanged weight would fail the whole save.
 */
import type { OpsOrder, PickupPrecision, PricingMode } from '~/types/opsDispatch'
import { formatCoordinates, parseCoordinates } from '~/utils/coordinates'

export type TriState = boolean | null
export type SkatesCount = '' | '1' | '2' | '3' | '4'

export interface OrderFormState {
  customerPhone: string
  customerName: string
  pickupCoords: string
  /** 2026-11-17: required as soon as pickup coordinates are typed; '' = not chosen */
  pickupPrecision: PickupPrecision | ''
  pickupAddress: string
  destinationCoords: string
  destinationAddress: string
  make: string
  model: string
  plate: string
  weightKg: string
  problemDescription: string
  wheelsRoll: TriState
  steeringLocked: TriState
  gearboxLocked: TriState
  needsManipulator: TriState
  /**
   * '' = not stated. Asked only when skates are needed — wheels that do not
   * roll or a locked gearbox (2026-11-17) — see `needsWheelSkatesOf`.
   */
  wheelSkatesCount: SkatesCount
  pricingMode: PricingMode
  quotedPriceAmd: string
  internalNote: string
  /** 2026-11-17: the driver who handed this order to us; null = none */
  referrerDriverId: number | null
}

/**
 * The questions the form ASKS (2026-11-17). `needsManipulator` is no longer
 * asked: it stays in the state, carried over from the order as it was, so an
 * edit never silently drops a crane requirement an older order has.
 */
export const REQUIREMENT_FIELDS = ['wheelsRoll', 'steeringLocked', 'gearboxLocked'] as const

/**
 * Wheels that do not roll, or a gearbox that cannot be put in neutral, mean
 * wheel skates (2026-11-17, product decision): the order then goes ONLY to
 * drivers who have skates — the backend's strict `needsWheelSkates` rule, a
 * crane is no substitute. Otherwise not asked (null).
 */
export const needsWheelSkatesOf = (form: Pick<OrderFormState, 'wheelsRoll' | 'gearboxLocked'>): true | null =>
  form.wheelsRoll === false || form.gearboxLocked === true ? true : null

/** The description the create form stores when only destination coordinates were given */
export const DESTINATION_ADDRESS_FALLBACK = 'Հասցեն նշված չէ'

export function blankOrderForm(): OrderFormState {
  return {
    customerPhone: '',
    customerName: '',
    pickupCoords: '',
    pickupPrecision: '',
    pickupAddress: '',
    destinationCoords: '',
    destinationAddress: '',
    make: '',
    model: '',
    plate: '',
    weightKg: '',
    problemDescription: '',
    wheelsRoll: null,
    steeringLocked: null,
    gearboxLocked: null,
    needsManipulator: null,
    wheelSkatesCount: '',
    // Default (2026-11-12): the driver calls the customer, agrees the price and
    // must record it before setting off. FIXED only when the operator already
    // agreed a price with the customer (then the driver enters nothing).
    pricingMode: 'NEGOTIATION_REQUIRED',
    quotedPriceAmd: '',
    internalNote: '',
    referrerDriverId: null,
  }
}

const coords = (lat: number | null | undefined, lng: number | null | undefined) =>
  lat === null || lat === undefined || lng === null || lng === undefined ? '' : formatCoordinates(lat, lng)

/** The form pre-filled with an existing order — what «Խմբագրել» opens with */
export function orderFormFromOrder(order: OpsOrder): OrderFormState {
  const skates = order.requirements.wheelSkatesCount
  return {
    customerPhone: order.customer.phone,
    customerName: order.customer.name ?? '',
    pickupCoords: coords(order.pickup.latitude, order.pickup.longitude),
    pickupPrecision: order.pickup.precision ?? '',
    pickupAddress: order.pickup.address,
    destinationCoords: coords(order.destination?.latitude, order.destination?.longitude),
    destinationAddress: order.destination?.address ?? '',
    make: order.vehicle.make ?? '',
    model: order.vehicle.model ?? '',
    plate: order.vehicle.plate ?? '',
    weightKg: order.vehicle.weightKg === null ? '' : String(order.vehicle.weightKg),
    problemDescription: order.problemDescription,
    // An order stored with «needs skates» but no wheel answer reads as «wheels don't roll» — the one question both now are
    wheelsRoll: order.requirements.wheelsRoll ?? (order.requirements.needsWheelSkates === true ? false : null),
    steeringLocked: order.requirements.steeringLocked,
    gearboxLocked: order.requirements.gearboxLocked,
    needsManipulator: order.requirements.needsManipulator,
    wheelSkatesCount: skates && skates >= 1 && skates <= 4 ? (String(skates) as SkatesCount) : '',
    pricingMode: order.price.mode,
    quotedPriceAmd: order.price.quotedAmd === null ? '' : String(order.price.quotedAmd),
    internalNote: order.internalNote ?? '',
    referrerDriverId: order.referrerDriverId ?? null,
  }
}

/** «+374 91 00 00 01», «091000001», «91000001» → +37491000001; null if it is not a number */
export function armenianPhone(input: string): string | null {
  const digits = input.replace(/[^\d+]/g, '')
  const m = /^(?:\+374|00374|374|0)?(\d{8})$/.exec(digits)
  return m ? `+374${m[1]}` : null
}

export const isPriceMissing = (form: OrderFormState) => form.pricingMode === 'FIXED' && !String(form.quotedPriceAmd).trim()

/** The pickup description — required on an order and a pre-order alike */
export const isPickupMissing = (form: OrderFormState) => form.pickupAddress.trim().length < 2

/** Coordinates typed but «exact or approximate?» not answered (2026-11-17) */
export const isPrecisionMissing = (form: OrderFormState) => !!form.pickupCoords.trim() && !form.pickupPrecision

/** What the operator must fix, said exactly — before the request leaves (2026-11-12) */
export function orderFormProblem(form: OrderFormState): string | null {
  if (!form.customerPhone.trim()) return 'Գրեք հաճախորդի հեռախոսահամարը'
  if (!armenianPhone(form.customerPhone)) return 'Հաճախորդի հեռախոսը սխալ է. գրեք +374XXXXXXXX կամ 0XXXXXXXX ձևով'
  if (isPickupMissing(form)) return 'Գրեք վերցնելու հասցեն'
  if (isPrecisionMissing(form)) return 'Նշեք՝ վերցնելու կետը հաստատվա՞ծ է, թե մոտավոր'
  if (form.weightKg && (Number(form.weightKg) < 100 || Number(form.weightKg) > 60000)) return 'Քաշը պետք է լինի 100-ից 60 000 կգ'
  if (form.pricingMode === 'FIXED') {
    if (isPriceMissing(form)) return 'Ֆիքսված գնի դեպքում գրեք համաձայնեցված գինը (կամ ընտրեք «Վարորդը կհամաձայնեցնի»)'
    const price = Number(form.quotedPriceAmd)
    if (!Number.isInteger(price) || price < 0 || price > 10_000_000) return 'Գինը պետք է լինի ամբողջ թիվ՝ 0-ից 10 000 000 ֏'
  }
  return null
}

export type OrderBodyResult = { ok: true; body: Record<string, unknown> } | { ok: false; error: string }

/**
 * The full create/update body. Only the pickup address and the phone are
 * mandatory (2026-11): without pickup coordinates the order can still be
 * created and sent to a driver manually; only the automatic search needs them.
 */
export function buildOrderBody(form: OrderFormState): OrderBodyResult {
  const problem = orderFormProblem(form)
  if (problem) return { ok: false, error: problem }
  const parsedPickup = form.pickupCoords.trim() ? parseCoordinates(form.pickupCoords) : null
  if (parsedPickup && !parsedPickup.ok) return { ok: false, error: `Վերցնելու կետ՝ ${parsedPickup.error}` }
  const pickup = parsedPickup && parsedPickup.ok ? parsedPickup : null
  const parsedDestination = form.destinationCoords.trim() ? parseCoordinates(form.destinationCoords) : null
  if (parsedDestination && !parsedDestination.ok) return { ok: false, error: `Հասցման կետ՝ ${parsedDestination.error}` }
  const destination = parsedDestination && parsedDestination.ok ? parsedDestination : null
  return {
    ok: true,
    body: {
      customerPhone: form.customerPhone,
      customerName: form.customerName.trim() || null,
      pickup: {
        latitude: pickup?.latitude ?? null,
        longitude: pickup?.longitude ?? null,
        address: form.pickupAddress.trim(),
        // No coordinates → no precision to claim (the server clears it too)
        precision: pickup && form.pickupPrecision ? form.pickupPrecision : null,
      },
      // The description alone is kept too (2026-11) — the driver sees it even
      // without coordinates; only the route figures and navigation need them.
      destination:
        destination || form.destinationAddress.trim()
          ? { latitude: destination?.latitude ?? null, longitude: destination?.longitude ?? null, address: form.destinationAddress.trim() || DESTINATION_ADDRESS_FALLBACK }
          : null,
      vehicle: { make: form.make.trim() || null, model: form.model.trim() || null, plate: form.plate.trim() || null, weightKg: form.weightKg ? Number(form.weightKg) : null },
      problemDescription: form.problemDescription.trim(),
      requirements: {
        wheelsRoll: form.wheelsRoll,
        steeringLocked: form.steeringLocked,
        gearboxLocked: form.gearboxLocked,
        needsManipulator: form.needsManipulator,
        needsWheelSkates: needsWheelSkatesOf(form),
        wheelSkatesCount: needsWheelSkatesOf(form) && form.wheelSkatesCount ? Number(form.wheelSkatesCount) : null,
      },
      pricing: { mode: form.pricingMode, quotedPriceAmd: form.quotedPriceAmd ? Number(form.quotedPriceAmd) : null },
      internalNote: form.internalNote.trim() || null,
      referrerDriverId: form.referrerDriverId,
    },
  }
}

// ─── Pre-orders (2026-11-17) ─────────────────────────────────────────────────
// The same form state (OrderFormFields variant="preOrder"), a smaller body:
// no plate, no price, no referrer; the phone is optional and never reaches a
// driver; «Խնդիրը» is the comment drivers read.

export function preOrderFormProblem(form: OrderFormState): string | null {
  if (form.customerPhone.trim() && !armenianPhone(form.customerPhone)) return 'Հաճախորդի հեռախոսը սխալ է. գրեք +374XXXXXXXX կամ 0XXXXXXXX ձևով (կամ թողեք դատարկ)'
  if (isPickupMissing(form)) return 'Գրեք վերցնելու հասցեն'
  if (isPrecisionMissing(form)) return 'Նշեք՝ վերցնելու կետը հաստատվա՞ծ է, թե մոտավոր'
  // Required for a pre-order (2026-11-17): a driver cannot price a job without knowing where it goes
  if (isPreOrderDestinationMissing(form)) return 'Գրեք, թե ուր պետք է տանել մեքենան'
  if (form.weightKg && (Number(form.weightKg) < 100 || Number(form.weightKg) > 60000)) return 'Քաշը պետք է լինի 100-ից 60 000 կգ'
  return null
}

export const isPreOrderDestinationMissing = (form: OrderFormState) => form.destinationAddress.trim().length < 2

/** No deadline (2026-11-17): a pre-order takes prices until the operator closes it */
export function buildPreOrderBody(form: OrderFormState): OrderBodyResult {
  const problem = preOrderFormProblem(form)
  if (problem) return { ok: false, error: problem }
  // Same coordinate/description rules as an order: reuse the order body with a placeholder phone and pick the shared parts
  const built = buildOrderBody({ ...form, customerPhone: '+37400000000', pricingMode: 'NEGOTIATION_REQUIRED', quotedPriceAmd: '' })
  if (!built.ok) return built
  const b = built.body as Record<string, unknown> & { vehicle: Record<string, unknown> }
  return {
    ok: true,
    body: {
      pickup: b.pickup,
      destination: b.destination,
      vehicle: { make: b.vehicle.make, model: b.vehicle.model, weightKg: b.vehicle.weightKg },
      requirements: b.requirements,
      comment: b.problemDescription,
      customerPhone: form.customerPhone.trim() ? armenianPhone(form.customerPhone) : null,
      customerName: b.customerName,
      internalNote: b.internalNote,
    },
  }
}

/**
 * What an operator may change on this order — the backend's rule
 * (orders.repository.ts `update`), mirrored so the form greys out a field
 * instead of failing the save. The server stays the authority.
 *   closed (COMPLETED / CANCELLED) → only the internal note
 *   a driver attached → not the pickup, weight, requirements or price TYPE:
 *     he accepted the job on those; to change them, release him first
 */
export interface OrderFormLocks {
  closed: boolean
  pickup: boolean
  weight: boolean
  requirements: boolean
  pricingMode: boolean
}

export function orderFormLocks(order: Pick<OpsOrder, 'status' | 'assignedDriverId'> | null): OrderFormLocks {
  if (!order) return { closed: false, pickup: false, weight: false, requirements: false, pricingMode: false }
  const closed = order.status === 'COMPLETED' || order.status === 'CANCELLED'
  const assigned = order.assignedDriverId !== null
  return { closed, pickup: closed || assigned, weight: closed || assigned, requirements: closed || assigned, pricingMode: closed || assigned }
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/**
 * The PATCH body for an edit: only the groups that differ from the order as
 * it was opened, never a locked one. `null` = nothing changed. Both sides go
 * through `buildOrderBody`, so formatting (trim, '' → null) never reads as a change.
 */
export function orderEditBody(original: OrderFormState, next: OrderFormState, locks: OrderFormLocks): OrderBodyResult | { ok: true; body: null } {
  if (locks.closed) {
    // A closed order keeps whatever it was closed with; the note is the only
    // thing left to write, so today's form rules must not stand in its way.
    const note = next.internalNote.trim() || null
    return { ok: true, body: note === (original.internalNote.trim() || null) ? null : { internalNote: note } }
  }
  // A locked pickup is never sent, so an older order that has coordinates but
  // no precision yet must not block a save of, say, the customer's phone.
  const unlockedRules = (form: OrderFormState): OrderFormState =>
    locks.pickup && !form.pickupPrecision ? { ...form, pickupPrecision: 'APPROXIMATE' } : form
  const built = buildOrderBody(unlockedRules(next))
  if (!built.ok) return built
  const before = buildOrderBody(unlockedRules(original))
  // The order as stored may itself fail today's rules (an old weight, say);
  // then every group counts as changed, and the server decides.
  const was: Record<string, unknown> = before.ok ? before.body : {}
  const now = built.body
  const body: Record<string, unknown> = {}
  const take = (key: string, value: unknown = now[key]) => {
    if (!same(was[key], now[key])) body[key] = value
  }
  {
    take('customerPhone')
    take('customerName')
    if (!locks.pickup) take('pickup')
    take('destination')
    const vehicle = now.vehicle as Record<string, unknown>
    const wasVehicle = (was.vehicle ?? {}) as Record<string, unknown>
    if (locks.weight) {
      const { weightKg: _w, ...rest } = vehicle
      const { weightKg: _ww, ...wasRest } = wasVehicle
      if (!same(wasRest, rest)) body.vehicle = rest
    } else {
      take('vehicle')
    }
    take('problemDescription')
    if (!locks.requirements) take('requirements')
    if (locks.pricingMode) {
      const pricing = now.pricing as { mode: PricingMode; quotedPriceAmd: number | null }
      const wasPricing = (was.pricing ?? {}) as { quotedPriceAmd?: number | null }
      // The type stays; only a FIXED order's price can move (the backend refuses a mode change)
      if (pricing.quotedPriceAmd !== (wasPricing.quotedPriceAmd ?? null)) body.pricing = { mode: original.pricingMode, quotedPriceAmd: pricing.quotedPriceAmd }
    } else {
      take('pricing')
    }
    take('internalNote')
    take('referrerDriverId')
  }
  return { ok: true, body: Object.keys(body).length ? body : null }
}
