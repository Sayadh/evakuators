import { IsBoolean, IsString, MaxLength, Equals } from 'class-validator'

/**
 * What a client sends to accept the privacy consent.
 *
 * ## Two fields, and deliberately not a third
 *
 * There is **no `consentTextHash` here, and there must never be one.** A hash
 * supplied by the caller proves only that the caller can run SHA-256; it says
 * nothing whatever about what was rendered on their screen. Accepting one would
 * let a crafted request store an attestation to text nobody was ever shown —
 * which is worse than storing no attestation at all, because it looks like
 * evidence. The server hashes its own canonical copy, every time. See
 * `privacy-consent.text.ts`.
 *
 * The version, by contrast, is worth taking from the client precisely because
 * it is *checked* rather than trusted: comparing it against
 * `PRIVACY_POLICY_VERSION` is what catches a tab that has been open since
 * before a policy change and would otherwise consent, in perfect good faith, on
 * behalf of a document it never displayed.
 */
export class AcceptPrivacyConsentDto {
  /**
   * Must equal the server's current `PRIVACY_POLICY_VERSION`.
   *
   * The equality check itself lives in the service, not in an `@Equals()` here,
   * for two reasons: the constant would have to be imported into a decorator
   * evaluated at class-definition time, and — more importantly — a mismatch
   * deserves a specific, actionable message ("reload the page, the policy has
   * changed") rather than class-validator's generic one. The length bound stays
   * here, because that is a shape rule and not a policy rule.
   */
  @IsString()
  @MaxLength(16)
  policyVersion!: string

  /**
   * The checkbox. `@Equals(true)` rather than a plain `@IsBoolean()`, so that
   * `false` is rejected by the validation layer with the same finality as a
   * missing field.
   *
   * This is not the frontend's disabled-button rule restated — that one is a
   * courtesy to the driver and is trivially bypassed. This is the boundary the
   * spec's "do not trust frontend validation alone" refers to: an unticked box
   * cannot become a stored consent no matter what reaches the endpoint.
   */
  @IsBoolean()
  @Equals(true, {
    message: 'Համաձայնությունը հաստատելու համար անհրաժեշտ է նշել վանդակը',
  })
  accepted!: boolean
}
