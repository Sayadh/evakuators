/**
 * What the Orders tab derives from the history pages: grouping by day, the
 * filter chips, and this month's totals. Pure (unit-tested); dates are the
 * website's Yerevan-pinned formatters, so a job done at 23:30 counts on the
 * day it was done in Armenia whatever the phone's time zone.
 */
import { yerevanDateKey } from '~/utils/formatters'
import type { HistoryItem, OrderStatus } from '../api/types'

export type HistoryFilter = 'all' | 'completed' | 'cancelled' | 'other'

const DONE: OrderStatus[] = ['COMPLETED']
const CANCELLED: OrderStatus[] = ['CANCELLED']

export function matchesFilter(item: HistoryItem, filter: HistoryFilter): boolean {
  if (filter === 'all') return true
  if (filter === 'completed') return DONE.includes(item.status)
  if (filter === 'cancelled') return CANCELLED.includes(item.status)
  return !DONE.includes(item.status) && !CANCELLED.includes(item.status)
}

/** When the job is "dated": done → completedAt, cancelled → cancelledAt, else assigned/created */
export function itemDate(item: HistoryItem): string {
  return item.completedAt ?? item.cancelledAt ?? item.assignedAt ?? item.createdAt
}

export function groupByDay(items: HistoryItem[]): { dayKey: string; items: HistoryItem[] }[] {
  const groups: { dayKey: string; items: HistoryItem[] }[] = []
  for (const item of items) {
    const dayKey = yerevanDateKey(new Date(itemDate(item)))
    const last = groups[groups.length - 1]
    if (last?.dayKey === dayKey) last.items.push(item)
    else groups.push({ dayKey, items: [item] })
  }
  return groups
}

/** Completed jobs this calendar month (Yerevan) and what they came to, where a price is known */
export function monthSummary(items: HistoryItem[], now: Date): { completed: number; earnedAmd: number } {
  const month = yerevanDateKey(now).slice(0, 7)
  let completed = 0
  let earnedAmd = 0
  for (const item of items) {
    if (item.status !== 'COMPLETED' || !item.completedAt) continue
    if (yerevanDateKey(new Date(item.completedAt)).slice(0, 7) !== month) continue
    completed += 1
    earnedAmd += item.price.amountAmd ?? 0
  }
  return { completed, earnedAmd }
}

/** The next page's `?before=` — the server's cursor, or (older server) the creation time */
export function nextCursor(items: HistoryItem[]): string | undefined {
  const last = items[items.length - 1]
  return last ? (last.assignedAt ?? last.createdAt) : undefined
}

export const PAGE_SIZE = 20
