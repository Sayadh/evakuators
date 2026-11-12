/**
 * The site's own confirmation dialog, instead of the browser's `confirm()`
 * (2026-11-12): that one is grey, in the browser's language ("Подтвердите
 * действие на localhost:3002"), blocks the tab, and looks like nothing else on
 * evakuators.am.
 *
 *   if (!(await confirmDialog('Ջնջե՞լ այս երթուղին։'))) return
 *   await confirmDialog({ title: 'Ջնջե՞լ պրոֆիլը', message: '…', confirmLabel: 'Ջնջել', danger: true })
 *
 * One dialog for the whole app, rendered by `ConfirmDialogHost` in app.vue.
 * A second request while one is open answers the first with "no".
 */
export interface ConfirmDialogOptions {
  message: string
  title?: string
  confirmLabel?: string
  cancelLabel?: string
  /** A destructive action: the confirm button is red */
  danger?: boolean
}

interface ConfirmDialogState extends ConfirmDialogOptions {
  open: boolean
  id: number
}

let resolver: ((answer: boolean) => void) | null = null

export function useConfirmDialogState() {
  return useState<ConfirmDialogState>('confirm-dialog', () => ({ open: false, id: 0, message: '' }))
}

/** Settles the open dialog (the host calls this) */
export function settleConfirmDialog(answer: boolean): void {
  const state = useConfirmDialogState()
  state.value = { ...state.value, open: false }
  const resolve = resolver
  resolver = null
  resolve?.(answer)
}

export function confirmDialog(input: string | ConfirmDialogOptions): Promise<boolean> {
  if (!import.meta.client) return Promise.resolve(false)
  const options = typeof input === 'string' ? { message: input } : input
  if (resolver) settleConfirmDialog(false)
  const state = useConfirmDialogState()
  return new Promise<boolean>((resolve) => {
    resolver = resolve
    state.value = { ...options, open: true, id: state.value.id + 1 }
  })
}
