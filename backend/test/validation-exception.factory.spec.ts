import type { ValidationError } from '@nestjs/common'
import { describe, expect, it } from 'vitest'
import { buildValidationException } from '../src/common/validation-exception.factory'

function error(property: string, constraints: Record<string, string>, children: ValidationError[] = []): ValidationError {
  return { property, constraints, children, target: {}, value: undefined }
}

describe('buildValidationException', () => {
  it('keeps a DTO’s own Armenian message unchanged', () => {
    // The exact shape IsArmenianPhone() (common/phone.ts) produces.
    const exception = buildValidationException([
      error('phone', { matches: 'Հեռախոսահամարը պետք է լինի այս ձևաչափով՝ +37491000001' }),
    ])
    expect(exception.getResponse()).toMatchObject({
      message: 'Հեռախոսահամարը պետք է լինի այս ձևաչափով՝ +37491000001',
    })
  })

  it('translates a default (untranslated) class-validator message into Armenian, by constraint type', () => {
    const exception = buildValidationException([error('name', { isNotEmpty: 'name should not be empty' })])
    expect(exception.getResponse()).toMatchObject({ message: '«name» դաշտը պարտադիր է' })
  })

  it('falls back to a generic Armenian sentence for an unmapped constraint type', () => {
    const exception = buildValidationException([error('slug', { isSlug: 'slug must be a slug' })])
    expect(exception.getResponse()).toMatchObject({ message: '«slug» դաշտը սխալ լրացված է' })
  })

  it('joins several failing fields into one readable message', () => {
    const exception = buildValidationException([
      error('name', { isNotEmpty: 'name should not be empty' }),
      error('phone', { matches: 'Հեռախոսահամարը պետք է լինի այս ձևաչափով՝ +37491000001' }),
    ])
    expect(exception.getResponse()).toMatchObject({
      message: '«name» դաշտը պարտադիր է · Հեռախոսահամարը պետք է լինի այս ձևաչափով՝ +37491000001',
    })
  })

  it('walks nested/array DTO errors (@ValidateNested) so the real field is named', () => {
    const exception = buildValidationException([
      error('serviceAreas', {}, [error('0', {}, [error('type', { isIn: 'type must be one of the following values' })])]),
    ])
    expect(exception.getResponse()).toMatchObject({ message: '«serviceAreas.0.type» դաշտի արժեքն անթույլատրելի է' })
  })

  it('never returns an empty message, even with no constraints at all', () => {
    const exception = buildValidationException([])
    expect((exception.getResponse() as { message: string }).message.length).toBeGreaterThan(0)
  })
})
