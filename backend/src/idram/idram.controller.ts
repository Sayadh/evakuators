import { Body, Controller, Header, HttpCode, Post } from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import type { IdramCallbackBody } from './idram-callback'
import { IDRAM_OK } from './idram.constants'
import { IdramService } from './idram.service'

/**
 * RESULT_URL — `POST /api/v1/idram/result`.
 *
 * Registered with Idram as the one address both of their callbacks go to: the
 * preliminary "is this order real" request and, after the customer pays, the
 * confirmation. Public and unauthenticated, because the caller is Idram's
 * server and has no session to present; what stands in for authentication is
 * the checksum on the confirmation (see `idram-checksum.ts`).
 *
 * Provider at the controller root, matching `/api/v1/telegram/webhook` — the
 * codebase's existing shape for "a third party posts here" — and `result`
 * rather than `webhook` because that is the name the provider's own
 * documentation uses, so the next reader can match the two without guessing.
 */
@Controller('idram')
export class IdramController {
  constructor(private readonly idram: IdramService) {}

  /**
   * Answers `OK`, and nothing else, when the callback is accepted.
   *
   * The body is what Idram reads, not the status code: "OK" without any html
   * formatting means accepted, and anything else means refused. So this always
   * answers 200 with a plain-text body, and never throws — an exception would
   * be turned into a JSON error page by `AllExceptionsFilter`, which is a
   * perfectly good refusal but a much worse thing to read in a payment
   * provider's logs. Refusals are loud in OUR logs instead, where someone can
   * act on them (see IdramService).
   *
   * Refusing has real consequences by design: on the preliminary request it
   * stops the charge from happening at all, and on the confirmation it makes
   * Idram email the merchant address rather than consider us notified. Both
   * are the right outcome when we cannot verify what we were sent.
   *
   * The body arrives as `x-www-form-urlencoded` and is taken as a raw record
   * rather than a DTO — see `idram-callback.ts` for why the global
   * `forbidNonWhitelisted` pipe must not see it.
   *
   * Throttled well above the global 60/minute: these are machine-to-machine
   * calls from a small set of Idram addresses, and a 429 answered to a payment
   * provider is a payment lost. Still bounded rather than skipped — an
   * unbounded public endpoint is its own problem.
   */
  @Throttle({ default: { limit: 600, ttl: 60_000 } })
  @Post('result')
  @HttpCode(200)
  @Header('Content-Type', 'text/plain; charset=utf-8')
  async result(@Body() body: IdramCallbackBody): Promise<string> {
    const accepted = await this.idram.handleCallback(body)
    // Deliberately not "FAIL" or an error string: Idram looks for OK and
    // treats everything else the same, so the refusal text is only ever read
    // by a person debugging, and saying what happened helps them.
    return accepted ? IDRAM_OK : 'REFUSED'
  }
}
