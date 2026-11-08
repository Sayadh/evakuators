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
import { applyPolicy, bindSession, flush, stopTracking } from '../location/tracking'
import { registerPushToken, subscribePush } from '../push/push'
import { connectRealtime } from '../realtime/socket'
import { reconcile, type PendingAction, type PendingKind } from './pendingActions'

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
  accept(offerId: string): Promise<void>
  reject(offerId: string): Promise<void>
  progress(orderId: number, action: ProgressAction): Promise<void>
  sendRequest(orderId: number, body: { kind: 'CANCEL' | 'PROBLEM'; reason: string; comment: string | null }): Promise<boolean>
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
  const [clock, setClock] = useState<ServerClock>({ offsetMs: 0 })
  const [connected, setConnected] = useState(false)
  const [pending, setPending] = useState<PendingAction[]>([])
  const [lastError, setLastError] = useState<string | null>(null)
  const pendingRef = useRef(pending)
  pendingRef.current = pending

  const forceLogout = useCallback(async () => {
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
        void flush()
        void refresh()
      }
    })
    // Foreground heartbeat (background heartbeats ride on the location task)
    const heartbeat = setInterval(() => void api.heartbeat().catch(() => undefined), 40_000)
    return () => {
      stopRealtime()
      stopPush()
      sub.remove()
      clearInterval(heartbeat)
    }
  }, [loggedIn, refresh])

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
      else if (action.kind === 'REJECT') await api.reject(action.targetId, action.idempotencyKey)
      else if (action.kind === 'PROGRESS') await api.progress(Number(action.targetId), action.payload.action as ProgressAction, action.idempotencyKey)
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

  const value = useMemo<Ctx>(
    () => ({
      ready,
      loggedIn,
      snapshot,
      clock,
      connected,
      pending,
      lastError,
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
      accept: async (offerId) => void (await start('ACCEPT', offerId)),
      reject: async (offerId) => void (await start('REJECT', offerId)),
      progress: async (orderId, action) => void (await start('PROGRESS', String(orderId), { action })),
      sendRequest: (orderId, body) => start('REQUEST', String(orderId), body),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ready, loggedIn, snapshot, clock, connected, pending, lastError, refresh, forceLogout],
  )

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>
}
