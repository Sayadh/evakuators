import { describe, expect, it, vi } from 'vitest'
import { ImagesRepository } from '../src/images/images.repository'
import type { PrismaService } from '../src/prisma/prisma.service'

/**
 * `findUnattachedByIds` is the ownership check between a driver's photo
 * upload and letting it into a gallery — see the method's own doc comment for
 * why it exists. This file exists for one line inside it.
 *
 * ## The bug
 *
 * The `profileChangeRequestId` filter used to read
 * `{ in: [null, allowProfileChangeRequestId] } }` when an approval passed its
 * own request id. `null` inside a Prisma `in` array is not "also match a null
 * row": SQL's own `IN` never matches `NULL` (`x IN (NULL, 5)` is
 * `x = NULL OR x = 5`, and `x = NULL` is neither true nor false), and Prisma's
 * client-side validation goes further and rejects the literal outright —
 * `PrismaClientValidationError`, thrown before any SQL is even built.
 *
 * That error is not an `HttpException`, so nothing here turns it into a 4xx —
 * it reached the client as a bare 500, on every approval that changed
 * `imageIds`, which is any approval of a photo change at all. Confirmed
 * against a real Postgres (not asserted here — see the fix's own comment):
 * the broken shape threw `PrismaClientValidationError` and the `OR` shape
 * below returned the row correctly.
 *
 * `applyGallery`, in the same file, already knew this and used `OR` — the
 * comment was two methods above the bug the whole time.
 */

function fakePrisma() {
  const findMany = vi.fn(async () => [])
  return { prisma: { towTruckImage: { findMany } } as unknown as PrismaService, findMany }
}

describe('ImagesRepository.findUnattachedByIds', () => {
  it('never puts a literal null inside an "in" filter', async () => {
    const { prisma, findMany } = fakePrisma()

    await new ImagesRepository(prisma).findUnattachedByIds([2], 99)

    const where = findMany.mock.calls[0]![0].where
    // `field: null` (IS NULL) is fine and appears deliberately below — what
    // must never come back is `null` as an ELEMENT of an `in` array, which is
    // the exact shape that threw. `"in":[...null` catches `in: [null, 99]`
    // without also matching the harmless bare-null filters elsewhere in the
    // same object.
    expect(JSON.stringify(where)).not.toMatch(/"in":\[[^\]]*null/)
    expect(where.profileChangeRequestId).toBeUndefined()
    expect(where.OR).toEqual([
      { profileChangeRequestId: null },
      { profileChangeRequestId: 99 },
    ])
  })

  it('at submission time (no request to admit yet), only a genuinely unclaimed photo matches', async () => {
    const { prisma, findMany } = fakePrisma()

    await new ImagesRepository(prisma).findUnattachedByIds([2])

    const where = findMany.mock.calls[0]![0].where
    expect(where.OR).toEqual([{ profileChangeRequestId: null }])
  })

  it('still requires no truck and no registration request either way', async () => {
    const { prisma, findMany } = fakePrisma()

    await new ImagesRepository(prisma).findUnattachedByIds([1, 2], 5)

    const where = findMany.mock.calls[0]![0].where
    expect(where.id).toEqual({ in: [1, 2] })
    expect(where.towTruckId).toBeNull()
    expect(where.registrationRequestId).toBeNull()
  })

  it('is a no-op for an empty id list, without calling Prisma at all', async () => {
    const { prisma, findMany } = fakePrisma()

    await expect(new ImagesRepository(prisma).findUnattachedByIds([])).resolves.toEqual([])
    expect(findMany).not.toHaveBeenCalled()
  })
})
