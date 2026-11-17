import { describe, expect, it } from 'vitest'
import type { OpsAlert, OpsOrder, OpsOrderDetail, OpsTimelineEvent } from '~/types/opsDispatch'
import { listIncident, orderIncidents } from '~/utils/orderIncidents'

function order(overrides: Partial<OpsOrder> = {}): OpsOrder {
  return {
    id: 7,
    number: 'EV-7',
    source: 'ADMIN',
    status: 'ASSIGNED',
    attentionKind: null,
    statusBeforeAttention: null,
    version: 1,
    termsVersion: 1,
    customer: { phone: '+37491000000', name: null },
    pickup: { latitude: 40.1, longitude: 44.5, address: 'Yerevan' },
    destination: null,
    vehicle: { make: null, model: null, plate: null, weightKg: null },
    problemDescription: '',
    requirements: { wheelsRoll: null, steeringLocked: null, gearboxLocked: null, needsManipulator: null, overridden: false, overrideNote: null },
    price: { mode: 'FIXED', currency: 'AMD', quotedAmd: 10000, agreedAmd: null, confirmed: false, confirmedAt: null },
    payment: { status: 'UNKNOWN', updatedAt: null },
    assignedDriverId: 5,
    pickupToDestination: null,
    cancel: null,
    internalNote: null,
    timestamps: {},
    ...overrides,
  } as OpsOrder
}

let id = 1
function ev(type: string, actorType: OpsTimelineEvent['actorType'], data: Record<string, unknown>, minute: number, actorId: number | null = null): OpsTimelineEvent {
  return { id: id++, type, actorType, actorId, data, createdAt: `2026-11-16T10:${String(minute).padStart(2, '0')}:00.000Z` }
}

function detail(o: OpsOrder, timeline: OpsTimelineEvent[]): OpsOrderDetail {
  return {
    order: o,
    offers: [],
    candidates: [],
    timeline,
    assignments: [{ id: 1, driverId: 5, name: 'Արամ', phone: '+37491111111', active: true, startedAt: '2026-11-16T10:00:00.000Z', endedAt: null, endReason: null }],
  }
}

describe('orderIncidents', () => {
  it('a cancelled order: red, open, who and why in words', () => {
    const d = detail(order({ status: 'CANCELLED', cancel: { reason: 'CUSTOMER_DECLINED', comment: 'զանգեց' } }), [
      ev('ORDER_CREATED', 'ADMIN', {}, 1, 1),
      ev('ORDER_CANCELLED', 'ADMIN', { reason: 'CUSTOMER_DECLINED', comment: 'զանգեց', releasedDriverId: 5 }, 9, 1),
    ])
    const [first] = orderIncidents(d)
    expect(first).toMatchObject({ kind: 'CANCELLED', tone: 'danger', open: true, reason: 'Հաճախորդը հրաժարվել է', comment: 'զանգեց' })
    expect(first.actor.type).toBe('ADMIN')
  })

  it('a driver asking to cancel: open while the order waits for the operator, with his name and phone', () => {
    const d = detail(order({ status: 'NEEDS_ATTENTION', attentionKind: 'DRIVER_CANCEL_REQUEST' }), [
      ev('DRIVER_CANCEL_REQUESTED', 'DRIVER', { reason: 'DRIVER_CANNOT_PERFORM', comment: 'անիվը պայթեց', redispatch: false }, 5, 5),
    ])
    const [first] = orderIncidents(d)
    expect(first).toMatchObject({ kind: 'DRIVER_CANCEL_REQUEST', open: true, reason: 'Վարորդը չի կարող կատարել', comment: 'անիվը պայթեց' })
    expect(first.actor).toMatchObject({ type: 'DRIVER', label: 'Վարորդ՝ Արամ', phone: '+37491111111' })
    // Resolved: no longer open
    expect(orderIncidents(detail(order(), d.timeline))[0].open).toBe(false)
  })

  it('a customer reason (2026-11-17): the driver is already free — open while the order waits for the operator', () => {
    const t = [ev('DRIVER_CANCEL_REQUESTED', 'DRIVER', { reason: 'CUSTOMER_WILL_CALL', comment: null, redispatch: false, customer: true }, 5, 5)]
    const open = orderIncidents(detail(order({ status: 'NEEDS_ATTENTION', attentionKind: 'CUSTOMER_PENDING', assignedDriverId: null }), t))[0]
    expect(open).toMatchObject({ kind: 'CUSTOMER_PENDING', tone: 'warn', open: true, reason: 'Հաճախորդը կզանգի (մտածում է)' })
    expect(open.actor.phone).toBe('+37491111111')
    expect(orderIncidents(detail(order({ status: 'SEARCHING', assignedDriverId: null }), t))[0].open).toBe(false)
  })

  it('price not agreed: both prices in words on the incident', () => {
    const t = [ev('DRIVER_CANCEL_REQUESTED', 'DRIVER', { reason: 'PRICE_NOT_AGREED', redispatch: true, driverPriceAmd: 20000, customerPriceAmd: 12000 }, 5, 5)]
    const [first] = orderIncidents(detail(order({ status: 'SEARCHING', assignedDriverId: null }), t))
    expect(first.prices).toMatch(/^Վարորդն ասել է՝ 20.000 ֏ · հաճախորդն առաջարկել է՝ 12.000 ֏$/)
  })

  it('list chip: a released customer alert says to call the customer, not «asks to cancel»', () => {
    const o = order({ status: 'NEEDS_ATTENTION', attentionKind: 'CUSTOMER_PENDING', assignedDriverId: null })
    const chip = listIncident(o, [{ id: 1, orderId: o.id, kind: 'DRIVER_CANCEL_REQUEST', data: { released: true }, createdAt: '2026-11-17T10:00:00.000Z' }])
    expect(chip).toMatchObject({ label: '📞 Հաճախորդը կզանգի / հրաժարվեց', urgent: true })
    // A new search was started: the chip no longer says «call the customer»
    expect(listIncident({ ...o, status: 'SEARCHING', attentionKind: null }, [{ id: 1, orderId: o.id, kind: 'DRIVER_CANCEL_REQUEST', data: { released: true }, createdAt: '2026-11-17T10:00:00.000Z' }])).toBeNull()
  })

  it('a driver who withdrew (auto re-dispatch): open until somebody else accepted', () => {
    const t = [ev('DRIVER_CANCEL_REQUESTED', 'DRIVER', { reason: 'OTHER', comment: null, redispatch: true }, 5, 5)]
    expect(orderIncidents(detail(order({ status: 'SEARCHING', assignedDriverId: null }), t))[0]).toMatchObject({ kind: 'DRIVER_WITHDREW', open: true })
    const later = [...t, ev('OFFER_ACCEPTED', 'DRIVER', {}, 8, 6)]
    expect(orderIncidents(detail(order({ status: 'ASSIGNED', assignedDriverId: 6 }), later))[0].open).toBe(false)
  })

  it('newest first, and the history keeps closed ones', () => {
    const d = detail(order({ status: 'CANCELLED', cancel: { reason: 'OTHER', comment: 'x' } }), [
      ev('DRIVER_PROBLEM_REPORTED', 'DRIVER', { reason: 'TECHNICAL_PROBLEM', comment: null }, 3, 5),
      ev('ASSIGNMENT_RELEASED', 'ADMIN', { releasedDriverId: 5, reason: 'չի պատասխանում' }, 4, 1),
      ev('ORDER_CANCELLED', 'ADMIN', { reason: 'OTHER', comment: 'x' }, 6, 1),
    ])
    expect(orderIncidents(d).map((i) => i.kind)).toEqual(['CANCELLED', 'RELEASED_BY_OPERATOR', 'DRIVER_PROBLEM'])
    expect(orderIncidents(d).filter((i) => i.open).map((i) => i.kind)).toEqual(['CANCELLED'])
  })
})

describe('waiting for a free driver (backend 2026-11-16)', () => {
  it('open while searching with no offer since; closed once an offer is made', () => {
    const waiting = [ev('SEARCH_WAITING', 'SYSTEM', { deadlineAt: '2026-11-16T10:20:00.000Z' }, 2)]
    const searching = order({ status: 'SEARCHING', assignedDriverId: null })
    expect(orderIncidents(detail(searching, waiting))[0]).toMatchObject({ kind: 'WAITING_FOR_DRIVER', tone: 'info', open: true })
    expect(orderIncidents(detail(searching, waiting))[0].reason).toMatch(/^Կսպասի մինչև \d{2}:\d{2}/)
    const offered = [...waiting, ev('OFFER_CREATED', 'SYSTEM', {}, 4)]
    expect(orderIncidents(detail(searching, offered))[0].open).toBe(false)
  })
})

describe('listIncident', () => {
  const alert = (kind: string): OpsAlert => ({ id: 1, orderId: 7, kind, data: {}, createdAt: '2026-11-16T10:05:00.000Z' })
  it('a driver alert puts the row on top', () => {
    expect(listIncident(order(), [alert('DRIVER_CANCEL_REQUEST')])).toMatchObject({ urgent: true, tone: 'warn' })
    expect(listIncident(order({ status: 'SEARCHING' }), [alert('DRIVER_CANCELLED_REDISPATCHED')])).toMatchObject({ urgent: true, tone: 'info' })
  })
  it('cancelled: a red chip with the reason, not on top', () => {
    expect(listIncident(order({ status: 'CANCELLED', cancel: { reason: 'WRONG_DATA', comment: null } }), [])).toEqual({ label: '❌ Չեղարկված · Սխալ տվյալներ', tone: 'danger', urgent: false })
  })
  it('an ordinary order: nothing', () => {
    expect(listIncident(order(), [])).toBeNull()
  })
})
