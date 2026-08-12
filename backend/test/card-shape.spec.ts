import 'reflect-metadata'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * "A listing is not a profile" (CLAUDE.md), asserted rather than trusted.
 *
 * `GET /tow-trucks` is unauthenticated and returns every active driver at once,
 * so a field added to the card shape is a field published in bulk about the
 * whole fleet. The endpoint used to return the full profile — every driver's
 * secondary phone, WhatsApp, Telegram and email, in one request, to anyone —
 * and the fix was to narrow the Prisma `select`.
 *
 * That fix then partly rotted, in the way these things do: `whatsapp` stayed in
 * the card on the written justification that "the card has a WhatsApp button".
 * It never had one. `TowTruckContactActions` — the component with the WhatsApp,
 * Telegram and email buttons — is mounted only on the profile page, and
 * `TowTruckCard.vue` renders a single «Զանգահարել» link. So the field was
 * published for the whole fleet in exchange for nothing, and nothing failed,
 * because a stale comment is not a test.
 *
 * This is that test. It is deliberately a source-text assertion over the
 * `select` itself: the risk is not that the mapper misbehaves, it is that
 * somebody adds one line to `CARD_SELECT` without asking what renders it.
 */

const SRC = fileURLToPath(new URL('../src/tow-trucks/', import.meta.url))
const repository = readFileSync(`${SRC}tow-trucks.repository.ts`, 'utf8')
const types = readFileSync(`${SRC}tow-truck.types.ts`, 'utf8')

/** The `CARD_SELECT` object literal, isolated from the rest of the file */
const cardSelect = repository.slice(
  repository.indexOf('const CARD_SELECT'),
  repository.indexOf('satisfies Prisma.TowTruckSelect'),
)

/**
 * The `TowTruckCardApi` interface body, and nothing else — stopping at the
 * closing brace rather than at the next interface, so a neighbour's doc comment
 * cannot satisfy or break these assertions.
 */
const cardApiStart = types.indexOf('export interface TowTruckCardApi')
const cardApi = types.slice(cardApiStart, types.indexOf('\n}', cardApiStart))

describe('the card publishes exactly one contact channel', () => {
  it.each(['whatsapp', 'telegram', 'email', 'secondaryPhone'])(
    'does not select %s for every driver in the fleet',
    (field) => {
      expect(cardSelect).not.toContain(field)
      expect(cardApi).not.toContain(field)
    },
  )

  it('still carries the main phone, which is the button the card renders', () => {
    // The rule is "one channel", not "none" — a listing whose cards cannot be
    // called is not a safer listing, it is a broken one.
    expect(cardSelect).toContain('phone: true')
    expect(cardApi).toContain('phone: string')
  })
})

describe('the card withholds the rest of the profile too', () => {
  it.each(['description', 'plateNumber', 'pricePerKm', 'platformLengthM', 'passwordHash'])(
    'does not select %s',
    (field) => {
      expect(cardSelect).not.toContain(field)
    },
  )

  it('takes one image, not the whole gallery', () => {
    // A list of 200 trucks with every photo URL each is the payload problem
    // half of the same bug — see docs/api-reference.md § "List vs detail".
    expect(cardSelect).toContain('take: 1')
  })
})
