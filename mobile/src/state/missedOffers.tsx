/**
 * The missed-offers list, shared by Home (the «you missed N» banner), the
 * Orders tab (its entry card) and the list screen itself — one fetch, one
 * "seen" mark. The mark is kept on the phone: opening the list clears the
 * badge until the next missed offer.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { AppState as RNAppState } from 'react-native'
import * as SecureStore from 'expo-secure-store'
import { api } from '../api/client'
import type { MissedOffer } from '../api/types'
import { MISSED_PAGE_SIZE, nextMissedCursor, unseenCount } from '../domain/missed'
import { useApp } from './AppState'

const SEEN_KEY = 'evk.missedSeenAt'

interface MissedCtx {
  items: MissedOffer[]
  loading: boolean
  loadingMore: boolean
  error: boolean
  /** More pages on the server */
  hasMore: boolean
  /** Offered after the driver last opened the list */
  unseen: number
  reload(): Promise<void>
  loadMore(): Promise<void>
  markSeen(): void
}

const Ctx = createContext<MissedCtx | null>(null)

export function useMissedOffers(): MissedCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useMissedOffers outside MissedOffersProvider')
  return ctx
}

export function MissedOffersProvider({ children }: { children: React.ReactNode }) {
  const app = useApp()
  const [items, setItems] = useState<MissedOffer[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [seenAt, setSeenAt] = useState<number | null>(null)
  const busy = useRef(false)

  useEffect(() => {
    void SecureStore.getItemAsync(SEEN_KEY)
      .then((value) => setSeenAt(value ? Number(value) : null))
      .catch(() => undefined)
  }, [])

  const reload = useCallback(async () => {
    if (busy.current) return
    busy.current = true
    setLoading(true)
    try {
      const page = await api.missedOffers()
      setItems(page)
      setHasMore(page.length >= MISSED_PAGE_SIZE)
      setError(false)
    } catch {
      setError(true)
    } finally {
      busy.current = false
      setLoading(false)
    }
  }, [])

  const loadMore = useCallback(async () => {
    const cursor = nextMissedCursor(items)
    if (!cursor || loadingMore) return
    setLoadingMore(true)
    try {
      const page = await api.missedOffers(cursor)
      setItems((current) => [...current, ...page.filter((p) => !current.some((c) => c.offerId === p.offerId))])
      setHasMore(page.length >= MISSED_PAGE_SIZE)
    } catch {
      setError(true)
    } finally {
      setLoadingMore(false)
    }
  }, [items, loadingMore])

  const markSeen = useCallback(() => {
    const now = Date.now()
    setSeenAt(now)
    void SecureStore.setItemAsync(SEEN_KEY, String(now)).catch(() => undefined)
  }, [])

  // Re-read when signed in, when the app comes back, and whenever an offer
  // leaves the screen (answered or expired) — that is when one may be missed.
  const offerId = app.snapshot?.currentOffer?.offerId ?? null
  useEffect(() => {
    if (!app.loggedIn) {
      setItems([])
      return
    }
    if (offerId === null) void reload()
  }, [app.loggedIn, offerId, reload])
  useEffect(() => {
    if (!app.loggedIn) return
    const sub = RNAppState.addEventListener('change', (state) => {
      if (state === 'active') void reload()
    })
    return () => sub.remove()
  }, [app.loggedIn, reload])

  const value = useMemo<MissedCtx>(
    () => ({ items, loading, loadingMore, error, hasMore, unseen: unseenCount(items, seenAt), reload, loadMore, markSeen }),
    [items, loading, loadingMore, error, hasMore, seenAt, reload, loadMore, markSeen],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
