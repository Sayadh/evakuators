import 'reflect-metadata'
import { BadRequestException, ConflictException } from '@nestjs/common'
import { CONTROLLER_WATERMARK, GUARDS_METADATA, PATH_METADATA } from '@nestjs/common/constants'
import type { ConfigService } from '@nestjs/config'
import { plainToInstance } from 'class-transformer'
import { validateSync } from 'class-validator'
import { describe, expect, it, vi } from 'vitest'
import { DriverJwtGuard } from '../src/driver-auth/driver-jwt.guard'
import type { AuthenticatedDriverRequest } from '../src/driver-auth/driver-jwt.guard'
import { CreateSubscriptionPaymentDto } from '../src/subscriptions/dto/create-subscription-payment.dto'
import { MySubscriptionPaymentsController } from '../src/subscriptions/my-subscription-payments.controller'
import { MySubscriptionPlansController } from '../src/subscriptions/my-subscription-plans.controller'
import type {
  SubscriptionPaymentCreateData,
  SubscriptionsRepository,
} from '../src/subscriptions/subscriptions.repository'
import { SubscriptionsService } from '../src/subscriptions/subscriptions.service'
import type { IdramService } from '../src/idram/idram.service'
import type { TowTrucksRepository } from '../src/tow-trucks/tow-trucks.repository'

/**
 * The two collaborators these tests do not exercise, as the smallest thing
 * that satisfies the constructor: the truck lookup belongs to `getMyStatus`,
 * and the gateway form to an environment that has payment credentials —
 * `undefined` here is exactly what an environment without them returns.
 */
const noTrucks = {} as TowTrucksRepository
const noGateway = { isConfigured: false, paymentForm: () => undefined } as unknown as IdramService

/**
 * A ConfigService answering `subscriptions` — `all` because these tests are
 * about creating a payment, not about who the feature is switched on for; the
 * rollout itself is covered in `subscription-lockout.spec.ts`.
 */
const rolloutAll = {
  getOrThrow: () => ({ pilotTowTruckIds: 'all' }),
} as unknown as ConfigService

/** SubscriptionsService with only the collaborator each test actually uses */
function buildService(repository: SubscriptionsRepository): SubscriptionsService {
  return new SubscriptionsService(repository, noTrucks, noGateway, rolloutAll)
}

/**
 * The property this whole feature rests on: **the client names a plan and
 * nothing else.** Price, duration, driver and status are all decided here.
 *
 * A frontend that could state its own price would be a frontend that could
 * buy four months for one dram, so these are not style tests.
 */

interface CreatedRow {
  towTruckId: number
  data: SubscriptionPaymentCreateData
}

/**
 * `paidUntil` is what `createPayment` now reads before it will create
 * anything — null (never covered) is the state every existing test here means.
 */
function fakeRepository(paidUntil: Date | null = null): {
  repository: SubscriptionsRepository
  created: CreatedRow[]
} {
  const created: CreatedRow[] = []
  const repository = {
    findCoverage: vi.fn(async (ids: number[]) => {
      const map = new Map()
      for (const id of ids) map.set(id, { towTruckId: id, paidUntil, lastPaidAt: null, pendingCount: 0 })
      return map
    }),
    create: vi.fn(async (towTruckId: number, data: SubscriptionPaymentCreateData) => {
      created.push({ towTruckId, data })
      return {
        id: 77,
        towTruckId,
        ...data,
        status: 'PENDING' as const,
        createdAt: new Date('2026-09-02T10:00:00.000Z'),
        updatedAt: new Date('2026-09-02T10:00:00.000Z'),
      }
    }),
    findOwn: vi.fn(async () => []),
  }
  return { repository: repository as unknown as SubscriptionsRepository, created }
}

const inDays = (days: number): Date => new Date(Date.now() + days * 24 * 60 * 60 * 1000)

/**
 * Paying twice by accident, and the narrow window where paying again is not an
 * accident at all.
 *
 * The rule is keyed on the STATUS rather than on "has any coverage", so it
 * lifts by itself in the last `PAYMENT_DUE_SOON_WITHIN_DAYS` days — the same
 * window the dashboard already spends telling the driver to pay. Blocking on
 * coverage alone would mean nobody could renew before running out: every
 * driver would have to lapse, get locked out, and pay from behind the paywall,
 * once a month, forever.
 */
describe('createPayment while already covered', () => {
  it('refuses a driver with coverage to spare', async () => {
    const { repository, created } = fakeRepository(inDays(20))
    const attempt = buildService(repository).createPayment(7, 'ONE_MONTH')

    await expect(attempt).rejects.toBeInstanceOf(ConflictException)
    // Nothing was written: a refused request must not leave a PENDING row
    // behind for an admin to wonder about.
    expect(created).toHaveLength(0)
  })

  it('names the date the driver is covered until', async () => {
    // "You already paid" without saying until when sends someone to the phone.
    const { repository } = fakeRepository(new Date('2026-11-04T10:00:00.000Z'))
    await expect(buildService(repository).createPayment(7, 'ONE_MONTH')).rejects.toThrow(/04\.11\.2026/)
  })

  it('lets a driver inside the warning window renew', async () => {
    // The whole point of keying on status: renewal has to be possible BEFORE
    // the lapse, or the paywall becomes a monthly outage for paying customers.
    const { repository, created } = fakeRepository(inDays(3))
    await buildService(repository).createPayment(7, 'ONE_MONTH')
    expect(created).toHaveLength(1)
  })

  it('lets a lapsed driver pay', async () => {
    const { repository, created } = fakeRepository(inDays(-10))
    await buildService(repository).createPayment(7, 'ONE_MONTH')
    expect(created).toHaveLength(1)
  })

  it('lets a driver who has never been billed pay', async () => {
    const { repository, created } = fakeRepository(null)
    await buildService(repository).createPayment(7, 'FOUR_MONTHS')
    expect(created).toHaveLength(1)
  })
})

function driverRequest(towTruckId: number): AuthenticatedDriverRequest {
  return { towTruckId } as AuthenticatedDriverRequest
}

describe('SubscriptionsService.createPayment', () => {
  it('takes the price and the duration from the plan, never from the caller', async () => {
    const { repository, created } = fakeRepository()
    await buildService(repository).createPayment(12, 'FOUR_MONTHS')

    expect(created).toHaveLength(1)
    expect(created[0]!.data).toMatchObject({
      planCode: 'FOUR_MONTHS',
      amount: 10000,
      currency: 'AMD',
      durationMonths: 4,
    })
  })

  it('records the payment against the driver it was told, and no other', async () => {
    // In production that number comes from the JWT (see the controller test
    // below) — the point here is that the service writes it through unchanged
    // rather than reading an id from anywhere else.
    const { repository, created } = fakeRepository()
    await buildService(repository).createPayment(3, 'ONE_MONTH')
    expect(created[0]!.towTruckId).toBe(3)
  })

  it('computes the quoted period from the plan duration', async () => {
    const { repository, created } = fakeRepository()
    await buildService(repository).createPayment(1, 'FOUR_MONTHS')

    const { periodStart, periodEnd } = created[0]!.data
    const months =
      (periodEnd.getUTCFullYear() - periodStart.getUTCFullYear()) * 12 +
      (periodEnd.getUTCMonth() - periodStart.getUTCMonth())
    expect(months).toBe(4)
  })

  it('comes back PENDING — nothing here charges anyone', async () => {
    const { repository } = fakeRepository()
    const payment = await buildService(repository).createPayment(1, 'ONE_MONTH')
    expect(payment.status).toBe('PENDING')
  })

  it('echoes the driver id the API derived, so a client can see it never sent one', async () => {
    const { repository } = fakeRepository()
    const payment = await buildService(repository).createPayment(42, 'ONE_MONTH')
    expect(payment.towTruckId).toBe(42)
  })

  it('refuses a plan that is not on sale, without writing anything', async () => {
    const { repository, created } = fakeRepository()
    const service = buildService(repository)

    await expect(service.createPayment(1, 'FREE_FOREVER')).rejects.toBeInstanceOf(BadRequestException)
    expect(created).toHaveLength(0)
  })
})

describe('SubscriptionsService.listPlans', () => {
  it('returns both plans under `items`, with the code as the id', () => {
    const { repository } = fakeRepository()
    const { items } = buildService(repository).listPlans()

    expect(items.map((plan) => plan.id)).toEqual(['ONE_MONTH', 'FOUR_MONTHS'])
    expect(items[0]).toMatchObject({ id: 'ONE_MONTH', code: 'ONE_MONTH', price: 3000 })
  })
})

describe('CreateSubscriptionPaymentDto', () => {
  function validate(body: Record<string, unknown>): string[] {
    // The same options main.ts gives the global ValidationPipe — the
    // `forbidNonWhitelisted` half is the one that matters below.
    const dto = plainToInstance(CreateSubscriptionPaymentDto, body)
    return validateSync(dto, { whitelist: true, forbidNonWhitelisted: true }).map(
      (error) => error.property,
    )
  }

  it('accepts a body that is nothing but a known plan id', () => {
    expect(validate({ planId: 'ONE_MONTH' })).toEqual([])
  })

  it('rejects an unknown plan id', () => {
    expect(validate({ planId: 'ONE_DAY' })).toEqual(['planId'])
  })

  it('rejects a missing plan id', () => {
    expect(validate({})).toEqual(['planId'])
  })

  it('REJECTS a client-supplied price rather than ignoring it', () => {
    // Silently stripping would let a frontend go on sending `amount` while
    // believing it means something. Failing loudly is the point.
    expect(validate({ planId: 'ONE_MONTH', amount: 1 })).toContain('amount')
  })

  it('REJECTS a client-supplied driver id', () => {
    expect(validate({ planId: 'ONE_MONTH', towTruckId: 999 })).toContain('towTruckId')
  })

  it('REJECTS a client-supplied status', () => {
    expect(validate({ planId: 'ONE_MONTH', status: 'PAID' })).toContain('status')
  })
})

describe('driver subscription controllers', () => {
  it('serve the /my/* paths the frontend session handling depends on', () => {
    // Not cosmetic: apiClient.ts's handleExpiredSession keys off the `/my/`
    // prefix to send an expired driver session back to /login.
    expect(Reflect.getMetadata(PATH_METADATA, MySubscriptionPlansController)).toBe(
      'my/subscription-plans',
    )
    expect(Reflect.getMetadata(PATH_METADATA, MySubscriptionPaymentsController)).toBe(
      'my/subscription-payments',
    )
  })

  it('are both behind DriverJwtGuard', () => {
    for (const controller of [MySubscriptionPlansController, MySubscriptionPaymentsController]) {
      expect(Reflect.getMetadata(CONTROLLER_WATERMARK, controller)).toBe(true)
      expect(Reflect.getMetadata(GUARDS_METADATA, controller)).toContain(DriverJwtGuard)
    }
  })

  it('pass the JWT’s truck id to the service, not anything from the body', async () => {
    const create = vi.fn(async () => ({}) as never)
    const service = { createPayment: create } as unknown as SubscriptionsService
    const controller = new MySubscriptionPaymentsController(service)

    const dto = plainToInstance(CreateSubscriptionPaymentDto, { planId: 'ONE_MONTH' })
    await controller.create(driverRequest(55), dto)

    expect(create).toHaveBeenCalledWith(55, 'ONE_MONTH')
  })

  it('lists only the caller’s own payments', async () => {
    const listMyPayments = vi.fn(async () => [])
    const service = { listMyPayments } as unknown as SubscriptionsService
    const controller = new MySubscriptionPaymentsController(service)

    await controller.listMine(driverRequest(8))
    expect(listMyPayments).toHaveBeenCalledWith(8)
  })
})
