/**
 * MANUAL SYNC POINT — mirrors `backend/src/privacy-consent/privacy-consent.text.ts`.
 *
 * The backend owns this text. It hashes its own copy and stores that hash in
 * every consent record, so the string there is what a driver's consent legally
 * attests to; the copy here exists only so the dialog has something to render
 * without a round-trip before the driver has even decided to submit.
 *
 * That means a difference between the two files is a real defect, not a
 * cosmetic one: the driver would be ticking a box next to text that is not the
 * text being recorded. `backend/test/privacy-consent-sync.spec.ts` reads this
 * file as text and fails if any paragraph, the checkbox label or the version
 * has drifted — the same guard the geography and service-slug constants use
 * (see CLAUDE.md § manual sync points).
 *
 * Nothing here is sent to the API except the version. The client never computes
 * or submits a hash — see `AcceptPrivacyConsentDto` for why a client-supplied
 * hash would prove nothing.
 */

/** Bumping this on BOTH sides is what re-asks every driver — see the backend file */
export const PRIVACY_POLICY_VERSION = '1.1'

export const PRIVACY_POLICY_EFFECTIVE_DATE = '21 օգոստոսի 2026 թ.'

export const PRIVACY_DATA_CONTROLLER = '«ՌՈՍԱՄԻ» ՍՊԸ'

/** The dialog's heading — the first paragraph of the canonical text */
export const PRIVACY_CONSENT_TITLE = 'Ձեր տվյալների օգտագործման և հրապարակման համաձայնություն'

/**
 * The body, one `<p>` per entry.
 *
 * The heading above is deliberately NOT repeated here: it is
 * `PRIVACY_CONSENT_PARAGRAPHS[0]` on the backend, and the dialog renders it as
 * a heading rather than as body copy. The sync test knows about that split and
 * checks the two arrays against the backend's one.
 */
export const PRIVACY_CONSENT_PARAGRAPHS: readonly string[] = [
  'Evakuators.am-ում Ձեր էջը ստեղծելու և հաճախորդներին Ձեզ գտնելու հնարավորություն տալու համար օգտագործվելու են գրանցման ընթացքում տրամադրած տվյալները։',
  'Կայքում հրապարակվելու են Ձեր անունը և ազգանունը, հեռախոսահամարը, WhatsApp/Telegram կապի միջոցները, մեքենայի տվյալներն ու լուսանկարները, ծառայությունները, գները, սպասարկման տարածքները, ազատ երթուղիները և նկարագրությունը։',
  'Ձեր գաղտնաբառը և հիմնական գտնվելու վայրի ճշգրիտ կոորդինատները չեն հրապարակվի։ Կոորդինատներն օգտագործվելու են միայն հեռավորությունը հաշվարկելու և մոտակա վարորդներին ցուցադրելու համար։',
  'Դուք ցանկացած ժամանակ կարող եք պահանջել ուղղել կամ հեռացնել Ձեր տվյալները կամ դադարեցնել Ձեր էջի հրապարակումը։',
]

/**
 * Rendered as its own paragraph, with «Գաղտնիության քաղաքականությունում» turned
 * into a link to `/privacy` — which is why it is separate from the array above
 * rather than its last entry. The link opens in a new tab: a driver who has
 * filled in a 40-field registration form and taps a same-tab link loses all of
 * it, which is the one failure this dialog must not cause.
 */
export const PRIVACY_CONSENT_POLICY_SENTENCE_BEFORE = 'Մանրամասները ներկայացված են «'
export const PRIVACY_CONSENT_POLICY_LINK_LABEL = 'Գաղտնիության քաղաքականությունում'
export const PRIVACY_CONSENT_POLICY_SENTENCE_AFTER = '»։'

export const PRIVACY_CONSENT_CHECKBOX_LABEL =
  'Ծանոթացել եմ Գաղտնիության քաղաքականությանը և համաձայն եմ իմ տվյալների օգտագործմանը և վերը նշված տվյալների՝ Evakuators.am-ում հրապարակմանը'

export const PRIVACY_CONSENT_CONFIRM_LABEL = 'Համաձայն եմ և շարունակում եմ'
export const PRIVACY_CONSENT_CANCEL_LABEL = 'Չեղարկել'
