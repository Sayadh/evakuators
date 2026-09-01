import { BadRequestException, HttpStatus, NotFoundException } from '@nestjs/common'
import { ThrottlerException } from '@nestjs/throttler'
import { Prisma } from '@prisma/client'
import { MulterError } from 'multer'
import { describe, expect, it } from 'vitest'
import { resolveExceptionResponse } from '../src/common/exception-response'

function prismaError(code: string, meta?: Record<string, unknown>): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('db error', { code, clientVersion: '5.22.0', meta })
}

describe('resolveExceptionResponse', () => {
  it('passes a deliberately-thrown HttpException straight through', () => {
    // e.g. ImagesController's `throw new BadRequestException('Նկարի ֆայլը բացակայում է')`
    const result = resolveExceptionResponse(new BadRequestException('Նկարի ֆայլը բացակայում է'))
    expect(result).toEqual({ statusCode: HttpStatus.BAD_REQUEST, message: 'Նկարի ֆայլը բացակայում է', logAsError: false })
  })

  it('flattens an HttpException whose response body is the default { message, error, statusCode } shape', () => {
    const result = resolveExceptionResponse(new NotFoundException())
    expect(result.statusCode).toBe(HttpStatus.NOT_FOUND)
    expect(result.message).toBe('Not Found')
    expect(result.logAsError).toBe(false)
  })

  it('gives ThrottlerException a clear Armenian message instead of its English default', () => {
    const result = resolveExceptionResponse(new ThrottlerException())
    expect(result.statusCode).toBe(HttpStatus.TOO_MANY_REQUESTS)
    expect(result.message).not.toMatch(/ThrottlerException/)
    expect(result.logAsError).toBe(false)
  })

  it('turns a Multer file-size limit into 413 with a clear message, not an uncaught 500', () => {
    const result = resolveExceptionResponse(new MulterError('LIMIT_FILE_SIZE'))
    expect(result.statusCode).toBe(HttpStatus.PAYLOAD_TOO_LARGE)
    expect(result.message).toBe('Ֆայլը չափազանց մեծ է')
    expect(result.logAsError).toBe(false)
  })

  it('turns any other Multer error into a 400 with a clear fallback message', () => {
    const result = resolveExceptionResponse(new MulterError('LIMIT_UNEXPECTED_FILE'))
    expect(result.statusCode).toBe(HttpStatus.BAD_REQUEST)
    expect(result.message).toBe('Ֆայլի բեռնումը ձախողվեց, փորձեք կրկին')
  })

  it('turns a Prisma unique-constraint violation (P2002) into 409, naming the field', () => {
    const result = resolveExceptionResponse(prismaError('P2002', { target: ['phone'] }))
    expect(result.statusCode).toBe(HttpStatus.CONFLICT)
    expect(result.message).toBe('«phone» արժեքն արդեն օգտագործված է')
    expect(result.logAsError).toBe(false)
  })

  it('turns a Prisma "record not found" (P2025) into 404', () => {
    const result = resolveExceptionResponse(prismaError('P2025'))
    expect(result.statusCode).toBe(HttpStatus.NOT_FOUND)
    expect(result.logAsError).toBe(false)
  })

  it('turns an unrecognized Prisma error code into a logged 400, not a silent 500', () => {
    const result = resolveExceptionResponse(prismaError('P2003'))
    expect(result.statusCode).toBe(HttpStatus.BAD_REQUEST)
    expect(result.logAsError).toBe(true)
  })

  it('turns PrismaClientValidationError — the exact bug CLAUDE.md documents — into a logged 500 with a real message, not a bare one', () => {
    // The class this codebase actually threw once (test/images.repository.spec.ts):
    // `field: { in: [null, 5] }` throws PrismaClientValidationError, not a
    // PrismaClientKnownRequestError, so it must fall through to the generic branch.
    const exception = new Prisma.PrismaClientValidationError('Invalid `prisma.x.findMany()` invocation', {
      clientVersion: '5.22.0',
    })
    const result = resolveExceptionResponse(exception)
    expect(result.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR)
    expect(result.message.length).toBeGreaterThan(0)
    expect(result.message).not.toMatch(/Internal server error/i)
    expect(result.logAsError).toBe(true)
  })

  it('turns a totally unanticipated thrown value into a logged, generic 500', () => {
    const result = resolveExceptionResponse(new Error('something nobody planned for'))
    expect(result.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR)
    expect(result.logAsError).toBe(true)
  })
})
