import { createHash } from 'node:crypto'

/**
 * How many hex characters of the digest reach a log line. 12 hex chars = 48
 * bits, which is far more than enough to tell two tokens apart in a log and
 * nowhere near enough to attack: the token itself is 24 random bytes
 * (192 bits, see AdminService.generateTelegramLink), so the digest cannot be
 * reversed and the truncation cannot be walked back to the input.
 */
const FINGERPRINT_LENGTH = 12

/**
 * A non-reversible, stable label for a Telegram link token.
 *
 * The token IS the entire security boundary for account linking
 * (docs/auth-and-security.md), so it must never appear in a log — logs live in
 * ~/.pm2/logs, are not rotated unless pm2-logrotate was installed by hand, and
 * end up in backups and anyone's `pm2 logs` session. A raw prefix would be no
 * better in kind, only in degree: it still leaks part of a live credential.
 *
 * A hash keeps the one thing the log lines actually need — the SAME token
 * always produces the SAME fingerprint, so "the token the driver tapped" can be
 * matched against "the token we issued" after the fact, which is how a stale
 * link (overwritten by a later regenerate) is told apart from one that was
 * never issued at all.
 *
 * Deliberately unsalted: the point is cross-process, cross-restart
 * correlation between AdminService (issuing) and TelegramWebhookController
 * (redeeming). A pepper would make the two sides disagree unless it were
 * shared, and it would buy nothing — the input is not guessable.
 */
export function telegramTokenFingerprint(token: string): string {
  return createHash('sha256').update(token).digest('hex').slice(0, FINGERPRINT_LENGTH)
}
