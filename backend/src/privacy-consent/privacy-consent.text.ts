import { createHash } from 'node:crypto'

/**
 * The consent a driver gives, as the server defines it.
 *
 * ## Why the text lives in the backend and not in the dialog
 *
 * A consent record is only worth keeping if it can answer, years later, "what
 * exactly did this person agree to". The dialog is a Vue component that will be
 * restyled, re-worded and rebuilt; if the stored hash were computed from
 * whatever it happened to render, the record would prove nothing — the string
 * it attests to would already be gone.
 *
 * So the canonical wording is here, the hash is derived from it here, and the
 * frontend copy is a *rendering* of this text rather than its source. A test
 * (`test/privacy-consent-sync.spec.ts`) reads the frontend file and fails if
 * the two drift, in the same manual-sync-point style the geography constants
 * already use — see CLAUDE.md.
 *
 * ## Why the client's hash is never trusted
 *
 * `AcceptPrivacyConsentDto` deliberately carries **no** hash field. A hash
 * supplied by the caller proves only that the caller can run SHA-256; it says
 * nothing about what was on their screen, and accepting it would let a crafted
 * request store an attestation to text nobody ever showed anyone. The server
 * hashes its own text, always, and the only thing the client is asked to state
 * is the version — which is checked against `PRIVACY_POLICY_VERSION` below, so
 * a stale tab cannot silently consent on behalf of a policy it never displayed.
 */

/**
 * Bumping this is the whole re-consent mechanism.
 *
 * `hasCurrentConsent` matches on this exact string, so changing it to `'1.2'`
 * makes every stored `'1.1'` row stop counting — every driver is asked again,
 * with no migration, no backfill and no data deleted. The old rows stay exactly
 * as they are: they are still true statements about what somebody agreed to on
 * the day they agreed to it.
 *
 * A version bump is therefore a *decision*, not a formality. Change it when the
 * text below changes in a way that alters what is being agreed to; do not
 * change it for a typo fix, which would put a modal in front of a hundred
 * drivers for no reason.
 */
export const PRIVACY_POLICY_VERSION = '1.1'

/** Effective date shown on `/privacy` and in the dialog's footer */
export const PRIVACY_POLICY_EFFECTIVE_DATE = '21 օգոստոսի 2026 թ.'

/** The legal entity that processes the data — «ՌՈՍԱՄԻ» ՍՊԸ */
export const PRIVACY_DATA_CONTROLLER = '«ՌՈՍԱՄԻ» ՍՊԸ'

/**
 * The consent text, verbatim, as one array of paragraphs.
 *
 * An array rather than one template literal because the dialog renders these as
 * separate `<p>` elements and a single string would have to be split back
 * apart — and because a joined string's exact whitespace (which is what gets
 * hashed) would then depend on how the file happens to be indented. Joined with
 * `\n` in `PRIVACY_CONSENT_TEXT` below, which is deterministic regardless of
 * formatting.
 */
export const PRIVACY_CONSENT_PARAGRAPHS: readonly string[] = [
  'Ձեր տվյալների օգտագործման և հրապարակման համաձայնություն',
  'Evakuators.am-ում Ձեր էջը ստեղծելու և հաճախորդներին Ձեզ գտնելու հնարավորություն տալու համար օգտագործվելու են գրանցման ընթացքում տրամադրած տվյալները։',
  'Կայքում հրապարակվելու են Ձեր անունը և ազգանունը, հեռախոսահամարը, WhatsApp/Telegram կապի միջոցները, մեքենայի տվյալներն ու լուսանկարները, ծառայությունները, գները, սպասարկման տարածքները, ազատ երթուղիները և նկարագրությունը։',
  'Ձեր գաղտնաբառը և հիմնական գտնվելու վայրի ճշգրիտ կոորդինատները չեն հրապարակվի։ Կոորդինատներն օգտագործվելու են միայն հեռավորությունը հաշվարկելու և մոտակա վարորդներին ցուցադրելու համար։',
  'Դուք ցանկացած ժամանակ կարող եք պահանջել ուղղել կամ հեռացնել Ձեր տվյալները կամ դադարեցնել Ձեր էջի հրապարակումը։',
  'Մանրամասները ներկայացված են «Գաղտնիության քաղաքականությունում»։',
]

/** The label next to the checkbox — part of the agreement, so part of the hash */
export const PRIVACY_CONSENT_CHECKBOX_LABEL =
  'Ծանոթացել եմ Գաղտնիության քաղաքականությանը և համաձայն եմ իմ տվյալների օգտագործմանը և վերը նշված տվյալների՝ Evakuators.am-ում հրապարակմանը'

/**
 * Everything the driver agreed to, as one canonical string.
 *
 * The checkbox label is included because the checkbox is the act of consenting
 * — a record that hashed only the explanation above it would not attest to the
 * sentence the driver actually ticked. The version is included so two policies
 * that happened to share wording could still never produce the same hash.
 */
export const PRIVACY_CONSENT_TEXT = [
  `v${PRIVACY_POLICY_VERSION}`,
  ...PRIVACY_CONSENT_PARAGRAPHS,
  PRIVACY_CONSENT_CHECKBOX_LABEL,
].join('\n')

/**
 * SHA-256 of the text above, hex — computed once at module load, because the
 * input is a compile-time constant and re-hashing it per request would be
 * pointless work on a path a hundred drivers hit at once when a version bumps.
 *
 * Plain SHA-256, not bcrypt: this is an integrity fingerprint of a public
 * document, not a secret to be brute-forced. It has to be reproducible by
 * anyone holding the same text — that is the entire point of storing it — so a
 * salted, deliberately-slow KDF would defeat the purpose. Same reasoning, and
 * the same construction, as `AnalyticsVisitorKeyService`'s note on when sha256
 * is the right tool and when bcrypt is.
 *
 * UTF-8 is explicit. The text is Armenian, and a default-encoding surprise
 * would change every hash silently.
 */
export const PRIVACY_CONSENT_TEXT_HASH = createHash('sha256')
  .update(PRIVACY_CONSENT_TEXT, 'utf8')
  .digest('hex')
