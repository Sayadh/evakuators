import { describe, expect, it } from 'vitest'
import { staticSettlements } from '~/data/settlement'
import { validateLocationData } from '~/utils/locationDataValidation'

describe('static location data', () => {
  const report = validateLocationData()

  it('has no structural errors', () => {
    // Printed rather than just asserted: a failure here should say WHICH row.
    expect(report.errors).toEqual([])
  })

  it('still holds exactly 300 settlements with 300 unique ids', () => {
    expect(staticSettlements).toHaveLength(300)
    expect(new Set(staticSettlements.map((s) => s.id)).size).toBe(300)
  })

  it('has exactly 20 redirect and 4 landing settlements', () => {
    expect(staticSettlements.filter((s) => s.seoMode === 'redirect')).toHaveLength(20)
    expect(staticSettlements.filter((s) => s.seoMode === 'landing')).toHaveLength(4)
  })

  it('leaves every settlement without routing fields on the original targetCityId flow', () => {
    const untouched = staticSettlements.filter((s) => s.seoMode === undefined)
    expect(untouched).toHaveLength(276)
    for (const settlement of untouched) {
      expect(settlement.targetServiceZoneId).toBeUndefined()
      expect(settlement.targetCityId).toBeGreaterThan(0)
    }
  })

  /**
   * Known and accepted, NOT silently ignored: a village shares a slug with a
   * town. The rule is that the city keeps the URL — asserted separately in
   * locationSearch.spec.ts.
   */
  it('reports the known city/settlement slug conflicts', () => {
    expect(report.slugConflicts.join('\n')).toContain('Արարատ')
    expect(report.slugConflicts.join('\n')).toContain('Արմավիր')
    // Found during integration and not in the original brief: same slug, but
    // different marzes (village in Aragatsotn, town in Syunik).
    expect(report.slugConflicts.join('\n')).toContain('Ագարակ')
  })

  it('reports same-name settlements in different regions as ambiguities, not errors', () => {
    const text = report.ambiguities.join('\n')
    for (const name of ['ակունք', 'թեղուտ', 'աղավնաձոր', 'շահումյան']) {
      expect(text).toContain(name)
    }
  })
})
