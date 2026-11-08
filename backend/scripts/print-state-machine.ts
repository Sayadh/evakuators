/**
 * Prints docs/live-dispatch/02-state-machine.md from ORDER_TRANSITIONS, so the
 * documented table can never drift from the code that enforces it.
 *
 *   npx --yes tsx@4.19.2 scripts/print-state-machine.ts > ../docs/live-dispatch/02-state-machine.md
 */
import { ORDER_STATUSES, ORDER_TRANSITIONS } from '../src/live-dispatch/orders/domain/order-state'

const cell = (text: string) => text.replace(/\|/g, '\\|')
const lines: string[] = []
lines.push('# Live dispatch — 02. Պատվերի և առաջարկի վիճակներ')
lines.push('')
lines.push('> Գեներացված է `backend/scripts/print-state-machine.ts`-ով `ORDER_TRANSITIONS`-ից (`backend/src/live-dispatch/orders/domain/order-state.ts`)։ Ձեռքով մի խմբագրեք․ փոխեք կոդը և վերագեներացրեք։ Բոլոր անցումները ստուգվում են backend-ում՝ պատվերի տողի lock-ի տակ։')
lines.push('')
lines.push('## Պատվերի վիճակներ')
lines.push('')
lines.push(ORDER_STATUSES.map((s) => `\`${s}\``).join(' · '))
lines.push('')
lines.push('## Թույլատրված անցումներ')
lines.push('')
lines.push('| Գործողություն | Որտեղից | Ուր | Ով | Նախապայմաններ |')
lines.push('| --- | --- | --- | --- | --- |')
for (const rule of ORDER_TRANSITIONS) {
  lines.push(`| \`${rule.action}\` | ${rule.from.map((s) => `\`${s}\``).join(', ')} | ${cell(rule.to)} | ${rule.actors.join(', ')} | ${cell(rule.preconditions)} |`)
}
lines.push('')
lines.push('```mermaid')
lines.push('stateDiagram-v2')
lines.push('  [*] --> DRAFT')
const seen = new Set<string>()
for (const rule of ORDER_TRANSITIONS) {
  const targets = (rule.to.match(/[A-Z_]{4,}/g) ?? []).filter((t) => (ORDER_STATUSES as readonly string[]).includes(t))
  for (const from of rule.from) {
    for (const to of targets) {
      const key = `${from}->${to}:${rule.action}`
      if (seen.has(key) || from === to) continue
      seen.add(key)
      lines.push(`  ${from} --> ${to}: ${rule.action}`)
    }
  }
}
lines.push('  COMPLETED --> [*]')
lines.push('  CANCELLED --> [*]')
lines.push('```')
lines.push('')
lines.push('## Առաջարկի վիճակներ (առանձին մեքենա)')
lines.push('')
lines.push('| Անցում | Ով/ինչ | Պայման |')
lines.push('| --- | --- | --- |')
lines.push('| `PENDING → ACCEPTED` | DRIVER | `now() < expiresAt` (DB ժամացույց), terms version-ը ընթացիկ է, պատվերը SEARCHING է, ոչ պատվերը, ոչ վարորդը ակտիվ assignment չունեն — մեկ transaction-ում assignment-ի հետ |')
lines.push('| `PENDING → REJECTED` | DRIVER | deadline-ից առաջ, հակառակ դեպքում՝ EXPIRED |')
lines.push('| `PENDING → EXPIRED` | SYSTEM (expiry job, reconciler) կամ ուշացած accept/reject | միայն եթե `now() >= expiresAt`; կրկնվող job-ը no-op է |')
lines.push('| `PENDING → REVOKED` | ADMIN (stop, cancel, պայմանների փոփոխություն) | `closeReason` = DISPATCH_STOPPED / ORDER_CANCELLED / TERMS_CHANGED |')
lines.push('')
lines.push('Ոչ մի վիճակ PENDING-ից բացի չի փոխվում։ Reservation-ը PENDING offer-ն է՝ `OrderOffer_one_pending_per_driver` index-ով։')
lines.push('')
lines.push('## NEEDS_ATTENTION-ի երկու իմաստ')
lines.push('')
lines.push('| `attentionKind` | Վարորդ կցված է՞ | Ինչ կարող է անել օպերատորը |')
lines.push('| --- | --- | --- |')
lines.push('| `SEARCH_EXHAUSTED`, `SEARCH_TIMEOUT`, `MANUAL_OFFER_FAILED` | Ոչ | `START_DISPATCH` (նոր որոնում), manual offer, `CANCEL` |')
lines.push('| `DRIVER_CANCEL_REQUEST`, `DRIVER_PROBLEM`, `OPERATOR_FLAG` | **Այո — assignment-ը պահպանվում է** | `RESUME_FROM_ATTENTION` (վարորդը մնում է), `RELEASE_ASSIGNMENT` (+ ըստ ցանկության նոր որոնում նույն transaction-ում), `CANCEL` |')
console.log(lines.join('\n'))
