import 'reflect-metadata'
import { BadRequestException, NotFoundException } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'
import { AdminService } from '../src/admin/admin.service'

/**
 * `AdminService.setTowTruckPayment` — the one property worth pinning is that
 * `paidAt` is what actually lands in `lastPaymentAt`, not "the instant this
 * request happened". That used to be the whole point of `paid: true`
 * (`setPayment` stamped `new Date()` itself); now the admin picks the real
 * payment date by hand, and `derivePaymentStatus`'s day-count is only honest
 * if that date is genuine, so a missing/future one is rejected rather than
 * silently substituted.
 *
 * Hand-rolled AdminService with only the one collaborator this path touches —
 * same pattern as admin-heavy-equipment.spec.ts. towTrucksRepository is the
 * THIRD constructor argument.
 */
function buildService(truck: { id: number } | null) {
  const setPayment = vi.fn((id: number, lastPaymentAt: Date | null) =>
    Promise.resolve({ id, lastPaymentAt }),
  )
  const repository = {
    findById: vi.fn(() => Promise.resolve(truck ? { ...truck } : null)),
    setPayment,
  }

  const service = new AdminService({} as never, {} as never, repository as never, {} as never, {} as never, {} as never, {} as never)

  return { service, setPayment }
}

describe('AdminService.setTowTruckPayment', () => {
  it('stores the admin-chosen paidAt, not the current instant', async () => {
    const { service, setPayment } = buildService({ id: 5 })
    const chosen = '2026-08-20T00:00:00.000Z'

    await service.setTowTruckPayment(5, true, chosen)

    expect(setPayment).toHaveBeenCalledWith(5, new Date(chosen))
  })

  it('rejects paid: true with no paidAt', async () => {
    const { service } = buildService({ id: 5 })

    await expect(service.setTowTruckPayment(5, true, undefined)).rejects.toBeInstanceOf(
      BadRequestException,
    )
  })

  it('rejects a malformed paidAt', async () => {
    const { service } = buildService({ id: 5 })

    await expect(service.setTowTruckPayment(5, true, 'not-a-date')).rejects.toBeInstanceOf(
      BadRequestException,
    )
  })

  it('rejects a paidAt in the future', async () => {
    const { service } = buildService({ id: 5 })
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

    await expect(service.setTowTruckPayment(5, true, future)).rejects.toBeInstanceOf(
      BadRequestException,
    )
  })

  it('clears lastPaymentAt with paid: false, ignoring any paidAt', async () => {
    const { service, setPayment } = buildService({ id: 5 })

    await service.setTowTruckPayment(5, false)

    expect(setPayment).toHaveBeenCalledWith(5, null)
  })

  it('404s for a truck that does not exist', async () => {
    const { service } = buildService(null)

    await expect(
      service.setTowTruckPayment(99, true, '2026-08-20T00:00:00.000Z'),
    ).rejects.toBeInstanceOf(NotFoundException)
  })
})
