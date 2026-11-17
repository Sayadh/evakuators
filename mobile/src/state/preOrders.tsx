/**
 * Pre-orders (2026-11-17), shared by Home (the «N pre-orders wait for your
 * price» banner), the Orders tab (its entry card) and the list screen — one
 * fetch. Re-read on sign-in, on return to the app and whenever a pre-order
 * push arrives (push/preOrderEvents.ts).
 *
 * `unseen` is the number on the «Պատվերներ» tab: open, unpriced, and not yet
 * shown in the list. The seen ids are kept on the phone (like missed offers).
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { AppState as RNAppState } from 'react-native'
import * as SecureStore from 'expo-secure-store'
import { api } from '../api/client'
import type { PreOrder } from '../api/types'
import { pruneSeen, sortPreOrders, unansweredCount, unseenCount } from '../domain/preOrders'
import { onPreOrderArrived } from '../push/preOrderEvents'
import { useApp } from './AppState'

interface PreOrdersCtx {
  items: PreOrder[]
  loading: boolean
  error: boolean
  /** Open and not yet priced by him */
  unanswered: number
  /** …and not yet shown in the list: the tab's number */
  unseen: number
  /** Everything listed now counts as seen */
  markSeen(): void
  reload(): Promise<void>
  /** Saves his price (or withdraws it with null); throws on refusal, the list is re-read either way */
  setBid(id: number, priceAmd: number | null): Promise<void>
}

const Ctx = createContext<PreOrdersCtx | null>(null)
const SEEN_KEY = 'evk.preOrdersSeen'

export function usePreOrders(): PreOrdersCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('usePreOrders outside PreOrdersProvider')
  return ctx
}

export function PreOrdersProvider({ children }: { children: React.ReactNode }) {
  const app = useApp()
  const [items, setItems] = useState<PreOrder[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const busy = useRef(false)
  const [seen, setSeen] = useState<ReadonlySet<number>>(new Set())

  useEffect(() => {
    void SecureStore.getItemAsync(SEEN_KEY)
      .then((value) => {
        const ids = value ? (JSON.parse(value) as unknown) : []
        if (Array.isArray(ids)) setSeen(new Set(ids.filter((id): id is number => typeof id === 'number')))
      })
      .catch(() => undefined)
  }, [])

  // The latest list and seen set, for markSeen without re-creating it on every change
  const latest = useRef({ items, seen })
  latest.current = { items, seen }
  const markSeen = useCallback(() => {
    const { items: current, seen: before } = latest.current
    const next = pruneSeen(current, before, current.map((p) => p.id))
    if (next.length === before.size && next.every((id) => before.has(id))) return
    setSeen(new Set(next))
    void SecureStore.setItemAsync(SEEN_KEY, JSON.stringify(next)).catch(() => undefined)
  }, [])

  const reload = useCallback(async () => {
    if (busy.current) return
    busy.current = true
    setLoading(true)
    try {
      setItems(sortPreOrders(await api.preOrders()))
      setError(false)
    } catch {
      setError(true)
    } finally {
      busy.current = false
      setLoading(false)
    }
  }, [])

  const setBid = useCallback(
    async (id: number, priceAmd: number | null) => {
      try {
        if (priceAmd === null) await api.withdrawPreOrderBid(id)
        else await api.bidPreOrder(id, priceAmd)
        setItems((current) => current.map((p) => (p.id === id ? { ...p, myBidAmd: priceAmd } : p)))
      } finally {
        void reload()
      }
    },
    [reload],
  )

  useEffect(() => {
    if (!app.loggedIn) {
      setItems([])
      return
    }
    void reload()
    const offPush = onPreOrderArrived(() => void reload())
    const sub = RNAppState.addEventListener('change', (state) => {
      if (state === 'active') void reload()
    })
    return () => {
      offPush()
      sub.remove()
    }
  }, [app.loggedIn, reload])

  const value = useMemo<PreOrdersCtx>(
    () => ({ items, loading, error, unanswered: unansweredCount(items), unseen: unseenCount(items, seen), markSeen, reload, setBid }),
    [items, loading, error, seen, markSeen, reload, setBid],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
