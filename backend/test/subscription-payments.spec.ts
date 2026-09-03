import 'reflect-metadata'
import { BadRequestException } from '@nestjs/common'
import { CONTROLLER_WATERMARK, GUARDS_METADATA, PATH_METADATA } from '@nestjs/common/constants'
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

function fakeRepository(): { repository: SubscriptionsRepository; created: CreatedRow[] } {
  const created: CreatedRow[] = []
  const repository = {
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

function driverRequest(towTruckId: number): AuthenticatedDriverRequest {
  return { towTruckId } as AuthenticatedDriverRequest
}

describe('SubscriptionsService.createPayment', () => {
  it('takes the price and the duration from the plan, never from the caller', async () => {
    const { repository, created } = fakeRepository()
    await new SubscriptionsService(repository).createPayment(12, 'FOUR_MONTHS')

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
    await new SubscriptionsService(repository).createPayment(3, 'ONE_MONTH')
    expect(created[0]!.towTruckId).toBe(3)
  })

  it('computes the quoted period from the plan duration', async () => {
    const { repository, created } = fakeRepository()
    await new SubscriptionsService(repository).createPayment(1, 'FOUR_MONTHS')

    const { periodStart, periodEnd } = created[0]!.data
    const months =
      (periodEnd.getUTCFullYear() - periodStart.getUTCFullYear()) * 12 +
      (periodEnd.getUTCMonth() - periodStart.getUTCMonth())
    expect(months).toBe(4)
  })

  it('comes back PENDING — nothing here charges anyone', async () => {
    const { repository } = fakeRepository()
    const payment = await new SubscriptionsService(repository).createPayment(1, 'ONE_MONTH')
    expect(payment.status).toBe('PENDING')
  })

  it('echoes the driver id the API derived, so a client can see it never sent one', async () => {
    const { repository } = fakeRepository()
    const payment = await new SubscriptionsService(repository).createPayment(42, 'ONE_MONTH')
    expect(payment.towTruckId).toBe(42)
  })

  it('refuses a plan that is not on sale, without writing anything', async () => {
    const { repository, created } = fakeRepository()
    const service = new SubscriptionsService(repository)

    await expect(service.createPayment(1, 'FREE_FOREVER')).rejects.toBeInstanceOf(BadRequestException)
    expect(created).toHaveLength(0)
  })
})

describe('SubscriptionsService.listPlans', () => {
  it('returns both plans under `items`, with the code as the id', () => {
    const { repository } = fakeRepository()
    const { items } = new SubscriptionsService(repository).listPlans()

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
