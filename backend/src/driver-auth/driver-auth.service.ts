import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
  forwardRef,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import bcrypt from 'bcrypt'
import { PrivacyConsentService } from '../privacy-consent/privacy-consent.service'
import { TowTrucksRepository } from '../tow-trucks/tow-trucks.repository'
import { BCRYPT_ROUNDS, generateTemporaryPassword } from './driver-password'

const TOKEN_TTL = '30d'

/**
 * Compared against when no driver matches the phone, so `login()` always pays
 * the same bcrypt cost. Without it, "unknown number" answers measurably faster
 * than "wrong password" and the endpoint becomes a way to enumerate which
 * numbers are registered — which, on a site that publishes drivers' phone
 * numbers anyway, matters less for privacy than for handing an attacker a
 * pre-filtered list of accounts worth guessing at. Same constant and same
 * reasoning as AdminAuthService.
 */
const DUMMY_HASH = '$2b$12$CwTycUXWue0Thq9StjUM0uJ8G8Kn8UYwUIQEEcxJp/nDdX7O/HgFa'

export interface DriverSession {
  token: string
  towTruckId: number
  slug: string
  /**
   * True while the password just used is still the one we generated. The
   * dashboard blocks on it; it is returned here rather than read from
   * `GET /my/tow-truck` so the frontend knows before it renders anything.
   */
  mustChangePassword: boolean
  /**
   * True when this driver has no live consent at the current policy version.
   *
   * Returned from login for exactly the same reason `mustChangePassword` is:
   * the dashboard has to know before it renders anything, and a driver who owes
   * a consent must not see a flash of the profile they cannot yet manage.
   *
   * It is true for every driver approved before this feature existed — ~100 of
   * them — because nothing was backfilled and nothing should have been. See
   * `DriverPrivacyConsent` in schema.prisma.
   *
   * The frontend caches this in `localStorage` alongside the token, so it is
   * NOT the last word: a version bump, or a consent given in another tab, would
   * leave the cached copy stale. `GET /my/tow-truck/privacy-consent` is
   * authoritative and the dashboard re-reads it on load.
   */
  requiresPrivacyConsent: boolean
}

/**
 * Driver login: phone + password.
 *
 * ## Why this replaced Telegram OTP
 *
 * The old flow made the Telegram bot load-bearing for authentication, and
 * `telegramChatId` is `@unique` — so one Telegram account could hold the keys
 * to exactly one driver profile, and a driver who muted or blocked the bot
 * (which also carries contact notices, with no opt-out) locked themselves out
 * with nothing on screen to explain why. Both of those are gone: Telegram now
 * carries notices and one password handover, and nothing that a driver needs
 * every time they log in.
 *
 * ## Where a password comes from
 *
 * Never from a registration form, and never chosen by an admin. The first (and
 * only) time we mint one is when a driver taps their Telegram deep link —
 * `TelegramWebhookController.handleStart` calls `issueTemporaryPassword()` and
 * puts the result in the same message that confirms the link. That is the one
 * channel where we are already talking to a driver we have some reason to
 * believe is the right one.
 *
 * `mustChangePassword` then governs everything downstream: the dashboard will
 * not let them do anything else until it is cleared, and a later re-link
 * re-issues a password only while it is still true. Once a driver owns their
 * password, tapping a fresh Telegram link is no longer a way to reset it —
 * possession of a link proves possession of a link, not of an identity (see
 * docs/auth-and-security.md).
 */
@Injectable()
export class DriverAuthService {
  private readonly logger = new Logger(DriverAuthService.name)
  private readonly secret: string

  constructor(
    private readonly towTrucksRepository: TowTrucksRepository,
    private readonly jwt: JwtService,
    // forwardRef: PrivacyConsentModule needs DriverJwtGuard from this module,
    // and this service needs its status query — a declared cycle rather than a
    // second copy of "is there a live consent at the current version". See
    // PrivacyConsentModule.
    @Inject(forwardRef(() => PrivacyConsentService))
    private readonly privacyConsent: PrivacyConsentService,
    config: ConfigService,
  ) {
    this.secret = config.getOrThrow<string>('driverJwtSecret')
  }

  async login(phone: string, password: string): Promise<DriverSession> {
    const towTruck = await this.towTrucksRepository.findActiveByMainPhone(phone)

    // Always runs, even with no match and even when the row has no hash yet —
    // see DUMMY_HASH. `bcrypt.compare` against the dummy can only ever be
    // false, so this cannot accidentally authenticate anyone.
    const isValid = await bcrypt.compare(password, towTruck?.passwordHash ?? DUMMY_HASH)

    if (!towTruck || !towTruck.passwordHash || !isValid) {
      // One message for all three failures. Splitting them would tell an
      // unauthenticated caller which numbers exist and which of those have
      // finished setting up — and a driver who genuinely mistyped either field
      // is helped by the hint below, not by knowing which half was wrong.
      throw new UnauthorizedException(
        'Սխալ հեռախոսահամար կամ գաղտնաբառ։ Եթե դեռ գաղտնաբառ չեք ստացել, դիմեք ադմինիստրատորին։',
      )
    }

    // Read AFTER authentication succeeded, never before: it is one more query,
    // and running it on the failure path would both waste it and make a failed
    // login measurably slower for a driver who exists than for one who does not
    // — reintroducing, by the back door, the timing difference DUMMY_HASH above
    // exists to remove.
    const requiresPrivacyConsent = await this.privacyConsent.requiresConsent(towTruck.id)

    return {
      token: await this.jwt.signAsync(
        { sub: towTruck.id },
        { secret: this.secret, expiresIn: TOKEN_TTL },
      ),
      towTruckId: towTruck.id,
      slug: towTruck.slug,
      mustChangePassword: towTruck.mustChangePassword,
      requiresPrivacyConsent,
    }
  }

  /**
   * Mints a temporary password for a driver who does not have one of their own,
   * and returns it in plaintext — the only moment it exists in readable form,
   * for exactly as long as it takes the caller to put it in a Telegram message.
   *
   * Returns `null` when the driver has already set their own password, and that
   * return value is the security boundary of the whole Telegram re-link path:
   * the caller cannot tell the difference between "we chose not to reset it"
   * and "there was nothing to send", which is what stops a re-link from being
   * a password reset. See handleStart().
   *
   * A driver still holding OUR password gets a fresh one rather than the same
   * one again. That costs nothing (they have not memorised it) and it means the
   * old value — which has been sitting readable in a Telegram chat, possibly one
   * they have since lost access to — stops working the moment a new link is
   * tapped.
   */
  async issueTemporaryPassword(towTruckId: number): Promise<string | null> {
    const towTruck = await this.towTrucksRepository.findById(towTruckId)
    if (!towTruck) throw new NotFoundException(`Էվակուատոր #${towTruckId}-ը չի գտնվել`)

    // Two conditions, and the first is not redundant: a row with no hash has
    // `mustChangePassword: false` (the column's default, and correct — it holds
    // no temporary password because it holds none at all), so testing the flag
    // alone would refuse to ever issue a first password.
    const ownsTheirPassword = towTruck.passwordHash !== null && !towTruck.mustChangePassword
    if (ownsTheirPassword) return null

    const password = generateTemporaryPassword()
    await this.towTrucksRepository.setPassword(towTruckId, await bcrypt.hash(password, BCRYPT_ROUNDS), true)

    this.logger.log(`Issued a temporary password for TowTruck #${towTruckId}`)
    return password
  }

  /**
   * The driver replaces the password they were given (or an older one of their
   * own) with a new one. Clearing `mustChangePassword` is what ends the forced
   * dialog on the dashboard and, from here on, what stops a Telegram re-link
   * from touching this account's password again.
   *
   * Deliberately does NOT invalidate the caller's own session, nor any other:
   * there are no refresh tokens and no session table to revoke against (see
   * docs/auth-and-security.md § "Things that are NOT implemented"), so a logout
   * here would only sign the driver out of the tab they are standing in while
   * changing nothing about a token someone else might hold. Fixing that means
   * session invalidation as a feature, not a line in this method.
   */
  async changePassword(
    towTruckId: number,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const towTruck = await this.towTrucksRepository.findById(towTruckId)
    if (!towTruck) throw new NotFoundException('Ձեր պրոֆիլը չի գտնվել')

    const isValid = await bcrypt.compare(currentPassword, towTruck.passwordHash ?? DUMMY_HASH)
    if (!towTruck.passwordHash || !isValid) {
      // 400, not 401, and the distinction matters beyond taste: the frontend
      // treats ANY 401 on a `/my/*` path as an expired session and logs the
      // driver out (see apiClient.ts). The session here is perfectly valid —
      // it is the confirmation field in the body that is wrong — so answering
      // 401 would throw a driver back to the login page for a typo, with no
      // message surviving the redirect to tell them what happened.
      throw new BadRequestException('Ընթացիկ գաղտնաբառը սխալ է')
    }

    await this.towTrucksRepository.setPassword(
      towTruckId,
      await bcrypt.hash(newPassword, BCRYPT_ROUNDS),
      false,
    )
  }
}
