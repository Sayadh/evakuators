/**
 * The bounded set of business error codes every live-dispatch endpoint can
 * return. Clients (driver app, admin console) branch on `code`, never on the
 * message — the message is Armenian text for a human, like every other error
 * this API returns (see common/exception-response.ts).
 */
export const DISPATCH_ERRORS = {
  VALIDATION_FAILED: { status: 400, message: 'Տվյալները սխալ են' },
  SESSION_REVOKED: { status: 401, message: 'Այս սարքի նստաշրջանն ավարտված է, մուտք գործեք կրկին' },
  FORBIDDEN: { status: 403, message: 'Այս գործողությունը ձեզ հասանելի չէ' },
  FEATURE_DISABLED: { status: 404, message: 'Գործառույթը միացված չէ' },
  ORDER_NOT_FOUND: { status: 404, message: 'Պատվերը չի գտնվել' },
  OFFER_NOT_FOUND: { status: 404, message: 'Առաջարկը չի գտնվել' },
  OFFER_EXPIRED: { status: 409, message: 'Առաջարկի ժամկետն անցել է' },
  OFFER_REVOKED: { status: 409, message: 'Առաջարկը հետ է կանչվել' },
  OFFER_ALREADY_RESPONDED: { status: 409, message: 'Առաջարկին արդեն պատասխանել եք' },
  OFFER_TERMS_CHANGED: { status: 409, message: 'Պատվերի պայմանները փոխվել են, առաջարկն այլևս վավեր չէ' },
  ORDER_ALREADY_ASSIGNED: { status: 409, message: 'Պատվերն արդեն նշանակված է այլ վարորդի' },
  ORDER_CANCELLED: { status: 409, message: 'Պատվերը չեղարկված է' },
  ORDER_NOT_SEARCHING: { status: 409, message: 'Պատվերի համար վարորդի որոնում չի ընթանում' },
  INVALID_TRANSITION: { status: 409, message: 'Այս փոփոխությունը պատվերի ներկա վիճակում թույլատրված չէ' },
  VERSION_CONFLICT: { status: 409, message: 'Պատվերն արդեն փոխվել է, թարմացրեք էջը' },
  DRIVER_UNAVAILABLE: { status: 409, message: 'Վարորդը հասանելի չէ' },
  DRIVER_BUSY: { status: 409, message: 'Վարորդն արդեն ունի ակտիվ պատվեր' },
  DRIVER_RESERVED: { status: 409, message: 'Վարորդն այս պահին այլ առաջարկ է դիտում' },
  CAPABILITY_MISMATCH: { status: 409, message: 'Մեքենան չի համապատասխանում պատվերի պահանջներին' },
  REQUIREMENTS_UNCONFIRMED: { status: 422, message: 'Պատվերի տեխնիկական պահանջները ճշտված չեն' },
  PRICE_REQUIRED: { status: 422, message: 'Ֆիքսված գնով պատվերի համար գինը պարտադիր է' },
  PRICE_NOT_CONFIRMED: { status: 409, message: 'Գինը դեռ հաստատված չէ, տեղափոխումը չի կարող սկսվել' },
  REQUEST_ALREADY_OPEN: { status: 409, message: 'Այս պատվերի համար արդեն կա բաց հարցում' },
  NO_OPEN_REQUEST: { status: 409, message: 'Բաց հարցում չկա' },
  LOCATION_REJECTED: { status: 422, message: 'Տեղադրությունը չի ընդունվել' },
  TRACKING_CONSENT_REQUIRED: { status: 409, message: 'Անհրաժեշտ է տեղադրության հետևման համաձայնություն' },
  IDEMPOTENCY_KEY_REUSED: { status: 422, message: 'Նույն Idempotency-Key-ը օգտագործվել է այլ հարցման համար' },
  IDEMPOTENCY_IN_PROGRESS: { status: 409, message: 'Նույն հարցումն արդեն մշակվում է' },
  RATE_LIMITED: { status: 429, message: 'Չափազանց շատ հարցումներ' },
  // ─── App access (FleetDriver) ───
  INVALID_CREDENTIALS: { status: 401, message: 'Սխալ հեռախոսահամար կամ գաղտնաբառ' },
  APP_ACCESS_NOT_GRANTED: { status: 403, message: 'Ձեզ դեռ հասանելիություն չի տրվել հավելվածին։ Դիմեք ադմինիստրատորին' },
  APP_ACCOUNT_PENDING: { status: 403, message: 'Ձեր հայտը դեռ ստուգվում է։ Ադմինիստրատորը կկապվի ձեզ հետ' },
  APP_ACCOUNT_REJECTED: { status: 403, message: 'Ձեր հայտը մերժվել է։ Դիմեք ադմինիստրատորին' },
  APP_ACCESS_SUSPENDED: { status: 403, message: 'Հավելվածից օգտվելու ձեր հասանելիությունը կասեցված է։ Դիմեք ադմինիստրատորին' },
  PHONE_BELONGS_TO_SITE_DRIVER: { status: 409, message: 'Այս համարով վարորդ արդեն կա կայքում։ Մուտք գործեք կայքի գաղտնաբառով, իսկ եթե հավելվածը հասանելի չէ՝ դիմեք ադմինիստրատորին' },
  PHONE_ALREADY_REGISTERED: { status: 409, message: 'Այս համարով արդեն գրանցված հաշիվ կա' },
  REGISTRATION_ALREADY_PENDING: { status: 409, message: 'Այս համարով հայտն արդեն ստուգման մեջ է' },
  PHONE_HAS_APP_ONLY_ACCOUNT: { status: 409, message: 'Այս համարով կա միայն հավելվածի հաշիվ․ միացրեք այն կայքի պրոֆիլին, նոր հասանելիություն մի ստեղծեք' },
  FLEET_DRIVER_NOT_FOUND: { status: 404, message: 'Վարորդը չի գտնվել' },
  TOW_TRUCK_NOT_FOUND: { status: 404, message: 'Կայքի պրոֆիլը չի գտնվել' },
  TOW_TRUCK_ALREADY_LINKED: { status: 409, message: 'Այս կայքի պրոֆիլն արդեն կապված է հավելվածի վարորդի հետ' },
} as const

export type DispatchErrorCode = keyof typeof DISPATCH_ERRORS

export class DispatchError extends Error {
  readonly status: number

  constructor(
    readonly code: DispatchErrorCode,
    readonly details?: Record<string, unknown>,
    message?: string,
  ) {
    super(message ?? DISPATCH_ERRORS[code].message)
    this.name = 'DispatchError'
    this.status = DISPATCH_ERRORS[code].status
  }

  toBody(): { code: DispatchErrorCode; message: string; details?: Record<string, unknown> } {
    return this.details
      ? { code: this.code, message: this.message, details: this.details }
      : { code: this.code, message: this.message }
  }
}

/**
 * A business outcome that is NOT an exception: the operation ran, committed
 * whatever it had to (e.g. it marked an overdue offer EXPIRED on the way), and
 * the caller must be told it did not get what it asked for. Returned rather
 * than thrown so the transaction still commits.
 */
export interface Refusal {
  ok: false
  error: DispatchError
}

export function refuse(code: DispatchErrorCode, details?: Record<string, unknown>): Refusal {
  return { ok: false, error: new DispatchError(code, details) }
}
