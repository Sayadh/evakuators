import 'reflect-metadata'
import { NotFoundException } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'
import { AdminService } from '../src/admin/admin.service'

/**
 * `POST /admin/tow-trucks/:id/reset-password` — the only way a driver who
 * forgot (or leaked) their password gets back in.
 *
 * What is worth asserting here is not "does it null the column". It is the
 * three properties that make the reset safe, each of which is invisible in the
 * happy path and each of which has a plausible refactor that breaks it:
 *
 * 1. **One write.** Revoking and arming the replacement link are a single
 *    statement, because both orders of two writes can strand a driver with no
 *    password and no live link (see the repository method). "Simplify by
 *    reusing setPassword + setTelegramLinkToken" is the refactor this stops.
 * 2. **The link is fresh every time.** A reset that reused a token would hand
 *    an admin a link that a previous reset's recipient may still hold.
 * 3. **`telegramChatId` is untouched.** Clearing it "for safety" would silently
 *    stop contact notices, and would do nothing for security — the driver is
 *    given a link precisely because we are not trusting the existing chat.
 */

type Truck = { id: number; passwordHash: string | null }

const WITH_PASSWORD: Truck = { id: 4, passwordHash: '$2b$12$something' }
const WITHOUT_PASSWORD: Truck = { id: 9, passwordHash: null }

/**
 * An AdminService with only the three collaborators this path touches. Hand
 * rolled rather than a Nest testing module, like admin-service-areas.spec.ts —
 * the suite never reaches a database (docs/testing.md).
 */
function buildService(truck: Truck | null = WITH_PASSWORD) {
  const revokePasswordWithLinkToken = vi.fn((id: number) => Promise.resolve({ id }))
  const setTelegramLinkToken = vi.fn(() => Promise.resolve({}))

  const repository = {
    findById: vi.fn(() => Promise.resolve(truck ? { ...truck } : null)),
    revokePasswordWithLinkToken,
    setTelegramLinkToken,
  }

  const telegram = { buildLinkUrl: vi.fn((token: string) => `https://t.me/test_bot?start=${token}`) }

  const service = new AdminService(
    {} as never,
    {} as never,
    repository as never,
    telegram as never,
    {} as never,
    {} as never,
  )

  return { service, repository, revokePasswordWithLinkToken, setTelegramLinkToken, telegram }
}

/** The token the service minted, recovered from the single write it performed */
function tokenFromWrite(write: ReturnType<typeof vi.fn>): string {
  return write.mock.calls[0]![1] as string
}

describe('resetting a password', () => {
  it('revokes and arms the new link in a single write', async () => {
    const { service, revokePasswordWithLinkToken, setTelegramLinkToken } = buildService()

    await service.resetDriverPassword(4)

    expect(revokePasswordWithLinkToken).toHaveBeenCalledOnce()
    // The two-call version is the one that can strand a driver. If this ever
    // fails because the reset was rebuilt out of the existing single-purpose
    // methods, read the repository comment before "fixing" the test.
    expect(setTelegramLinkToken).not.toHaveBeenCalled()
  })

  it('returns a link built from the token it just stored', async () => {
    const { service, revokePasswordWithLinkToken, telegram } = buildService()

    const result = await service.resetDriverPassword(4)

    const stored = tokenFromWrite(revokePasswordWithLinkToken)
    expect(telegram.buildLinkUrl).toHaveBeenCalledWith(stored)
    expect(result.telegramLinkUrl).toContain(stored)
  })

  it('stores a token that expires, roughly a week out', async () => {
    const { service, revokePasswordWithLinkToken } = buildService()

    await service.resetDriverPassword(4)

    const expiresAt = revokePasswordWithLinkToken.mock.calls[0]![2] as Date
    const days = (expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000)
    // A link with no expiry, or one that outlives the reset by months, is a
    // standing credential for an account whose password we have just removed.
    expect(days).toBeGreaterThan(6.9)
    expect(days).toBeLessThan(7.1)
  })

  it('mints a different token on every reset', async () => {
    const first = buildService()
    const second = buildService()

    await first.service.resetDriverPassword(4)
    await second.service.resetDriverPassword(4)

    expect(tokenFromWrite(first.revokePasswordWithLinkToken)).not.toBe(
      tokenFromWrite(second.revokePasswordWithLinkToken),
    )
  })

  it('reports whether there was a password to revoke', async () => {
    const had = await buildService(WITH_PASSWORD).service.resetDriverPassword(4)
    const hadNot = await buildService(WITHOUT_PASSWORD).service.resetDriverPassword(9)

    // Read BEFORE the write, or it would always answer "no" — the write is what
    // makes it false. The panel uses this to tell "we revoked a live password"
    // from "here is the link they never used".
    expect(had.hadPassword).toBe(true)
    expect(hadNot.hadPassword).toBe(false)
  })

  it('still arms a link for a driver who never had a password', async () => {
    // Not an error case: an approved driver who never tapped their original
    // link is in exactly this state, and refusing would leave the panel with a
    // button that fails for the people who most need it.
    const { service, revokePasswordWithLinkToken } = buildService(WITHOUT_PASSWORD)

    const result = await service.resetDriverPassword(9)

    expect(revokePasswordWithLinkToken).toHaveBeenCalledOnce()
    expect(result.telegramLinkUrl).toContain(tokenFromWrite(revokePasswordWithLinkToken))
  })

  it('rejects an id that does not exist, before writing anything', async () => {
    const { service, revokePasswordWithLinkToken } = buildService(null)

    await expect(service.resetDriverPassword(404)).rejects.toBeInstanceOf(NotFoundException)
    expect(revokePasswordWithLinkToken).not.toHaveBeenCalled()
  })

  it('passes the id, the token and the expiry — and nothing else', async () => {
    // `telegramChatId` must not appear here or anywhere near this path: the
    // driver stays linked so contact notices keep working while they are
    // between passwords. Re-pointing the chat is linkTelegramChat's job, and
    // only when the driver taps with a different account.
    const { service, revokePasswordWithLinkToken } = buildService()

    await service.resetDriverPassword(4)

    const args = revokePasswordWithLinkToken.mock.calls[0]!
    expect(args).toHaveLength(3)
    expect(args[0]).toBe(4)
    expect(typeof args[1]).toBe('string')
    expect(args[2]).toBeInstanceOf(Date)
  })
})
