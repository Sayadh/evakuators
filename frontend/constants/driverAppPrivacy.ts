/**
 * Version and date of the DRIVER APP privacy policy (/driver-app/privacy).
 *
 * Separate from the website policy (`privacyConsent.ts`): a different product,
 * different data (live and background location, push tokens, devices), and
 * the stores require a policy that describes the app specifically. The app's
 * in-app consent is versioned by TRACKING_CONSENT_VERSION on the backend;
 * bump that too when the MEANING of location use changes.
 *
 * Every statement on the page must match what the code does — re-read it
 * whenever tracking, retention, sharing or deletion changes. It has NOT been
 * reviewed by a lawyer; do that before the first store submission.
 */
export const DRIVER_APP_PRIVACY_VERSION = '1.0'
export const DRIVER_APP_PRIVACY_EFFECTIVE_DATE = '2026-11-10'
/** The app's name exactly as on the store listings — Google requires the page to name it */
export const DRIVER_APP_NAME = 'Evakuators Driver'
