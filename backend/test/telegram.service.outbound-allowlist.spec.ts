import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConfigService } from '@nestjs/config'
import { TelegramService } from '../src/telegram/telegram.service'

/**
 * `TELEGRAM_OUTBOUND_ALLOWED_CHAT_IDS` exists for exactly one situation: a
 * staging deploy sharing production's real bot token (see
 * docs/deployment.md § "Staging environment") must never be able to message
 * a real driver, even though its copy of the database contains real,
 * already-linked chat ids. These tests pin the two things that guarantee
 * that: an unlisted chat id never reaches the network, and the allowlist is
 * a no-op — today's production behaviour — when left empty.
 */

/** A `ConfigService` with only the two keys `TelegramService` reads */
function fakeConfig(outboundAllowedChatIds: string[]): ConfigService {
  const telegram = { botToken: 'test-token', botUsername: 'TestBot', outboundAllowedChatIds }
  return {
    getOrThrow: (key: string) => (key === 'telegram' ? telegram : 'https://staging.evakuators.am'),
  } as unknown as ConfigService
}

describe('TelegramService outbound allowlist', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }))
  })

  afterEach(() => {
    fetchSpy.mockRestore()
  })

  it('makes no network call at all for a chat id not on the list', async () => {
    const service = new TelegramService(fakeConfig(['111']))

    await service.sendMessage('222', 'a real driver should never see this')

    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('resolves normally for a skipped send — the caller cannot tell it apart from a real one', async () => {
    const service = new TelegramService(fakeConfig(['111']))

    await expect(service.sendMessage('222', 'skipped')).resolves.toBeUndefined()
  })

  it('sends for a chat id that IS on the list', async () => {
    const service = new TelegramService(fakeConfig(['111']))

    await service.sendMessage('111', 'the tester\'s own account')

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(fetchSpy.mock.calls[0]![0]).toContain('/sendMessage')
  })

  it('compares chat ids as strings, so a numeric and a string id for the same chat match', async () => {
    const service = new TelegramService(fakeConfig(['111']))

    await service.sendMessage(111, 'numeric form')

    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  /**
   * The guarantee for every environment that ISN'T deliberately restricted —
   * production, and any deploy that never sets this variable. An empty list
   * must never accidentally start blocking real sends.
   */
  it('is unrestricted — production behaviour — when the list is empty', async () => {
    const service = new TelegramService(fakeConfig([]))

    await service.sendMessage('anyone', 'unrestricted')

    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })
})
