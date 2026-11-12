/**
 * App access (FleetDriver): who may use the driver app, on a real Postgres.
 *
 * Website drivers get access only when an admin grants it and then sign in
 * with the SAME site password (the TowTruck.passwordHash); app-only drivers
 * register, wait for approval, and never appear on the website. The website
 * STATUS and app access are independent in both directions.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { scryptSync, timingSafeEqual, randomBytes } from 'node:crypto'
import {
  APP_PASSWORD_MAX_LENGTH,
  APP_PASSWORD_MIN_LENGTH,
  APP_PHONE_PATTERN,
  APP_VEHICLE_TYPES,
  FleetAccess,
  parseRegistration,
  type PasswordHasher,
} from '../src/live-dispatch/fleet/fleet-access'
import { insertSiteDriver, insertTowTruck } from '../src/live-dispatch/test-support/test-db'
import { integrationSkip, offset, useTestDatabase, YEREVAN } from './helpers'
import { createOrder, ctx, drain, eligibleAppOnlyDriver, eligibleDriver, harness, pendingOffer, startDispatch } from './support'

/** scrypt stand-in for bcrypt (same contract); counts comparisons */
function testHasher(): PasswordHasher & { compares: number } {
  const hash = (password: string, salt = randomBytes(8).toString('hex')) => `${salt}:${scryptSync(password, salt, 16).toString('hex')}`
  const self = {
    compares: 0,
    dummyHash: hash('never-a-real-password'),
    async hash(password: string) {
      return hash(password)
    },
    async compare(password: string, stored: string) {
      self.compares++
      const [salt, digest] = stored.split(':')
      return timingSafeEqual(Buffer.from(digest, 'hex'), scryptSync(password, salt, 16))
    },
  }
  return self
}

const REGISTRATION = {
  password: 'app-password-1',
  driverName: '  Արամ   Պետրոսյան ',
  vehicleType: 'flatbed',
  capacityTons: 3.5,
  manipulator: false,
  wheelSkates: true,
  vehicleDescription: 'Isuzu NPR, 35AA350',
}

let phoneSeq = 0
const nextPhone = () => `+374550${String(++phoneSeq).padStart(5, '0')}`

describe('app access: site drivers and app-only drivers (real Postgres)', { skip: integrationSkip }, () => {
  const dbCtx = useTestDatabase()

  function access() {
    const hasher = testHasher()
    return { hasher, access: new FleetAccess(dbCtx.get().pool, hasher) }
  }

  /** A website profile whose (website) password is `password` */
  async function siteTruck(hasher: PasswordHasher, password: string, extra: { isActive?: boolean } = {}) {
    const phone = nextPhone()
    const towTruckId = await insertTowTruck(dbCtx.get().pool, { phone, passwordHash: await hasher.hash(password), ...extra })
    return { phone, towTruckId }
  }

  async function adminId(): Promise<number> {
    const h = await harness(dbCtx.get())
    return h.adminId
  }

  /** An app sign-up as POST /driver-app/site-registrations files it — a website RegistrationRequest */
  async function appSignup(phone: string, passwordHash: string, status: 'PENDING' | 'APPROVED' | 'REJECTED' = 'PENDING', approvedTowTruckId: number | null = null) {
    await dbCtx.get().pool.query(
      `INSERT INTO "RegistrationRequest" ("status", "firstName", "lastName", "phone", "vehicleBrand", "vehicleYear", "vehicleType",
                                          "capacityRange", "regionSlugs", "citySlugs", "services", "updatedAt", "source", "passwordHash", "approvedTowTruckId")
       VALUES ($1::"RegistrationStatus", 'Արամ', 'Պետրոսյան', $2, 'Isuzu', 2015, 'flatbed', '2-3.5', '{kotayk}', '{abovyan}', '{towing}', now(),
               'APP', $3, $4::int)`,
      [status, phone, passwordHash, approvedTowTruckId],
    )
  }

  it('app sign-up (2026-11): pending → APP_ACCOUNT_PENDING only with ITS password; rejected → APP_ACCOUNT_REJECTED; still one comparison', async () => {
    const { access: a, hasher } = access()
    const phone = nextPhone()
    await appSignup(phone, await hasher.hash('chosen-in-app'))
    hasher.compares = 0
    await assert.rejects(a.authenticate(phone, 'chosen-in-app'), (e: { code: string }) => e.code === 'APP_ACCOUNT_PENDING')
    await assert.rejects(a.authenticate(phone, 'a-guess'), (e: { code: string }) => e.code === 'INVALID_CREDENTIALS', 'no status without the password')
    assert.equal(hasher.compares, 2, 'exactly one comparison per attempt')
    await dbCtx.get().pool.query(`UPDATE "RegistrationRequest" SET "status" = 'REJECTED' WHERE "phone" = $1`, [phone])
    await assert.rejects(a.authenticate(phone, 'chosen-in-app'), (e: { code: string }) => e.code === 'APP_ACCOUNT_REJECTED')
  })

  it('app sign-up approved: the first sign-in grants app access, once; a suspension is never undone by signing in', async () => {
    const { access: a, hasher } = access()
    const { phone, towTruckId } = await siteTruck(hasher, 'chosen-in-app')
    await appSignup(phone, '', 'APPROVED', towTruckId)
    const first = await a.authenticate(phone, 'chosen-in-app')
    assert.equal(first.kind, 'SITE_LINKED')
    assert.equal((await a.authenticate(phone, 'chosen-in-app')).driverId, first.driverId, 'the same access, not a second row')
    const [{ n }] = await dbCtx.get().pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM "FleetDriver" WHERE "towTruckId" = $1::int`, [towTruckId])
    assert.equal(n, 1)
    await a.suspend(first.driverId, 'test', await adminId())
    await assert.rejects(a.authenticate(phone, 'chosen-in-app'), (e: { code: string }) => e.code === 'APP_ACCESS_SUSPENDED')
  })

  it('a website profile that did NOT come from the app still needs an admin grant', async () => {
    const { access: a, hasher } = access()
    const { phone, towTruckId } = await siteTruck(hasher, 'site-pass-web')
    await appSignup(phone, '', 'REJECTED', towTruckId)
    await assert.rejects(a.authenticate(phone, 'site-pass-web'), (e: { code: string }) => e.code === 'APP_ACCESS_NOT_GRANTED')
  })

  it('prepareSiteRegistration: refuses a number with an app-only account or an app sign-up already in review', async () => {
    const { access: a, hasher } = access()
    const phone = nextPhone()
    const { passwordHash } = await a.prepareSiteRegistration(phone, 'chosen-in-app')
    assert.ok(await hasher.compare('chosen-in-app', passwordHash), 'hashed, never stored in clear')
    await appSignup(phone, passwordHash)
    await assert.rejects(a.prepareSiteRegistration(phone, 'another-pass'), (e: { code: string }) => e.code === 'REGISTRATION_ALREADY_PENDING')
    const other = nextPhone()
    const { driverId } = await a.register({ ...REGISTRATION, phone: other })
    await a.approve(driverId, await adminId())
    await assert.rejects(a.prepareSiteRegistration(other, 'another-pass'), (e: { code: string }) => e.code === 'PHONE_ALREADY_REGISTERED')
    await assert.rejects(a.prepareSiteRegistration(nextPhone(), 'short'), (e: { code: string }) => e.code === 'VALIDATION_FAILED')
  })

  it('a website driver WITHOUT a grant cannot use the app, even with the right site password', async () => {
    const { access: a, hasher } = access()
    const { phone } = await siteTruck(hasher, 'site-pass-1')
    await assert.rejects(a.authenticate(phone, 'site-pass-1'), (e: { code: string }) => e.code === 'APP_ACCESS_NOT_GRANTED')
    await assert.rejects(a.authenticate(phone, 'wrong-pass'), (e: { code: string }) => e.code === 'INVALID_CREDENTIALS', 'no access status without the password')
  })

  it('app-only: the driver deletes his own account — personal data cleared, number free again', async () => {
    const { access: a } = access()
    const phone = nextPhone()
    const { driverId } = await a.register({ ...REGISTRATION, phone, baseLatitude: 40.18, baseLongitude: 44.51 })
    await a.approve(driverId, await adminId())
    await assert.rejects(a.deleteOwnAccount(driverId, 'not-the-password'), (e: { code: string }) => e.code === 'INVALID_CREDENTIALS')
    await a.deleteOwnAccount(driverId, REGISTRATION.password)
    const [row] = await dbCtx.get().pool.query<Record<string, unknown>>(
      `SELECT "status", "phone", "passwordHash", "driverName", "baseLatitude" FROM "FleetDriver" WHERE "id" = $1::int`,
      [driverId],
    )
    assert.deepEqual(row, { status: 'DELETED', phone: null, passwordHash: null, driverName: null, baseLatitude: null })
    await assert.rejects(a.authenticate(phone, REGISTRATION.password), (e: { code: string }) => e.code === 'INVALID_CREDENTIALS')
    // the number may register again — a new account, not the old one
    const again = await a.register({ ...REGISTRATION, phone })
    assert.notEqual(again.driverId, driverId)
  })

  it('a site driver deleting his app account ends app access only; an admin may grant it again', async () => {
    const { access: a, hasher } = access()
    const { phone, towTruckId } = await siteTruck(hasher, 'site-pass-del')
    const granted = await a.grantSiteAccess(towTruckId, await adminId())
    await a.deleteOwnAccount(granted.id, 'site-pass-del')
    await assert.rejects(a.authenticate(phone, 'site-pass-del'), (e: { code: string }) => e.code === 'APP_ACCESS_NOT_GRANTED')
    const [{ n }] = await dbCtx.get().pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM "TowTruck" WHERE "id" = $1::int`, [towTruckId])
    assert.equal(n, 1, 'the website profile is untouched')
    await a.grantSiteAccess(towTruckId, await adminId())
    assert.equal((await a.authenticate(phone, 'site-pass-del')).driverId, granted.id)
  })

  it('deleting an account that SIGNED UP IN THE APP also erases the website profile it created (App Store 5.1.1(v)); the number may sign up again', async () => {
    const { access: a, hasher } = access()
    const { phone, towTruckId } = await siteTruck(hasher, 'chosen-in-app')
    await appSignup(phone, '', 'APPROVED', towTruckId)
    const { driverId } = await a.authenticate(phone, 'chosen-in-app') // first sign-in grants access
    await dbCtx.get().pool.query(
      `INSERT INTO "TowTruckImage" ("towTruckId", "path", "url", "width", "height", "sizeBytes", "position") VALUES ($1::int, 'uploads/x.webp', 'http://x/x.webp', 10, 10, 10, 0)`,
      [towTruckId],
    )
    await a.deleteOwnAccount(driverId, 'chosen-in-app')
    const [truck] = await dbCtx.get().pool.query<Record<string, unknown>>(
      `SELECT "isActive", "phone", "driverName", "passwordHash", "latitude", "email" FROM "TowTruck" WHERE "id" = $1::int`,
      [towTruckId],
    )
    assert.equal(truck.isActive, false, 'off the website')
    assert.equal(truck.passwordHash, null)
    assert.notEqual(truck.phone, phone, 'the phone is released')
    assert.equal(truck.driverName, 'Ջնջված հաշիվ')
    const [{ n }] = await dbCtx.get().pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM "TowTruckImage" WHERE "towTruckId" = $1::int`, [towTruckId])
    assert.equal(n, 0, 'photos detached (the nightly purge deletes the files)')
    const [request] = await dbCtx.get().pool.query<{ phone: string; firstName: string }>(
      `SELECT "phone", "firstName" FROM "RegistrationRequest" WHERE "approvedTowTruckId" = $1::int`,
      [towTruckId],
    )
    assert.notEqual(request.phone, phone)
    await assert.rejects(a.authenticate(phone, 'chosen-in-app'), (e: { code: string }) => e.code === 'INVALID_CREDENTIALS')
  })

  it('grant → the SAME site password signs into the app; one row; idempotent', async () => {
    const { access: a, hasher } = access()
    const { phone, towTruckId } = await siteTruck(hasher, 'site-pass-1')
    const granted = await a.grantSiteAccess(towTruckId, await adminId())
    assert.equal(granted.kind, 'SITE_LINKED')
    assert.equal(granted.status, 'ACTIVE')
    assert.equal(granted.towTruckId, towTruckId)
    assert.equal(granted.phone, phone, 'profile data comes from the website row')
    assert.deepEqual(await a.authenticate(phone, 'site-pass-1'), { driverId: granted.id, kind: 'SITE_LINKED', mustChangePassword: false })
    await assert.rejects(a.authenticate(phone, 'wrong'), (e: { code: string }) => e.code === 'INVALID_CREDENTIALS')
    await a.grantSiteAccess(towTruckId, await adminId())
    const [{ n }] = await dbCtx.get().pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM "FleetDriver" WHERE "towTruckId" = $1::int`, [towTruckId])
    assert.equal(n, 1)
  })

  it('a website driver who has no password yet (Telegram handover pending) cannot sign in', async () => {
    const { access: a, hasher } = access()
    const phone = nextPhone()
    const towTruckId = await insertTowTruck(dbCtx.get().pool, { phone, passwordHash: null })
    await a.grantSiteAccess(towTruckId, await adminId())
    await assert.rejects(a.authenticate(phone, ''), (e: { code: string }) => e.code === 'INVALID_CREDENTIALS')
    assert.equal(hasher.compares, 1, 'still exactly one comparison (against the dummy)')
  })

  it('suspend → every device logged out, login refused, not eligible; reactivate restores', async () => {
    const h = await harness(dbCtx.get())
    const { access: a } = access()
    const d = await eligibleDriver(h, offset(YEREVAN, 500, 0))
    await a.suspend(d.driverId, 'Տեստ', h.adminId)
    const [session] = await h.db.pool.query<{ revokedAt: Date | null }>(`SELECT "revokedAt" FROM "DriverDeviceSession" WHERE "id" = $1::uuid`, [d.sessionId])
    assert.ok(session.revokedAt, 'the device session is revoked at once')
    const state = await h.rt.fleet.driverState(d.driverId)
    assert.equal(state!.isActive, false)
    assert.equal(state!.wantsOnline, false)
    const [{ phone }] = await h.db.pool.query<{ phone: string }>(
      `UPDATE "TowTruck" SET "passwordHash" = $2 WHERE "id" = $1::int RETURNING "phone"`,
      [d.towTruckId, await access().hasher.hash('site-pw-1')],
    )
    await assert.rejects(a.authenticate(phone, 'site-pw-1'), (e: { code: string }) => e.code === 'APP_ACCESS_SUSPENDED')
    const [tt] = await h.db.pool.query<{ isActive: boolean }>(`SELECT "isActive" FROM "TowTruck" WHERE "id" = $1::int`, [d.towTruckId])
    assert.equal(tt.isActive, true, 'suspending APP access never touches the website listing')
    await a.reactivate(d.driverId, h.adminId)
    assert.equal((await a.authenticate(phone, 'site-pw-1')).driverId, d.driverId)
  })

  it('suspend is refused while the driver holds an order (an operator releases it first)', async () => {
    const h = await harness(dbCtx.get())
    await h.db.pool.query(`TRUNCATE "DispatchOrder", "OrderOffer", "OutboxEvent" CASCADE`)
    await h.db.pool.query(`UPDATE "DriverPresence" SET "wantsOnline" = false`)
    const { access: a } = access()
    const d = await eligibleDriver(h, offset(YEREVAN, 400, 0))
    const order = await createOrder(h)
    await startDispatch(h, order)
    await drain(h)
    const offer = await pendingOffer(h, order.id)
    assert.equal(offer?.driverId, d.driverId)
    const accepted = await h.service.driverAccept(d.driverId, offer!.id, ctx())
    assert.equal(accepted.status, 200)
    await assert.rejects(a.suspend(d.driverId, 'Տեստ', h.adminId), (e: { code: string }) => e.code === 'DRIVER_BUSY')
  })

  it('a suspended driver cannot accept an offer made just before (lock-ordered with the suspend)', async () => {
    const h = await harness(dbCtx.get())
    await h.db.pool.query(`TRUNCATE "DispatchOrder", "OrderOffer", "OutboxEvent" CASCADE`)
    await h.db.pool.query(`UPDATE "DriverPresence" SET "wantsOnline" = false`)
    const { access: a } = access()
    const d = await eligibleDriver(h, offset(YEREVAN, 400, 0))
    const order = await createOrder(h)
    await startDispatch(h, order)
    await drain(h)
    const offer = await pendingOffer(h, order.id)
    await a.suspend(d.driverId, 'Տեստ', h.adminId)
    const refused = await h.service.driverAccept(d.driverId, offer!.id, ctx())
    assert.equal(refused.status, 409)
    assert.equal((refused.body as { code: string }).code, 'DRIVER_UNAVAILABLE')
  })

  it('website status and app access are INDEPENDENT: taken off the site, still signs in and gets orders — but is not on the public search', async () => {
    const h = await harness(dbCtx.get())
    await h.db.pool.query(`TRUNCATE "DispatchOrder", "OrderOffer", "OutboxEvent" CASCADE`)
    await h.db.pool.query(`UPDATE "DriverPresence" SET "wantsOnline" = false`)
    const { access: a, hasher } = access()
    const d = await eligibleDriver(h, offset(YEREVAN, 300, 0))
    const [{ phone }] = await h.db.pool.query<{ phone: string }>(
      `UPDATE "TowTruck" SET "isActive" = false, "deactivationReason" = 'UNPAID', "passwordHash" = $2 WHERE "id" = $1::int RETURNING "phone"`,
      [d.towTruckId, await hasher.hash('site-pw-1')],
    )
    assert.equal((await a.authenticate(phone, 'site-pw-1')).driverId, d.driverId, 'the website deactivation does not block the app')
    const view = await a.get(d.driverId)
    assert.equal(view.isActive, true)
    assert.equal(view.siteListed, false)
    const order = await createOrder(h)
    await startDispatch(h, order)
    await drain(h)
    assert.equal((await pendingOffer(h, order.id))?.driverId, d.driverId, 'still receives orders')
    const [{ listed }] = await h.db.pool.query<{ listed: boolean }>(`SELECT "siteListed" AS "listed" FROM "FleetDriverProfile" WHERE "id" = $1::int`, [d.driverId])
    assert.equal(listed, false, 'the public search reads siteListed, so they are not on the website')
  })

  it('app-only: register → PENDING (cannot sign in) → approve → signs in with ITS password', async () => {
    const { access: a, hasher } = access()
    const phone = nextPhone()
    const registered = await a.register({ ...REGISTRATION, phone })
    assert.equal(registered.status, 'PENDING_REVIEW')
    const view = await a.get(registered.driverId)
    assert.equal(view.kind, 'APP_ONLY')
    assert.equal(view.driverName, 'Արամ Պետրոսյան', 'whitespace normalised')
    assert.equal(view.towTruckId, null)
    assert.equal(view.isActive, false)
    await assert.rejects(a.authenticate(phone, REGISTRATION.password), (e: { code: string }) => e.code === 'APP_ACCOUNT_PENDING')
    await assert.rejects(a.authenticate(phone, 'not-the-password'), (e: { code: string }) => e.code === 'INVALID_CREDENTIALS', 'status is never revealed without the password')
    await a.approve(registered.driverId, await adminId())
    assert.deepEqual(await a.authenticate(phone, REGISTRATION.password), { driverId: registered.driverId, kind: 'APP_ONLY', mustChangePassword: false })
    const [{ passwordHash }] = await dbCtx.get().pool.query<{ passwordHash: string }>(`SELECT "passwordHash" FROM "FleetDriver" WHERE "id" = $1::int`, [registered.driverId])
    assert.ok(!passwordHash.includes(REGISTRATION.password), 'stored hashed')
  })

  it('an unknown number costs exactly one hash comparison (no timing hint) and is INVALID_CREDENTIALS', async () => {
    const { access: a, hasher } = access()
    await assert.rejects(a.authenticate(nextPhone(), 'whatever-1'), (e: { code: string }) => e.code === 'INVALID_CREDENTIALS')
    assert.equal(hasher.compares, 1)
  })

  it('never a second account: a number already on the website cannot register in the app', async () => {
    const { access: a } = access()
    const phone = nextPhone()
    await insertTowTruck(dbCtx.get().pool, { phone })
    await assert.rejects(a.register({ ...REGISTRATION, phone }), (e: { code: string }) => e.code === 'PHONE_BELONGS_TO_SITE_DRIVER')
  })

  it('duplicate pending → REGISTRATION_ALREADY_PENDING; rejected → may apply again (same row)', async () => {
    const { access: a } = access()
    const phone = nextPhone()
    const first = await a.register({ ...REGISTRATION, phone })
    await assert.rejects(a.register({ ...REGISTRATION, phone }), (e: { code: string }) => e.code === 'REGISTRATION_ALREADY_PENDING')
    await assert.rejects(a.reject(first.driverId, '', await adminId()), (e: { code: string }) => e.code === 'VALIDATION_FAILED', 'a reason is required')
    await a.reject(first.driverId, 'Չհաջողվեց կապ հաստատել', await adminId())
    await assert.rejects(a.authenticate(phone, REGISTRATION.password), (e: { code: string }) => e.code === 'APP_ACCOUNT_REJECTED')
    const again = await a.register({ ...REGISTRATION, phone, driverName: 'Արամ Պ.' })
    assert.equal(again.driverId, first.driverId)
    const [{ n }] = await dbCtx.get().pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM "FleetDriverEvent" WHERE "driverId" = $1::int`, [first.driverId])
    assert.equal(n, 3, 'REGISTERED, REJECTED, REGISTERED_AGAIN')
  })

  it('two simultaneous registrations of one number: exactly one succeeds', async () => {
    const { access: a } = access()
    const phone = nextPhone()
    const results = await Promise.allSettled([a.register({ ...REGISTRATION, phone }), a.register({ ...REGISTRATION, phone })])
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1)
    const failure = results.find((r) => r.status === 'rejected') as PromiseRejectedResult
    assert.equal((failure.reason as { code: string }).code, 'REGISTRATION_ALREADY_PENDING')
  })

  it('approve is refused if the number has meanwhile appeared on the website', async () => {
    const { access: a } = access()
    const phone = nextPhone()
    const r = await a.register({ ...REGISTRATION, phone })
    await insertTowTruck(dbCtx.get().pool, { phone })
    await assert.rejects(a.approve(r.driverId, await adminId()), (e: { code: string }) => e.code === 'PHONE_BELONGS_TO_SITE_DRIVER')
  })

  it('grant is refused for a site profile whose number has an app-only account → link instead; link keeps the id and history', async () => {
    const h = await harness(dbCtx.get())
    await h.db.pool.query(`TRUNCATE "DispatchOrder", "OrderOffer", "OutboxEvent" CASCADE`)
    await h.db.pool.query(`UPDATE "DriverPresence" SET "wantsOnline" = false`)
    const { access: a } = access()
    const phone = nextPhone()
    const appDriver = await eligibleAppOnlyDriver(h, offset(YEREVAN, 300, 0), { phone })
    const towTruckId = await insertTowTruck(h.db.pool, { phone, passwordHash: await access().hasher.hash('site-pw-1') })
    await assert.rejects(a.grantSiteAccess(towTruckId, h.adminId), (e: { code: string }) => e.code === 'PHONE_HAS_APP_ONLY_ACCOUNT')
    const linked = await a.linkToSite(appDriver.driverId, towTruckId, h.adminId)
    assert.equal(linked.id, appDriver.driverId, 'same driver id — orders, offers and locations stay attached')
    assert.equal(linked.kind, 'SITE_LINKED')
    assert.equal(linked.towTruckId, towTruckId)
    const [row] = await h.db.pool.query<{ passwordHash: string | null; phone: string | null }>(`SELECT "passwordHash", "phone" FROM "FleetDriver" WHERE "id" = $1::int`, [appDriver.driverId])
    assert.equal(row.passwordHash, null, 'the app password is gone; the site password is the only one now')
    const [s] = await h.db.pool.query<{ revokedAt: Date | null }>(`SELECT "revokedAt" FROM "DriverDeviceSession" WHERE "id" = $1::uuid`, [appDriver.sessionId])
    assert.ok(s.revokedAt)
    const identity = await a.authenticate(phone, 'site-pw-1')
    assert.equal(identity.driverId, appDriver.driverId)
    await assert.rejects(a.linkToSite(appDriver.driverId, towTruckId, h.adminId), (e: { code: string }) => e.code === 'INVALID_TRANSITION')
  })

  it('an approved app-only driver receives and accepts orders like anyone else', async () => {
    const h = await harness(dbCtx.get())
    await h.db.pool.query(`TRUNCATE "DispatchOrder", "OrderOffer", "OutboxEvent" CASCADE`)
    await h.db.pool.query(`UPDATE "DriverPresence" SET "wantsOnline" = false`)
    const d = await eligibleAppOnlyDriver(h, offset(YEREVAN, 600, 0), { wheelSkates: true })
    const order = await createOrder(h)
    await startDispatch(h, order)
    await drain(h)
    const offer = await pendingOffer(h, order.id)
    assert.equal(offer?.driverId, d.driverId)
    const accepted = await h.service.driverAccept(d.driverId, offer!.id, ctx())
    assert.equal(accepted.status, 200)
    const snapshot = await h.service.driverSnapshot(d.driverId)
    assert.equal(snapshot.driver.kind, 'APP_ONLY')
    assert.ok(snapshot.activeOrder)
  })

  it('a PENDING app-only driver is never offered an order', async () => {
    const h = await harness(dbCtx.get())
    await h.db.pool.query(`TRUNCATE "DispatchOrder", "OrderOffer", "OutboxEvent" CASCADE`)
    await h.db.pool.query(`UPDATE "DriverPresence" SET "wantsOnline" = false`)
    await eligibleAppOnlyDriver(h, offset(YEREVAN, 600, 0), { status: 'PENDING_REVIEW' })
    const order = await createOrder(h)
    await startDispatch(h, order)
    await drain(h)
    assert.equal(await pendingOffer(h, order.id), null)
  })

  it('the shape CHECK: a site-linked row cannot carry its own password or vehicle data', async () => {
    const towTruckId = await insertTowTruck(dbCtx.get().pool)
    await assert.rejects(
      dbCtx.get().pool.query(`INSERT INTO "FleetDriver" ("kind","status","towTruckId","passwordHash") VALUES ('SITE_LINKED','ACTIVE',$1::int,'x')`, [towTruckId]),
      /FleetDriver_shape_check/,
    )
    await assert.rejects(
      dbCtx.get().pool.query(`INSERT INTO "FleetDriver" ("kind","status","towTruckId") VALUES ('SITE_LINKED','PENDING_REVIEW',$1::int)`, [towTruckId]),
      /FleetDriver_shape_check/,
      'a website driver is granted, never "pending"',
    )
    const { driverId } = await insertSiteDriver(dbCtx.get().pool)
    assert.ok(driverId > 0)
  })
})

describe('registration validation (pure)', () => {
  const ok = { ...REGISTRATION, phone: '+37455000001' }
  it('accepts a valid form and normalises it', () => {
    const r = parseRegistration(ok)
    assert.equal(r.driverName, 'Արամ Պետրոսյան')
    assert.equal(r.maxLoadTons, null)
    assert.equal(r.baseLatitude, null)
  })
  it('accepts an optional base location inside Armenia, both coordinates or neither', () => {
    const r = parseRegistration({ ...ok, baseLatitude: 40.1792, baseLongitude: '44.4991' })
    assert.deepEqual([r.baseLatitude, r.baseLongitude], [40.1792, 44.4991])
    for (const bad of [{ baseLatitude: 40.18 }, { baseLatitude: 48.85, baseLongitude: 2.35 }, { baseLatitude: 'x', baseLongitude: 44.5 }]) {
      assert.throws(() => parseRegistration({ ...ok, ...bad }), (e: { code: string; details: { field: string } }) => e.details.field === 'baseLocation')
    }
  })
  for (const [field, value] of [
    ['phone', '091000001'],
    ['phone', '+3749100000'],
    ['password', 'short'],
    ['password', 'x'.repeat(73)],
    ['driverName', ' a '],
    ['vehicleType', 'tractor'],
    ['capacityTons', 0],
    ['capacityTons', 'abc'],
    ['maxLoadTons', 500],
    ['manipulator', 'yes'],
    ['wheelSkates', undefined],
    ['vehicleDescription', 'x'.repeat(201)],
  ] as const) {
    it(`refuses ${field}=${JSON.stringify(value)}`, () => {
      assert.throws(() => parseRegistration({ ...ok, [field]: value }), (e: { code: string; details: { field: string } }) => e.code === 'VALIDATION_FAILED' && e.details.field === field)
    })
  }
})

describe('manual sync points (read as text)', () => {
  const root = join(__dirname, '..', '..')
  it('APP_VEHICLE_TYPES = frontend VehicleType values = mobile picker', () => {
    const enums = readFileSync(join(root, 'frontend/types/enums.ts'), 'utf8')
    const block = enums.slice(enums.indexOf('export enum VehicleType'), enums.indexOf('}', enums.indexOf('export enum VehicleType')))
    const frontend = [...block.matchAll(/=\s*'([^']+)'/g)].map((m) => m[1]).sort()
    assert.deepEqual([...APP_VEHICLE_TYPES].sort(), frontend)
    const mobile = readFileSync(join(root, 'mobile/src/domain/vehicleTypes.ts'), 'utf8')
    for (const type of APP_VEHICLE_TYPES) assert.ok(mobile.includes(`'${type}'`), `mobile picker lacks ${type}`)
  })
  it('phone pattern and password limits match the website backend', () => {
    const phone = readFileSync(join(root, 'backend/src/common/phone.ts'), 'utf8')
    assert.ok(phone.includes(`ARMENIAN_PHONE_PATTERN = ${APP_PHONE_PATTERN.toString()}`))
    const password = readFileSync(join(root, 'backend/src/driver-auth/driver-password.ts'), 'utf8')
    assert.ok(password.includes(`PASSWORD_MIN_LENGTH = ${APP_PASSWORD_MIN_LENGTH}`))
    assert.ok(password.includes(`PASSWORD_MAX_LENGTH = ${APP_PASSWORD_MAX_LENGTH}`))
  })
})
