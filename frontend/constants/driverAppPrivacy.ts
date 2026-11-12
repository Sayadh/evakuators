/**
 * Version and date of the DRIVER APP privacy policy (/driver-app/privacy).
 *
 * Separate from the website policy (`privacyConsent.ts`): a different product,
 * different data (live and background location, push tokens, devices), and
 * the stores require a policy that describes the app specifically. The app's
 * in-app consent is versioned by TRACKING_CONSENT_VERSION on the backend;
 * bump that too when the MEANING of location use changes.
 *
 * The page's TEXT lives in driverAppPrivacyContent.ts, shared verbatim by the
 * website page and the app's own privacy screen (one text, two renderers).
 *
 * Every statement on the page must match what the code does — re-read it
 * whenever tracking, retention, sharing or deletion changes. It has NOT been
 * reviewed by a lawyer; do that before the first store submission.
 */
// 1.1 (2026-11-11): the app's sign-up became the website registration —
// photos the driver picks are uploaded, and an approved sign-up has a public
// website profile. §2, §4 and §6 changed accordingly.
export const DRIVER_APP_PRIVACY_VERSION = '1.1'
export const DRIVER_APP_PRIVACY_EFFECTIVE_DATE = '2026-11-11'
/** The app's name exactly as on the store listings — Google requires the page to name it */
export const DRIVER_APP_NAME = 'Evakuators Driver'
