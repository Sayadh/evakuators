import { FetchError } from 'ofetch'
import { describe, expect, it } from 'vitest'
import { extractErrorMessage } from '~/utils/errors'

/** Builds a FetchError the way ofetch actually attaches a parsed JSON body — via `.data`, not the constructor. */
function fetchErrorWithBody(data: unknown): FetchError {
  const error = new FetchError('[POST] "/x": 400 Bad Request')
  Object.assign(error, { data })
  return error
}

describe('extractErrorMessage', () => {
  it('surfaces the backend’s real message when it is a single string', () => {
    const error = fetchErrorWithBody({ message: 'Այս հեռախոսահամարն արդեն զբաղված է' })
    expect(extractErrorMessage(error, 'fallback')).toBe('Այս հեռախոսահամարն արդեն զբաղված է')
  })

  it('joins a validation array into one readable message', () => {
    const error = fetchErrorWithBody({ message: ['«phone» դաշտը պարտադիր է', '«name» դաշտը պարտադիր է'] })
    expect(extractErrorMessage(error, 'fallback')).toBe(
      '«phone» դաշտը պարտադիր է, «name» դաշտը պարտադիր է',
    )
  })

  it('falls back when the FetchError body has no usable message', () => {
    // The exact shape a connection-level failure produces (nginx cutting the
    // connection before any JSON body exists — see the module doc comment).
    const error = fetchErrorWithBody(undefined)
    expect(extractErrorMessage(error, 'Բարձրացնել չհաջողվեց')).toBe('Բարձրացնել չհաջողվեց')
  })

  it('falls back instead of leaking a raw network error message', () => {
    // The real-world case this exists for: the browser's own "Failed to
    // fetch" must never reach a driver's screen verbatim.
    const error = new TypeError('Failed to fetch')
    expect(extractErrorMessage(error, 'Բարձրացնել չհաջողվեց')).toBe('Բարձրացնել չհաջողվեց')
  })

  it('falls back for a completely unrecognized thrown value', () => {
    expect(extractErrorMessage('not even an Error', 'fallback')).toBe('fallback')
  })
})
