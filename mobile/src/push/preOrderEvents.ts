/**
 * Pre-order pushes (2026-11-17, `data.type: 'pre_order'`) → the app. Two
 * events: one ARRIVED (re-read the list), one was TAPPED (open the list).
 * A tap that cold-starts the app happens before the screen tree subscribes,
 * so the last tap is kept until someone takes it.
 */
type Listener = (preOrderId: number) => void

const arrived = new Set<Listener>()
const tapped = new Set<Listener>()
let pendingTap: number | null = null

export function isPreOrderPush(data: Record<string, unknown> | undefined): number | null {
  if (data?.type !== 'pre_order') return null
  const id = Number(data.preOrderId)
  return Number.isSafeInteger(id) ? id : null
}

export function emitPreOrderArrived(id: number): void {
  arrived.forEach((l) => l(id))
}

export function emitPreOrderTapped(id: number): void {
  if (tapped.size === 0) pendingTap = id
  tapped.forEach((l) => l(id))
  arrived.forEach((l) => l(id))
}

export function onPreOrderArrived(listener: Listener): () => void {
  arrived.add(listener)
  return () => arrived.delete(listener)
}

export function onPreOrderTapped(listener: Listener): () => void {
  tapped.add(listener)
  if (pendingTap !== null) {
    const id = pendingTap
    pendingTap = null
    listener(id)
  }
  return () => tapped.delete(listener)
}
