/**
 * Input validation for creating and editing orders (zod — already a backend
 * dependency), and the rule for what counts as a MATERIAL change.
 *
 * Material = anything that changes what a driver is being asked to do or be
 * paid: pickup, destination, vehicle weight, technical requirements, pricing.
 * A material change bumps `termsVersion`; a PENDING offer made under the old
 * terms is revoked and can no longer be accepted.
 */
import { z } from 'zod'
import { isWithinArmenia } from '../../../common/armenia-bounds'

/** Same canonical form as common/phone.ts ARMENIAN_PHONE_PATTERN */
export const ARMENIAN_PHONE = /^\+374\d{8}$/

/** "091 00-00-01", "+374 91 000001", "37491000001" → "+37491000001" */
export function normaliseArmenianPhone(input: string): string {
  const digits = input.replace(/[^\d+]/g, '')
  if (/^0\d{8}$/.test(digits)) return `+374${digits.slice(1)}`
  if (/^374\d{8}$/.test(digits)) return `+${digits}`
  return digits
}

const point = z
  .object({
    latitude: z.number().finite().min(-90).max(90),
    longitude: z.number().finite().min(-180).max(180),
    address: z.string().trim().min(2).max(500),
  })
  .refine((p) => isWithinArmenia(p.latitude, p.longitude), { message: 'outside Armenia' })

const triState = z.boolean().nullable()

export const createOrderSchema = z
  .object({
    customerPhone: z.string().transform(normaliseArmenianPhone).pipe(z.string().regex(ARMENIAN_PHONE)),
    customerName: z.string().trim().max(120).nullable().optional(),
    pickup: point,
    destination: point.nullable().optional(),
    vehicle: z
      .object({
        make: z.string().trim().max(60).nullable().optional(),
        model: z.string().trim().max(60).nullable().optional(),
        plate: z.string().trim().max(20).nullable().optional(),
        weightKg: z.number().int().min(100).max(60_000).nullable().optional(),
      })
      .default({}),
    problemDescription: z.string().trim().max(2000).default(''),
    requirements: z
      .object({
        wheelsRoll: triState.optional(),
        steeringLocked: triState.optional(),
        gearboxLocked: triState.optional(),
        needsManipulator: triState.optional(),
      })
      .default({}),
    pricing: z.object({
      mode: z.enum(['FIXED', 'NEGOTIATION_REQUIRED']),
      quotedPriceAmd: z.number().int().min(0).max(10_000_000).nullable().optional(),
    }),
    internalNote: z.string().trim().max(2000).nullable().optional(),
  })
  .strict()

export type CreateOrderInput = z.infer<typeof createOrderSchema>

export const updateOrderSchema = z
  .object({
    expectedVersion: z.number().int().min(1),
    customerPhone: z.string().transform(normaliseArmenianPhone).pipe(z.string().regex(ARMENIAN_PHONE)).optional(),
    customerName: z.string().trim().max(120).nullable().optional(),
    pickup: point.optional(),
    destination: point.nullable().optional(),
    vehicle: z
      .object({
        make: z.string().trim().max(60).nullable().optional(),
        model: z.string().trim().max(60).nullable().optional(),
        plate: z.string().trim().max(20).nullable().optional(),
        weightKg: z.number().int().min(100).max(60_000).nullable().optional(),
      })
      .optional(),
    problemDescription: z.string().trim().max(2000).optional(),
    requirements: z
      .object({
        wheelsRoll: triState.optional(),
        steeringLocked: triState.optional(),
        gearboxLocked: triState.optional(),
        needsManipulator: triState.optional(),
      })
      .optional(),
    pricing: z
      .object({
        mode: z.enum(['FIXED', 'NEGOTIATION_REQUIRED']),
        quotedPriceAmd: z.number().int().min(0).max(10_000_000).nullable().optional(),
      })
      .optional(),
    internalNote: z.string().trim().max(2000).nullable().optional(),
  })
  .strict()

export type UpdateOrderInput = z.infer<typeof updateOrderSchema>

/** Column → value pairs an update writes, and whether any of them is material */
export function updateColumns(input: UpdateOrderInput): { columns: Record<string, unknown>; material: string[] } {
  const columns: Record<string, unknown> = {}
  const material: string[] = []
  const set = (column: string, value: unknown, isMaterial: boolean) => {
    if (value === undefined) return
    columns[column] = value
    if (isMaterial) material.push(column)
  }
  set('customerPhone', input.customerPhone, false)
  set('customerName', input.customerName, false)
  if (input.pickup) {
    set('pickupLatitude', input.pickup.latitude, true)
    set('pickupLongitude', input.pickup.longitude, true)
    set('pickupAddress', input.pickup.address, true)
  }
  if (input.destination !== undefined) {
    set('destinationLatitude', input.destination?.latitude ?? null, true)
    set('destinationLongitude', input.destination?.longitude ?? null, true)
    set('destinationAddress', input.destination?.address ?? null, true)
  }
  if (input.vehicle) {
    set('vehicleMake', input.vehicle.make, false)
    set('vehicleModel', input.vehicle.model, false)
    set('vehiclePlate', input.vehicle.plate, false)
    set('vehicleWeightKg', input.vehicle.weightKg, true)
  }
  set('problemDescription', input.problemDescription, false)
  if (input.requirements) {
    set('wheelsRoll', input.requirements.wheelsRoll, true)
    set('steeringLocked', input.requirements.steeringLocked, true)
    set('gearboxLocked', input.requirements.gearboxLocked, true)
    set('needsManipulator', input.requirements.needsManipulator, true)
  }
  if (input.pricing) {
    set('pricingMode', input.pricing.mode, true)
    set('quotedPriceAmd', input.pricing.quotedPriceAmd ?? null, true)
  }
  set('internalNote', input.internalNote, false)
  return { columns, material }
}

/** SQL cast per column, so the generic UPDATE builder stays parameterised and typed */
export const COLUMN_CASTS: Record<string, string> = {
  customerPhone: 'text',
  customerName: 'text',
  pickupLatitude: 'numeric',
  pickupLongitude: 'numeric',
  pickupAddress: 'text',
  destinationLatitude: 'numeric',
  destinationLongitude: 'numeric',
  destinationAddress: 'text',
  vehicleMake: 'text',
  vehicleModel: 'text',
  vehiclePlate: 'text',
  vehicleWeightKg: 'int',
  problemDescription: 'text',
  wheelsRoll: 'boolean',
  steeringLocked: 'boolean',
  gearboxLocked: 'boolean',
  needsManipulator: 'boolean',
  pricingMode: '"OrderPricingMode"',
  quotedPriceAmd: 'int',
  internalNote: 'text',
}

export const cancelSchema = z
  .object({
    expectedVersion: z.number().int().min(1),
    reason: z.enum(['DRIVER_CANNOT_PERFORM', 'CUSTOMER_DECLINED', 'WRONG_DATA', 'PRICE_NOT_AGREED', 'TECHNICAL_PROBLEM', 'OTHER']),
    comment: z.string().trim().max(1000).nullable().optional(),
  })
  .strict()
  .refine((v) => v.reason !== 'OTHER' || (v.comment ?? '').length > 0, { message: 'comment required for OTHER', path: ['comment'] })

export const driverRequestSchema = z
  .object({
    kind: z.enum(['CANCEL', 'PROBLEM']),
    reason: z.enum(['DRIVER_CANNOT_PERFORM', 'CUSTOMER_DECLINED', 'WRONG_DATA', 'PRICE_NOT_AGREED', 'TECHNICAL_PROBLEM', 'OTHER']),
    comment: z.string().trim().max(1000).nullable().optional(),
  })
  .strict()
  .refine((v) => v.reason !== 'OTHER' || (v.comment ?? '').length > 0, { message: 'comment required for OTHER', path: ['comment'] })
