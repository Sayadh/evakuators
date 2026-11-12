/**
 * Stand-in for `~/repositories` while type-checking the website modules the app
 * imports (tsconfig `paths`).
 *
 * `frontend/utils/registrationPayload.ts` names the type of what it builds by
 * importing it from the website's repository layer, which in turn imports
 * `ofetch`, Pinia stores and Nuxt — none of which exist in this project, and
 * none of which reach the bundle (a type-only import is erased). Only the TYPE
 * checker would follow it, so only the type checker is pointed here.
 *
 * Deliberately loose: the payload is built BY the website's own function, so
 * its shape is that function's; the app never assembles one by hand.
 */
export interface RegistrationPayload {
  [field: string]: unknown
  imageIds: number[]
  privacyConsentAccepted: true
  privacyPolicyVersion: string
}
