import 'reflect-metadata'
import { describe, expect, it, vi } from 'vitest'
import { AdminService } from '../src/admin/admin.service'

/**
 * `POST /admin/tow-trucks/broadcast-message` — one admin-authored message,
 * sent verbatim to exactly the active, Telegram-linked drivers an admin
 * ticked.
 *
 * Same shape as `issuePasswordsForLinkedDrivers`
 * (`admin-reset-password.spec.ts`'s sibling for that endpoint), and the
 * properties worth protecting are the same class of thing: that the
 * requested id list can only ever narrow the live candidate pool, never
 * substitute for it, and that one driver's send failing does not swallow the
 * rest.
 */

type Candidate = { id: number; slug: string; driverName: string; phone: string; telegramChatId: bigint }

const ARAM: Candidate = { id: 1, slug: 'aram-tow', driverName: 'Արամ', phone: '+37491000001', telegramChatId: 111n }
const GOR: Candidate = { id: 2, slug: 'gor-tow', driverName: 'Գոռ', phone: '+37491000002', telegramChatId: 222n }
const NAIRA: Candidate = { id: 3, slug: 'naira-tow', driverName: 'Նաիրա', phone: '+37491000003', telegramChatId: 333n }

function buildService(candidates: Candidate[] = [ARAM, GOR, NAIRA]) {
  const findActiveWithTelegramLinked = vi.fn(() => Promise.resolve(candidates.map((c) => ({ ...c }))))
  const repository = { findActiveWithTelegramLinked }

  const sendMessage = vi.fn(() => Promise.resolve())
  const telegram = { sendMessage }

  const service = new AdminService(
    {} as never,
    {} as never,
    repository as never,
    telegram as never,
    {} as never,
    {} as never,
  )

  return { service, repository, findActiveWithTelegramLinked, telegram, sendMessage }
}

describe('listBroadcastCandidates', () => {
  it('drops telegramChatId — a BigInt the API cannot serialise', async () => {
    const { service } = buildService()

    const result = await service.listBroadcastCandidates()

    expect(result).toEqual([
      { id: 1, slug: 'aram-tow', driverName: 'Արամ', phone: '+37491000001' },
      { id: 2, slug: 'gor-tow', driverName: 'Գոռ', phone: '+37491000002' },
      { id: 3, slug: 'naira-tow', driverName: 'Նաիրա', phone: '+37491000003' },
    ])
  })
})

describe('broadcastMessage', () => {
  it('sends to every requested id that is a genuine candidate', async () => {
    const { service, sendMessage } = buildService()

    const result = await service.broadcastMessage('Բարև', [1, 2])

    expect(result).toEqual({ sent: 2, failed: [], skipped: 0 })
    expect(sendMessage).toHaveBeenCalledTimes(2)
    expect(sendMessage).toHaveBeenCalledWith(111n, 'Բարև')
    expect(sendMessage).toHaveBeenCalledWith(222n, 'Բարև')
  })

  it('sends the message verbatim, with no button', async () => {
    // Unlike every other message this bot sends (login, link, password), a
    // broadcast has no single action to attach a button to — a regression
    // that added one here would be attaching a stale or wrong URL to text an
    // admin wrote for a different purpose.
    const { service, sendMessage } = buildService([ARAM])

    await service.broadcastMessage('Ուշադրություն', [1])

    expect(sendMessage).toHaveBeenCalledWith(111n, 'Ուշադրություն')
    expect(sendMessage.mock.calls[0]).toHaveLength(2)
  })

  it('never sends to an id that is not on the live candidate list', async () => {
    // The requested list is a FILTER over eligibility, never a source of
    // truth on its own — without this, the endpoint would be a way to
    // message an arbitrary driver by id regardless of whether they are
    // active or even linked.
    const { service, sendMessage } = buildService([ARAM])

    const result = await service.broadcastMessage('Բարև', [1, 999])

    expect(result).toEqual({ sent: 1, failed: [], skipped: 1 })
    expect(sendMessage).toHaveBeenCalledOnce()
    expect(sendMessage).toHaveBeenCalledWith(111n, 'Բարև')
  })

  it('isolates one failed send from the rest of the batch', async () => {
    const { service, sendMessage } = buildService()
    sendMessage.mockImplementationOnce(() => Promise.resolve())
    sendMessage.mockImplementationOnce(() => Promise.reject(new Error('bot is blocked')))
    sendMessage.mockImplementationOnce(() => Promise.resolve())

    const result = await service.broadcastMessage('Բարև', [1, 2, 3])

    expect(result.sent).toBe(2)
    expect(result.failed).toEqual([{ id: 2, slug: 'gor-tow' }])
    expect(result.skipped).toBe(0)
    // The third driver still got the message — one failure did not abort the loop.
    expect(sendMessage).toHaveBeenCalledTimes(3)
  })

  it('reads the candidate list fresh on every call rather than caching it', async () => {
    const { service, findActiveWithTelegramLinked } = buildService()

    await service.broadcastMessage('Ա', [1])
    await service.broadcastMessage('Բ', [2])

    expect(findActiveWithTelegramLinked).toHaveBeenCalledTimes(2)
  })

  it('sends nothing and reports everyone skipped when the list is now empty', async () => {
    const { service, sendMessage } = buildService([])

    const result = await service.broadcastMessage('Բարև', [1, 2])

    expect(result).toEqual({ sent: 0, failed: [], skipped: 2 })
    expect(sendMessage).not.toHaveBeenCalled()
  })
})
