import { HttpException, HttpStatus } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { MulterError } from 'multer'
import { ThrottlerException } from '@nestjs/throttler'

export interface ExceptionResponse {
  statusCode: number
  message: string
  /** Whether `AllExceptionsFilter` should log this at `error` level (with stack) rather than stay silent. */
  logAsError: boolean
}

const GENERIC_SERVER_ERROR_MESSAGE =
  'Սերվերի կողմից անսպասելի սխալ է տեղի ունեցել։ Խնդրում ենք փորձել մի փոքր անց, խնդիրը հայտնի է թիմին'
const TOO_MANY_REQUESTS_MESSAGE = 'Չափազանց շատ փորձեր կարճ ժամանակում։ Խնդրում ենք սպասել և փորձել կրկին'
const FILE_TOO_LARGE_MESSAGE = 'Ֆայլը չափազանց մեծ է'
const FILE_UPLOAD_FAILED_MESSAGE = 'Ֆայլի բեռնումը ձախողվեց, փորձեք կրկին'
const DUPLICATE_VALUE_MESSAGE = 'Այս տվյալն արդեն գրանցված է համակարգում'
const RECORD_NOT_FOUND_MESSAGE = 'Հարցվող տվյալը չի գտնվել'
const REQUEST_COULD_NOT_BE_COMPLETED_MESSAGE = 'Հարցումը հնարավոր չէ կատարել այս պահին'

/** `error.message`, string-ified, never `undefined` — what gets logged alongside a 500/502-class failure. */
function stackOrMessage(exception: unknown): string {
  return exception instanceof Error ? (exception.stack ?? exception.message) : String(exception)
}

/** `HttpException.getResponse()` is a string OR `{ statusCode, message, error }`, and `message` can itself be a string or (rarely, from something other than our own `buildValidationException`) an array — always flatten to one string. */
function flattenHttpMessage(exception: HttpException): string {
  const body = exception.getResponse()
  if (typeof body === 'string') return body
  const message = (body as { message?: string | string[] }).message
  if (Array.isArray(message)) return message.join(' · ')
  return message ?? exception.message
}

function resolveMulterError(exception: MulterError): ExceptionResponse {
  if (exception.code === 'LIMIT_FILE_SIZE') {
    return { statusCode: HttpStatus.PAYLOAD_TOO_LARGE, message: FILE_TOO_LARGE_MESSAGE, logAsError: false }
  }
  return { statusCode: HttpStatus.BAD_REQUEST, message: FILE_UPLOAD_FAILED_MESSAGE, logAsError: false }
}

/**
 * Known Prisma error codes this API can actually hit, given its schema and
 * write patterns — see https://www.prisma.io/docs/orm/reference/error-reference.
 * Anything else is a genuine, unanticipated database-layer failure and gets
 * logged as an error rather than guessed at.
 */
function resolvePrismaKnownError(exception: Prisma.PrismaClientKnownRequestError): ExceptionResponse {
  switch (exception.code) {
    case 'P2002': {
      const target = exception.meta?.target
      const field = Array.isArray(target) ? target.join(', ') : undefined
      return {
        statusCode: HttpStatus.CONFLICT,
        message: field ? `«${field}» արժեքն արդեն օգտագործված է` : DUPLICATE_VALUE_MESSAGE,
        logAsError: false,
      }
    }
    case 'P2025':
      return { statusCode: HttpStatus.NOT_FOUND, message: RECORD_NOT_FOUND_MESSAGE, logAsError: false }
    default:
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        message: REQUEST_COULD_NOT_BE_COMPLETED_MESSAGE,
        logAsError: true,
      }
  }
}

/**
 * The pure decision this whole module exists for: given anything that was
 * thrown, anywhere in the request pipeline, what HTTP status and message
 * should the driver/admin actually see, and does it need an `error`-level
 * log. Kept separate from `AllExceptionsFilter` (its only caller, wired into
 * `main.ts` via `app.useGlobalFilters`) so it is a plain function over a
 * value — testable directly, the same reason every plugin/guard in this
 * codebase keeps its decision logic in a pure, DI-free function.
 *
 * Without this, three real classes of failure all reached the client as an
 * opaque `{"statusCode":500,"message":"Internal server error"}` with zero
 * detail (see CLAUDE.md's `PrismaClientValidationError` incident, where this
 * stayed silent in the admin panel for as long as the bug existed): a Prisma
 * error, a Multer error thrown by `FileInterceptor` before any controller or
 * service code runs (`MulterError` does not extend `HttpException`, so
 * nothing before this ever caught it), and a rate-limit hit
 * (`ThrottlerException`'s own default message is the English "ThrottlerException:
 * Too Many Requests", never translated).
 *
 * An `HttpException` thrown deliberately by a service/controller
 * (`BadRequestException('Նկարի ֆայլը բացակայում է')`, `buildValidationException`,
 * etc.) passes straight through unchanged — this only ever ADDS detail for
 * the cases nothing was handling, never removes any.
 */
export function resolveExceptionResponse(exception: unknown): ExceptionResponse {
  if (exception instanceof ThrottlerException) {
    return { statusCode: HttpStatus.TOO_MANY_REQUESTS, message: TOO_MANY_REQUESTS_MESSAGE, logAsError: false }
  }

  if (exception instanceof HttpException) {
    const statusCode = exception.getStatus()
    return { statusCode, message: flattenHttpMessage(exception), logAsError: statusCode >= 500 }
  }

  if (exception instanceof MulterError) {
    return resolveMulterError(exception)
  }

  if (exception instanceof Prisma.PrismaClientKnownRequestError) {
    return resolvePrismaKnownError(exception)
  }

  // PrismaClientValidationError (a malformed query — always our own bug, never
  // the caller's), PrismaClientInitializationError, or anything else nobody
  // anticipated: a genuine 500, logged in full so it can actually be fixed,
  // never described to the client beyond "something went wrong".
  return { statusCode: HttpStatus.INTERNAL_SERVER_ERROR, message: GENERIC_SERVER_ERROR_MESSAGE, logAsError: true }
}

export { stackOrMessage }
