import { Catch, Logger } from '@nestjs/common'
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common'
import type { Request, Response } from 'express'
import { resolveExceptionResponse, stackOrMessage } from './exception-response'

/**
 * The single place every uncaught exception in the API passes through
 * (`app.useGlobalFilters(new AllExceptionsFilter())` in `main.ts`) — so no
 * route can ever return a bare, untranslated error again. All the actual
 * decision-making (which status, which message, whether to log) lives in
 * `resolveExceptionResponse` — this class is only the Nest/Express glue
 * around it: read the request, write the response, log if asked to.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionsFilter')

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp()
    const response = ctx.getResponse<Response>()
    const request = ctx.getRequest<Request>()

    const { statusCode, message, logAsError } = resolveExceptionResponse(exception)

    if (logAsError) {
      this.logger.error(
        `${request.method} ${request.originalUrl} → ${statusCode}: ${message}`,
        stackOrMessage(exception),
      )
    }

    response.status(statusCode).json({ statusCode, message })
  }
}
