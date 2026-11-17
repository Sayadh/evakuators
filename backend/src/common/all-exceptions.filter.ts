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
/** Where a 5xx is also recorded (2026-11-17, error-tracking) — optional, so tests can build the filter bare */
export interface ServerErrorRecorder {
  record(report: { source: 'api'; message: string; stack: string | null; context: Record<string, unknown> }): Promise<unknown>
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionsFilter')

  constructor(private readonly recorder?: ServerErrorRecorder) {}

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
      // The route, not the URL: ids and query strings would split one bug into many groups
      const route = (request as Request & { route?: { path?: string } }).route?.path ?? request.path
      void this.recorder?.record({
        source: 'api',
        message: exception instanceof Error ? `${exception.name}: ${exception.message}` : String(message),
        stack: exception instanceof Error ? (exception.stack ?? null) : null,
        context: { method: request.method, route, status: statusCode },
      })
    }

    response.status(statusCode).json({ statusCode, message })
  }
}
