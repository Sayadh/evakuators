import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  PRIVACY_CONSENT_CANCEL_LABEL,
  PRIVACY_CONSENT_CHECKBOX_LABEL,
  PRIVACY_CONSENT_CONFIRM_LABEL,
  PRIVACY_CONSENT_PARAGRAPHS,
  PRIVACY_CONSENT_POLICY_LINK_LABEL,
  PRIVACY_CONSENT_TITLE,
  PRIVACY_DATA_CONTROLLER,
  PRIVACY_POLICY_EFFECTIVE_DATE,
  PRIVACY_POLICY_VERSION,
} from '~/constants/privacyConsent'

/**
 * The frontend half of the consent feature.
 *
 * The backend owns the text and the record; what has to be true over here is
 * that the dialog cannot be confirmed without the box, cannot lose a driver's
 * form to a same-tab navigation, and cannot be got past on the dashboard — plus
 * the accessibility properties the spec asks for, which are structural and so
 * are asserted against the component source rather than by mounting it (this
 * suite has no DOM; see the existing source-reading specs for the convention).
 */

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const read = (path: string): string => readFileSync(`${ROOT}${path}`, 'utf8')

const dialog = read('components/common/PrivacyConsentDialog.vue')
const registerPage = read('pages/register.vue')
const dashboard = read('pages/dashboard.vue')
const privacyPage = read('pages/privacy.vue')
const payload = read('utils/registrationPayload.ts')
const adminReview = read('pages/admin/registrations/[id].vue')

describe('the consent copy is exactly what was specified', () => {
  it('has the four body paragraphs and the title', () => {
    expect(PRIVACY_CONSENT_TITLE).toBe(
      'Ձեր տվյալների օգտագործման և հրապարակման համաձայնություն',
    )
    expect(PRIVACY_CONSENT_PARAGRAPHS).toHaveLength(4)
  })

  it('names what IS published', () => {
    const published = PRIVACY_CONSENT_PARAGRAPHS[1]!
    for (const item of ['անունը և ազգանունը', 'հեռախոսահամարը', 'WhatsApp/Telegram', 'գները']) {
      expect(published).toContain(item)
    }
  })

  it('names what is NOT published, including the coordinates carve-out', () => {
    // The most consequential sentence in the dialog: it is the one that tells a
    // driver their exact parking spot is used for distance only. If it ever
    // drifted out of line with what the API actually returns, the consent would
    // be describing a system we do not run.
    const withheld = PRIVACY_CONSENT_PARAGRAPHS[2]!
    expect(withheld).toContain('գաղտնաբառը')
    expect(withheld).toContain('ճշգրիտ կոորդինատները չեն հրապարակվի')
    expect(withheld).toContain('հեռավորությունը հաշվարկելու')
  })

  it('states the right to correct, remove and unpublish', () => {
    expect(PRIVACY_CONSENT_PARAGRAPHS[3]).toContain('ցանկացած ժամանակ')
  })

  it('has the exact checkbox sentence and button labels', () => {
    expect(PRIVACY_CONSENT_CHECKBOX_LABEL).toBe(
      'Ծանոթացել եմ Գաղտնիության քաղաքականությանը և համաձայն եմ իմ տվյալների օգտագործմանը և վերը նշված տվյալների՝ Evakuators.am-ում հրապարակմանը',
    )
    expect(PRIVACY_CONSENT_CONFIRM_LABEL).toBe('Համաձայն եմ և շարունակում եմ')
    expect(PRIVACY_CONSENT_CANCEL_LABEL).toBe('Չեղարկել')
  })

  it('carries the version, date and controller from the spec', () => {
    expect(PRIVACY_POLICY_VERSION).toBe('1.1')
    expect(PRIVACY_POLICY_EFFECTIVE_DATE).toBe('21 օգոստոսի 2026 թ.')
    expect(PRIVACY_DATA_CONTROLLER).toBe('«ՌՈՍԱՄԻ» ՍՊԸ')
  })
})

describe('the dialog cannot be confirmed without the checkbox', () => {
  it('starts unticked and resets on close', () => {
    // Reset on BOTH edges. A dialog reopened after a failed submit must not
    // come back pre-ticked: the driver would be one click from consenting
    // without re-reading, and a remembered tick looks like consent that was
    // never withdrawn.
    expect(dialog).toContain('const accepted = ref(false)')
    expect(dialog.match(/accepted\.value = false/g)?.length).toBeGreaterThanOrEqual(2)
  })

  it('disables the confirm button until it is ticked', () => {
    expect(dialog).toContain(':disabled="!accepted || submitting"')
  })

  it('guards the handler too, not only the button', () => {
    // A disabled button is a rendering decision; this is the rule. Cheap, and
    // it means the component cannot emit `confirm` unticked however the handler
    // is reached.
    expect(dialog).toContain('if (!accepted.value || props.submitting) return')
  })

  it('never pre-fills the box from a prop or a stored value', () => {
    expect(dialog).not.toMatch(/accepted\s*=\s*ref\(true\)/)
    expect(dialog).not.toContain('localStorage')
  })
})

describe('the policy link cannot cost a driver their form', () => {
  it('opens /privacy in a new tab', () => {
    // Load-bearing, not a style choice: a driver who has filled in a 40-field
    // registration form and follows a same-tab link loses all of it.
    const link = dialog.slice(dialog.indexOf('<NuxtLink to="/privacy"'))
    expect(link).toContain('target="_blank"')
    expect(link).toContain('rel="noopener"')
  })

  it('uses the link label from the shared constants', () => {
    expect(dialog).toContain('PRIVACY_CONSENT_POLICY_LINK_LABEL')
    expect(PRIVACY_CONSENT_POLICY_LINK_LABEL).toBe('Գաղտնիության քաղաքականությունում')
  })
})

describe('accessibility', () => {
  it('is a labelled, described modal dialog', () => {
    expect(dialog).toContain('role="dialog"')
    expect(dialog).toContain('aria-modal="true"')
    expect(dialog).toContain('aria-labelledby="privacy-consent-title"')
    expect(dialog).toContain('aria-describedby="privacy-consent-body"')
  })

  it('traps Tab in both directions', () => {
    // A trap that only holds forwards is not a trap — Shift+Tab from the first
    // element would walk straight out into the page behind it.
    expect(dialog).toContain('event.shiftKey && active === first')
    expect(dialog).toContain('!event.shiftKey && active === last')
  })

  it('maps Escape to Cancel rather than swallowing or silently closing it', () => {
    // Refusing to respond at all traps a keyboard user; closing silently is a
    // dismissal by another name, and this dialog has no third "closed it"
    // state for a caller to interpret.
    const escape = dialog.slice(dialog.indexOf("event.key === 'Escape'"))
    expect(escape.slice(0, 200)).toContain('cancel()')
  })

  it('moves focus into the dialog and gives it back on close', () => {
    expect(dialog).toContain('checkbox.value?.focus()')
    expect(dialog).toContain('previouslyFocused.value?.focus()')
  })

  it('scrolls its body, not the page behind it', () => {
    expect(dialog).toContain("document.body.style.overflow = 'hidden'")
    expect(dialog).toContain('overflow-y: auto')
    // The flex-child fix, without which `overflow-y` silently does nothing.
    expect(dialog).toContain('min-height: 0')
  })

  it('keeps the buttons outside the scrollable region', () => {
    // Otherwise a short phone turns the dialog into a scroll-hunt for the
    // confirm button.
    const bodyEnd = dialog.indexOf('</div>', dialog.indexOf('id="privacy-consent-body"'))
    expect(dialog.indexOf('consent__actions')).toBeGreaterThan(bodyEnd)
  })

  it('is responsive rather than a fixed-width card', () => {
    expect(dialog).toContain('@media (max-width: 599px)')
    // dvh, not vh: mobile browser chrome makes vh taller than the visible
    // viewport, which would push the buttons under the address bar.
    expect(dialog).toContain('dvh')
  })
})

describe('registration sends exactly one request, after the consent', () => {
  it('opens the dialog on submit instead of sending', () => {
    const onSubmit = registerPage.slice(
      registerPage.indexOf('function onSubmit()'),
      registerPage.indexOf('async function onConsentConfirmed'),
    )

    expect(onSubmit).toContain('isConsentOpen.value = true')
    // The submit handler must not reach the API at all — the dialog is not a
    // confirmation shown alongside a request already in flight.
    expect(onSubmit).not.toContain('submitToApi')
  })

  it('validates BEFORE asking for consent', () => {
    // Reversed, a driver with a mistyped phone would read and agree to a page
    // of text only to be told they cannot submit yet — and would then have to
    // consent a second time for one act of registering.
    const onSubmit = registerPage.slice(registerPage.indexOf('function onSubmit()'))
    expect(onSubmit.indexOf('!validate()')).toBeLessThan(onSubmit.indexOf('isConsentOpen'))
  })

  it('guards re-entry so a double tap cannot register twice', () => {
    // The duplicate-phone check would reject the second one with "this number
    // is already registered", pointing at the driver's own submission a second
    // earlier.
    expect(registerPage).toContain('if (isSubmitting.value) return')
  })

  it('sends the consent flag and the version in the payload', () => {
    expect(payload).toContain('privacyConsentAccepted: true')
    expect(payload).toContain('privacyPolicyVersion: PRIVACY_POLICY_VERSION')
  })

  it('never computes or sends a hash of the consent text', () => {
    // The server hashes its own canonical copy — a hash from the client proves
    // only that the client can run SHA-256.
    expect(payload.toLowerCase()).not.toContain('sha256')
    expect(registerPage).not.toContain('consentTextHash')
  })
})

/**
 * Approving a registration must NOT re-send consent.
 *
 * The admin review page deliberately reuses `buildRegistrationPayload` so a
 * field cannot be mapped one way for a driver and another way for an admin —
 * but that builder hard-codes the two consent keys, and `ApproveRegistrationDto`
 * declares neither, because consent is the driver's act at submission time and
 * an admin clicking «Հաստատել» is not a second one. The API runs with
 * `forbidNonWhitelisted: true`, so leaving them in does not degrade quietly: it
 * rejects EVERY approval with "property privacyConsentAccepted should not
 * exist", which is exactly what reached production once.
 */
describe('admin approval does not resend the driver consent', () => {
  it('strips both consent keys off the shared builder result', () => {
    const approve = adminReview.slice(adminReview.indexOf('async function approve()'))
    const destructure = approve.slice(0, approve.indexOf('buildRegistrationPayload'))

    expect(destructure).toContain('privacyConsentAccepted:')
    expect(destructure).toContain('privacyPolicyVersion:')
  })

  it('does not put either key back into the request body', () => {
    // The destructure above only removes them from `profile`; re-adding either
    // one to the literal that is actually POSTed would reintroduce the bug
    // while still passing the first assertion.
    const start = adminReview.indexOf('const payload: ApproveRegistrationPayload = {')
    expect(start).toBeGreaterThan(-1)
    const body = adminReview.slice(start, adminReview.indexOf('\n  }', start))

    expect(body).not.toContain('privacyConsentAccepted')
    expect(body).not.toContain('privacyPolicyVersion')
  })
})

describe('the dashboard block is mandatory', () => {
  it('renders the dialog in mandatory mode', () => {
    const usage = dashboard.slice(dashboard.indexOf('<PrivacyConsentDialog'))
    expect(usage.slice(0, 300)).toContain('mandatory')
  })

  it('ignores backdrop clicks when mandatory', () => {
    // Cancelling here signs the driver out; doing that because of a mistimed
    // click beside the panel would be indefensible.
    expect(dialog).toContain('if (props.mandatory) return')
  })

  it('ends the session on cancel, saving nothing', () => {
    const cancel = dashboard.slice(
      dashboard.indexOf('async function onConsentCancelled'),
      dashboard.indexOf('onMounted'),
    )

    expect(cancel).toContain('driverAuth.logout()')
    expect(cancel).toContain("navigateTo('/login', { replace: true })")
    // No "declined" record. A refusal is not a consent, and storing it would be
    // keeping data about someone who just told us not to.
    expect(cancel).not.toContain('privacyConsentRepository')
  })

  it('hides the profile behind the gate rather than only covering it', () => {
    // `v-else-if` on the password gate proves the consent gate REPLACES the
    // page: a dialog laid over a still-rendered dashboard leaves a form behind
    // it to tab into.
    expect(dashboard).toContain('v-if="requiresConsent"')
    expect(dashboard).toContain('v-else-if="driverAuth.mustChangePassword"')
  })

  it('re-reads the authoritative status instead of trusting the cached session', () => {
    // A 30-day localStorage session goes stale in both directions: a bumped
    // policy leaves a cached `false`, a consent given in another tab leaves a
    // cached `true`.
    expect(dashboard).toContain('privacyConsentRepository.getStatus()')
    expect(dashboard).toContain('driverAuth.syncPrivacyConsent')
  })

  it('does not lock the driver out when that read fails', () => {
    // A network blip must not strand a driver behind a dialog whose confirm
    // button would also fail.
    const load = dashboard.slice(
      dashboard.indexOf('async function loadConsentStatus'),
      dashboard.indexOf('async function onConsentConfirmed'),
    )
    expect(load).not.toContain('requiresConsent.value = true')
  })
})

describe('the /privacy page', () => {
  it('has its own SEO title and description', () => {
    expect(privacyPage).toContain('useSeoMetaData({')
    expect(privacyPage).toContain("path: '/privacy'")
    expect(privacyPage).toContain('Գաղտնիության քաղաքականություն')
  })

  it('shows the version, effective date and controller', () => {
    expect(privacyPage).toContain('PRIVACY_POLICY_EFFECTIVE_DATE')
    expect(privacyPage).toContain('PRIVACY_POLICY_VERSION')
    expect(privacyPage).toContain('PRIVACY_DATA_CONTROLLER')
  })

  it('reads them from the shared constants rather than hard-coding a fourth copy', () => {
    expect(privacyPage).toContain("from '~/constants/privacyConsent'")
    expect(privacyPage).not.toContain("'1.1'")
  })

  it('is responsive', () => {
    expect(privacyPage).toContain('@media (max-width: 599px)')
  })
})
