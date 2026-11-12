import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from '@nestjs/common'
import type { Request, Response } from 'express'
import { DispatchError } from '../platform/errors'
import type { MutationContext } from '../live-dispatch.service'
import type { StoredResponse } from '../platform/idempotency'

/**
 * DispatchError → `{ code, message, details }` with its HTTP status. Anything
 * else falls through to the app-wide AllExceptionsFilter (re-thrown as-is).
 */
@Catch(DispatchError)
export class DispatchErrorFilter implements ExceptionFilter {
  catch(error: DispatchError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>()
    response.status(error.status).json(error.toBody())
  }
}

export function mutationContext(request: Request, body: unknown): MutationContext {
  const key = request.headers['idempotency-key']
  return {
    idempotencyKey: typeof key === 'string' ? key : undefined,
    method: request.method,
    // The ROUTE PATTERN plus params would also work; the concrete path is
    // stricter (a key reused on a different order is a different request).
    route: request.originalUrl.split('?')[0],
    body,
  }
}

/** Writes a stored (possibly replayed) response with its original status */
export function send(response: Response, stored: StoredResponse & { replayed?: boolean }): void {
  if (stored.replayed) response.setHeader('Idempotent-Replayed', 'true')
  response.status(stored.status).json(stored.body)
}

export function intParam(value: string, name: string): number {
  const n = Number(value)
  if (!Number.isSafeInteger(n) || n <= 0) throw new DispatchError('VALIDATION_FAILED', { field: name })
  return n
}

export function versionOf(body: unknown): number {
  const v = (body as { expectedVersion?: unknown })?.expectedVersion
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 1) throw new DispatchError('VALIDATION_FAILED', { field: 'expectedVersion' })
  return v
}

export { HttpException }
