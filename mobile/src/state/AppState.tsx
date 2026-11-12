/**
 * The app's single source of UI state: the SERVER snapshot, plus actions the
 * driver started that the server has not confirmed yet.
 *
 * Rules this file enforces:
 * - Nothing is shown as done until the server confirmed it (no optimistic accept).
 * - A mutation keeps one idempotency key for its whole life; retries reuse it.
 * - Every reconnect / app-foreground / push → re-read the snapshot.
 * - A request that may or may not have arrived is UNCERTAIN and resolved
 *   against the next snapshot (`reconcile`), never guessed.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { AppState as RNAppState, Platform } from 'react-native'
import Constants from 'expo-constants'
import { api, ApiError, configureClient, newKey, UncertainError } from '../api/client'
import type { ProgressAction, Snapshot } from '../api/types'
import { deviceId, getToken, setToken } from '../auth/session'
import { measureClock, type ServerClock } from '../domain/countdown'
import { applyPolicy, bindSession, canLocate, ensureFreshFix, flush, healTracking, locationHealth, recoverTracking, stopTracking, type LocationHealth } from '../location/tracking'
import * as Notifications from 'expo-notifications'
import { ACCEPT_ACTION, offerIdOf, REJECT_ACTION } from '../push/offerNotification'
import { consumeAlarmAction, onAlarmAction, ringingOfferId, stopAlarm } from '../push/offerAlarm'
import { registerPushToken, subscribePush } from '../push/push'
import { syncAlarmSound } from '../push/alertSoundChoice'
import { connectRealtime } from '../realtime/socket'
import { reconcile, type PendingAction, type PendingKind } from './pendingActions'

/** Fallback re-read while foreground + online: worst-case delay for a missed offer hint. */
const SAFETY_REFRESH_MS = 10_000
/** How often the open app looks at the phone's location switch and permission */
const LOCATION_CHECK_MS = 3_000
/**
 * Self-healing: the phone says location works, the driver is working, but the
 * SERVER still sees no fresh fix (the OS task went silent — e.g. GPS was
 * switched off and on while the app was in the background, or iOS stopped
 * the task). Restart tracking by itself, at most this often.
 */
const AUTO_HEAL_MS = 45_000

/** What a manual «refresh my location» tap ended with */
export type GpsRefreshResult = 'OK' | 'SERVICES_OFF' | 'NO_PERMISSION' | 'NO_FIX' | 'NOT_TRACKING'

interface Ctx {
  ready: boolean
  loggedIn: boolean
  snapshot: Snapshot | null
  clock: ServerClock
  connected: boolean
  pending: PendingAction[]
  lastError: string | null
  login(phone: string, password: string): Promise<void>
  logout(): Promise<void>
  refresh(): Promise<void>
  setOnline(value: boolean): Promise<void>
  setExternalBusy(value: boolean): Promise<void>
  consent(): Promise<void>
  /** Withdraw location consent: offline, tracking stops (throws ApiError when refused) */
  withdrawConsent(): Promise<void>
  /** Delete the app account, then sign out on this device (throws ApiError when refused) */
  deleteAccount(password: string): Promise<void>
  accept(offerId: string): Promise<void>
  reject(offerId: string, reason?: string | null): Promise<void>
  progress(orderId: number, action: ProgressAction): Promise<void>
  /** The price agreed with the customer by phone; true when the server took it */
  setPrice(orderId: number, agreedPriceAmd: number): Promise<boolean>
  sendRequest(orderId: number, body: { kind: 'CANCEL' | 'PROBLEM'; reason: string; comment: string | null }): Promise<boolean>
  /** When the test alarm (Alerts setup) last opened the app — proof it works on this phone */
  alarmTestSeenAt: number | null
  /** The phone's location switch and permissions, re-read every few seconds while the app is open */
  locationHealth: LocationHealth | null
  /** GPS just came back: tracking restarts and a fix is on its way */
  gpsRecovering: boolean
  /** Re-read location health now (e.g. after the driver answered the system "turn on location" dialog) */
  recheckLocation(): Promise<void>
  /**
   * The driver's «refresh GPS» button / pull-to-refresh: restart tracking, ask
   * the phone for a fix NOW, send it and re-read the snapshot. Never throws.
   */
  refreshLocation(): Promise<GpsRefreshResult>
}

const AppCtx = createContext<Ctx | null>(null)

export function useApp(): Ctx {
  const ctx = useContext(AppCtx)
  if (!ctx) throw new Error('useApp outside provider')
  return ctx
}

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false)
  const [loggedIn, setLoggedIn] = useState(false)
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const snapshotRef = useRef(snapshot)
  snapshotRef.current = snapshot
  const [clock, setClock] = useState<ServerClock>({ offsetMs: 0 })
  const [connected, setConnected] = useState(false)
  const [pending, setPending] = useState<PendingAction[]>([])
  const [lastError, setLastError] = useState<string | null>(null)
  const [alarmTestSeenAt, setAlarmTestSeenAt] = useState<number | null>(null)
  const [health, setHealth] = useState<LocationHealth | null>(null)
  const healthRef = useRef<LocationHealth | null>(null)
  const [gpsRecovering, setGpsRecovering] = useState(false)
  const recoveringRef = useRef(false)
  const lastHealRef = useRef(0)
  const healMissesRef = useRef(0)
  const pendingRef = useRef(pending)
  pendingRef.current = pending

  const forceLogout = useCallback(async () => {
    await stopAlarm()
    await stopTracking()
    await setToken(null)
    setLoggedIn(false)
    setSnapshot(null)
  }, [])

  useEffect(() => {
    configureClient({ token: getToken, onSessionRevoked: () => void forceLogout() })
    void getToken().then((token) => {
      setLoggedIn(!!token)
      setReady(true)
    })
  }, [forceLogout])

  const refresh = useCallback(async () => {
    try {
      const sent = Date.now()
      const next = await api.snapshot()
      setClock(measureClock(next.serverTime, (sent + Date.now()) / 2))
      setSnapshot(next)
      // A ring for an offer that is no longer this driver's (answered on
      // another path, withdrawn, expired while the push was late): silence.
      const ringing = ringingOfferId()
      if (ringing && ringing !== 'test' && ringing !== next.currentOffer?.offerId) void stopAlarm()
      setPending((current) =>
        reconcile(current, {
          currentOfferId: next.currentOffer?.offerId ?? null,
          activeOrderId: next.activeOrder?.id ?? null,
          activeOrderStatus: next.activeOrder?.status ?? null,
        }),
      )
      await applyPolicy(next.tracking)
      setLastError(null)
    } catch (error) {
      setLastError(error instanceof ApiError ? error.code : 'NETWORK')
    }
  }, [])

  // Live channels while logged in
  useEffect(() => {
    if (!loggedIn) return
    void refresh()
    void registerPushToken().catch(() => undefined)
    void syncAlarmSound().catch(() => undefined)
    const stopRealtime = connectRealtime({
      token: getToken,
      onEvent: () => void refresh(),
      onReady: () => void refresh(),
      onStatus: setConnected,
    })
    const stopPush = subscribePush({
      onAnyMessage: (offerId) => {
        if (offerId) void api.ack(offerId, 'PUSH').catch(() => undefined)
        void refresh()
      },
    })
    const sub = RNAppState.addEventListener('change', (state) => {
      if (state === 'active') {
        // Back in the app: a fix now, not up to one interval later.
        void ensureFreshFix().finally(() => void flush().finally(() => void refresh()))
      }
    })
    // Foreground heartbeat (background heartbeats ride on the location task)
    const heartbeat = setInterval(() => void api.heartbeat().catch(() => undefined), 40_000)
    // Safety net: WebSocket hints and push are both best-effort (Redis down,
    // FCM delayed, socket "open" but silent). While the driver is in the app
    // and online (or has an offer/order), re-read the server state on a fixed
    // cadence so an offer is never missed for longer than one interval.
    const safetyNet = setInterval(() => {
      if (RNAppState.currentState !== 'active') return
      const s = snapshotRef.current
      if (s && (s.switches.wantsOnline || s.currentOffer || s.activeOrder)) {
        // GPS floor first (no-op unless the newest fix is older than the
        // policy interval), so the re-read already shows the fresh position.
        void ensureFreshFix().finally(() => void refresh())
      }
    }, SAFETY_REFRESH_MS)
    return () => {
      stopRealtime()
      stopPush()
      sub.remove()
      clearInterval(heartbeat)
      clearInterval(safetyNet)
    }
  }, [loggedIn, refresh])

  /** Restart the OS task, send a fix now, re-read the snapshot. True when a fix went out. */
  const recover = useCallback(async (gentle = false): Promise<boolean> => {
    if (recoveringRef.current) return false
    recoveringRef.current = true
    lastHealRef.current = Date.now()
    setGpsRecovering(true)
    try {
      const policy = snapshotRef.current?.tracking ?? null
      const sent = gentle ? await healTracking(policy) : await recoverTracking(policy)
      await flush()
      await refresh()
      return sent
    } finally {
      recoveringRef.current = false
      setGpsRecovering(false)
    }
  }, [refresh])

  /**
   * GPS recovery without a tap (2026-11): the open app re-reads the location
   * switch and permissions every few seconds. The moment location works again
   * — switched back on, or allowed in Settings — tracking restarts, a fix is
   * sent at once and the snapshot is re-read, so the driver is offered orders
   * again within seconds. (In the background the OS location task resumes on
   * its own when the switch comes back; JS timers do not run there.)
   * Self-healing on top: when the phone can locate but the server still sees
   * the GPS as stale / missing (the OS task went silent — e.g. the switch was
   * toggled while the app was in the background), tracking is restarted the
   * same way, at most once per AUTO_HEAL_MS.
   */
  const recheckLocation = useCallback(async () => {
    const next = await locationHealth()
    const previous = healthRef.current
    healthRef.current = next
    setHealth((current) =>
      current && current.servicesEnabled === next.servicesEnabled && current.foreground === next.foreground && current.background === next.background ? current : next,
    )
    const cameBack = canLocate(next) && (previous === null ? false : !canLocate(previous) || (!previous.background && next.background))
    const snap = snapshotRef.current
    const working = !!snap && (snap.switches.wantsOnline || !!snap.activeOrder) && (snap.trackingConsentVersion ?? 0) >= 1
    const serverLostUs = working && canLocate(next) && (snap!.availability.gps === 'STALE' || snap!.availability.gps === 'NONE')
    if (!serverLostUs) healMissesRef.current = 0
    // Each self-heal that did not bring the GPS back waits twice as long (45 s … 6 min)
    const wait = AUTO_HEAL_MS * 2 ** Math.min(healMissesRef.current, 3)
    const heal = serverLostUs && Date.now() - lastHealRef.current > wait
    if ((!cameBack && !heal) || recoveringRef.current) return
    if (heal && !cameBack) healMissesRef.current++
    await recover(!cameBack)
  }, [recover])

  useEffect(() => {
    if (!loggedIn) {
      healthRef.current = null
      setHealth(null)
      return
    }
    void recheckLocation()
    const timer = setInterval(() => {
      if (RNAppState.currentState === 'active') void recheckLocation()
    }, LOCATION_CHECK_MS)
    const sub = RNAppState.addEventListener('change', (state) => {
      if (state === 'active') void recheckLocation()
    })
    return () => {
      clearInterval(timer)
      sub.remove()
    }
  }, [loggedIn, recheckLocation])

  // Uncertain actions: retry with the SAME key until the server answers
  useEffect(() => {
    if (!connected) return
    for (const action of pendingRef.current.filter((a) => a.status === 'UNCERTAIN')) void runPending(action)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected])

  async function runPending(action: PendingAction): Promise<boolean> {
    setPending((list) => [...list.filter((a) => a.id !== action.id), { ...action, status: 'SENDING' }])
    try {
      if (action.kind === 'ACCEPT') await api.accept(action.targetId, action.idempotencyKey)
      else if (action.kind === 'REJECT') await api.reject(action.targetId, action.idempotencyKey, (action.payload.reason as string | null) ?? null)
      else if (action.kind === 'PROGRESS') await api.progress(Number(action.targetId), action.payload.action as ProgressAction, action.idempotencyKey)
      else if (action.kind === 'PRICE') await api.confirmPrice(Number(action.targetId), action.payload.agreedPriceAmd as number, action.idempotencyKey)
      else await api.request(Number(action.targetId), action.payload as never, action.idempotencyKey)
      setPending((list) => list.map((a) => (a.id === action.id ? { ...a, status: 'CONFIRMED' } : a)))
      await refresh()
      return true
    } catch (error) {
      const status = error instanceof UncertainError ? 'UNCERTAIN' : 'FAILED'
      const code = error instanceof ApiError ? error.code : error instanceof UncertainError ? null : 'NETWORK'
      setPending((list) => list.map((a) => (a.id === action.id ? { ...a, status, errorCode: code } : a)))
      await refresh()
      return false
    }
  }

  const start = (kind: PendingKind, targetId: string, payload: Record<string, unknown> = {}) =>
    runPending({ id: newKey(), kind, idempotencyKey: newKey(), targetId, payload, status: 'SENDING', errorCode: null, createdAt: Date.now() })

  // «Ընդունել» / «Մերժել» pressed on the offer NOTIFICATION (offerNotification.ts).
  // The press opened the app; the answer goes through the same idempotent
  // path as the offer screen, and the server decides (expired → refused).
  // Also the press that cold-started the app (last response), handled once.
  const handledResponses = useRef(new Set<string>())
  useEffect(() => {
    if (!loggedIn) return
    const handle = (response: Notifications.NotificationResponse) => {
      // iOS: a remote (FCM → APNs) notification carries its data in the
      // TRIGGER payload, not in content.data — reading only content.data made
      // the «Ընդունել» / «Մերժել» buttons do nothing on iPhone (2026-11-12).
      const offerId = offerIdOf(response.notification)
      if (!offerId) return
      const data = { offerId }
      const key = `${response.notification.request.identifier}:${response.actionIdentifier}`
      if (handledResponses.current.has(key)) return
      handledResponses.current.add(key)
      void (Notifications as { clearLastNotificationResponseAsync?: () => Promise<void> }).clearLastNotificationResponseAsync?.()
      if (response.actionIdentifier === ACCEPT_ACTION) void start('ACCEPT', data.offerId)
      else if (response.actionIdentifier === REJECT_ACTION) void start('REJECT', data.offerId, { reason: null })
      else void refresh()
    }
    const sub = Notifications.addNotificationResponseReceivedListener(handle)
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) handle(response)
    })
    return () => sub.remove()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loggedIn])

  // The offer ALARM's buttons (Android, offerAlarm.ts): «Ընդունել» /
  // «Մերժել» opened the app with the driver's answer, which goes through the
  // same idempotent path as the offer screen — the server decides. Read on
  // start (a cold start from the alarm), on every return to the foreground,
  // and when the module reports a press while the app runs.
  useEffect(() => {
    if (!loggedIn) return
    const take = () => {
      const pressed = consumeAlarmAction()
      if (!pressed) return
      if (pressed.offerId === 'test') {
        setAlarmTestSeenAt(Date.now())
        // Long enough to see that it came up over the lock screen
        setTimeout(() => void stopAlarm(), 4000)
        return
      }
      if (pressed.action === 'ACCEPT') void start('ACCEPT', pressed.offerId)
      else if (pressed.action === 'REJECT') void start('REJECT', pressed.offerId, { reason: null })
      else void refresh()
    }
    take()
    const unsubscribe = onAlarmAction(take)
    const sub = RNAppState.addEventListener('change', (state) => {
      if (state === 'active') take()
    })
    return () => {
      unsubscribe()
      sub.remove()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loggedIn])

  const value = useMemo<Ctx>(
    () => ({
      ready,
      loggedIn,
      snapshot,
      clock,
      connected,
      pending,
      lastError,
      alarmTestSeenAt,
      locationHealth: health,
      gpsRecovering,
      recheckLocation,
      async refreshLocation() {
        const now = await locationHealth()
        healthRef.current = now
        setHealth(now)
        if (!now.servicesEnabled) return 'SERVICES_OFF'
        if (!now.foreground) return 'NO_PERMISSION'
        const policy = snapshotRef.current?.tracking
        if (!policy || policy.mode === 'OFF' || policy.locationIntervalSeconds === null) {
          await refresh()
          return 'NOT_TRACKING'
        }
        if (recoveringRef.current) return 'OK'
        return (await recover().catch(() => false)) ? 'OK' : 'NO_FIX'
      },
      async login(phone, password) {
        const session = await api.login({
          phone,
          password,
          deviceId: await deviceId(),
          platform: Platform.OS === 'ios' ? 'ios' : 'android',
          appVersion: Constants.expoConfig?.version ?? '0',
        })
        await setToken(session.token)
        await bindSession(session.sessionId)
        setLoggedIn(true)
      },
      async logout() {
        await api.logout().catch(() => undefined)
        await forceLogout()
      },
      refresh,
      async setOnline(v) {
        setSnapshot(await api.setAvailability({ wantsOnline: v }))
        await refresh()
      },
      async setExternalBusy(v) {
        setSnapshot(await api.setAvailability({ externalBusy: v }))
        await refresh()
      },
      async consent() {
        await api.consent(1)
        await refresh()
      },
      async withdrawConsent() {
        await api.withdrawConsent()
        await stopTracking()
        await refresh()
      },
      async deleteAccount(password) {
        await api.deleteAccount(password)
        // The server already ended every session; this clears the device.
        await forceLogout()
      },
      accept: async (offerId) => void (await start('ACCEPT', offerId)),
      reject: async (offerId, reason = null) => void (await start('REJECT', offerId, { reason })),
      progress: async (orderId, action) => void (await start('PROGRESS', String(orderId), { action })),
      setPrice: (orderId, agreedPriceAmd) => start('PRICE', String(orderId), { agreedPriceAmd }),
      sendRequest: (orderId, body) => start('REQUEST', String(orderId), body),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ready, loggedIn, snapshot, clock, connected, pending, lastError, alarmTestSeenAt, health, gpsRecovering, recheckLocation, refresh, forceLogout],
  )

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>
}
