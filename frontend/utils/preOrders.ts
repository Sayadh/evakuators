/**
 * Pre-orders (2026-11-17): small display helpers shared by the list and the
 * detail page. The form itself is utils/orderForm.ts (`buildPreOrderBody`).
 */
import type { OpsPreOrder } from '~/types/opsDispatch'

/** «Toyota Camry · 1600 կգ», or '' */
export function preOrderVehicle(p: Pick<OpsPreOrder, 'vehicle'>): string {
  const name = [p.vehicle.make, p.vehicle.model].filter(Boolean).join(' ')
  return [name, p.vehicle.weightKg ? `${p.vehicle.weightKg} կգ` : ''].filter(Boolean).join(' · ')
}

const YES: Record<string, string> = {
  needsManipulator: 'Մանիպուլյատոր',
  steeringLocked: 'Ղեկը փակ',
  gearboxLocked: 'Տուփը փակ',
}

/** The requirements as short chips: «Անիվները չեն պտտվում», «Ռոլիկներ ×4», … */
export function preOrderRequirementChips(p: Pick<OpsPreOrder, 'requirements'>): string[] {
  const r = p.requirements
  const chips: string[] = []
  // «Wheels don't roll» and «skates» are one question (2026-11-17): one chip, with the count if given
  const skates = r.wheelSkatesCount ? `ռոլիկներ ×${r.wheelSkatesCount}` : 'ռոլիկներ'
  if (r.wheelsRoll === false) chips.push(`Անիվները չեն պտտվում · ${skates}`)
  else if (r.needsWheelSkates === true) chips.push(skates.charAt(0).toUpperCase() + skates.slice(1))
  for (const [key, label] of Object.entries(YES)) if (r[key as keyof typeof r] === true) chips.push(label)
  return chips
}

/** Where the pre-order stands, in one word — only the operator closes it */
export function preOrderStateLabel(p: Pick<OpsPreOrder, 'status'>): { text: string; tone: 'success' | 'neutral' } {
  return p.status === 'CLOSED' ? { text: 'Փակված', tone: 'neutral' } : { text: 'Գներ են ընդունվում', tone: 'success' }
}
