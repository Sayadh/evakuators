import { describe, expect, it } from 'vitest'
import { toCsv, toExcelCsv } from '../src/common/csv'

describe('toCsv', () => {
  it('joins fields with commas and rows with CRLF', () => {
    expect(toCsv([['a', 'b'], ['1', '2']])).toBe('a,b\r\n1,2')
  })

  it('leaves a plain field unquoted', () => {
    expect(toCsv([['Ասատուր Ասատուրյան']])).toBe('Ասատուր Ասատուրյան')
  })

  it('quotes a field containing a comma', () => {
    expect(toCsv([['Ասատուր, ՍՊԸ']])).toBe('"Ասատուր, ՍՊԸ"')
  })

  it('quotes a field containing a newline', () => {
    expect(toCsv([['line one\nline two']])).toBe('"line one\nline two"')
  })

  it('quotes a field containing a quote, doubling it', () => {
    expect(toCsv([['12" winch']])).toBe('"12"" winch"')
  })

  it('does not quote a field with none of the special characters', () => {
    expect(toCsv([['+37491000001']])).toBe('+37491000001')
  })
})

describe('toExcelCsv', () => {
  it('prefixes the CSV with a UTF-8 BOM', () => {
    const result = toExcelCsv([['a']])
    expect(result.charCodeAt(0)).toBe(0xfeff)
    expect(result.slice(1)).toBe('a')
  })
})
