/**
 * Two driver requests, never chosen on this screen — the caller decides:
 *
 * - CANCEL — only before setting off (server: activeOrder.canCancel). What
 *   happens is the SERVER's rule, the screen only says it in advance. Every
 *   cancel gives the fee back (2026-11-17):
 *     · a CUSTOMER reason — «Հաճախորդը կզանգի» or «Հաճախորդը հրաժարվեց» →
 *       the driver is released at once and the order goes to the operator
 *       (no automatic search: the customer has not decided).
 *     · any other reason → released at once, the order goes to the next
 *       driver automatically.
 *     · «Գինը չհամաձայնեցվեց» needs the price the driver asked (and, if he
 *       knows, the customer's) — the price the next driver has to meet.
 *   Nothing is sent without the driver's choice (2026-11-17: the 45 s
 *   auto-send is gone). Instead, while the screen stays open, a short ring +
 *   vibration every REMIND_EVERY_MS, and after STALLED_AFTER_MS the operator
 *   is told once (POST cancel-stalled) so he calls the driver.
 * - PROBLEM — something is wrong but the job goes on; any active status.
 *
 * A comment is required only for «Այլ» (same rule as the server).
 */
import { useEffect, useRef, useState } from 'react'
import { Pressable, Text, TextInput } from 'react-native'
import { api } from '../api/client'
import { parseAmd } from '../domain/orderSteps'
import { useT } from '../i18n'
import { startOfferAlert, stopOfferAlert } from '../push/offerAlert'
import { useApp } from '../state/AppState'
import { Button, Card, colors, Header, Note, Screen } from '../ui/kit'

export type RequestMode = 'CANCEL' | 'PROBLEM'

/** A reminder while the cancel screen is open and nothing was sent */
export const REMIND_EVERY_MS = 10_000
/** …and after this long the operator is told */
export const STALLED_AFTER_MS = 3 * 60_000
/** How long one reminder rings */
const RING_MS = 1_500

const REASONS: Record<RequestMode, readonly string[]> = {
  CANCEL: ['CUSTOMER_WILL_CALL', 'CUSTOMER_DECLINED', 'PRICE_NOT_AGREED', 'DRIVER_CANNOT_PERFORM', 'WRONG_DATA', 'OTHER'],
  PROBLEM: ['TECHNICAL_PROBLEM', 'WRONG_DATA', 'CUSTOMER_DECLINED', 'PRICE_NOT_AGREED', 'OTHER'],
}

export function RequestScreen({ orderId, mode, onDone }: { orderId: number; mode: RequestMode; onDone: () => void }) {
  const t = useT()
  const app = useApp()
  // A cancel starts with NO reason picked: picking one is the driver's decision.
  const [reason, setReason] = useState<string | null>(mode === 'CANCEL' ? null : REASONS.PROBLEM[0])
  const [comment, setComment] = useState('')
  const [driverPrice, setDriverPrice] = useState('')
  const [customerPrice, setCustomerPrice] = useState('')
  const [busy, setBusy] = useState(false)
  const sent = useRef(false)

  const needsComment = reason === 'OTHER' && comment.trim().length === 0
  const asksPrice = mode === 'CANCEL' && reason === 'PRICE_NOT_AGREED'
  // Same parser as the price the driver records on the order screen
  const driverAmd = parseAmd(driverPrice)
  const customerAmd = customerPrice.trim() ? parseAmd(customerPrice) : null
  const customerInvalid = customerPrice.trim().length > 0 && customerAmd === null
  const priceInvalid = asksPrice && (driverAmd === null || customerInvalid)

  async function send(chosen: string) {
    if (sent.current) return
    sent.current = true
    setBusy(true)
    const prices = chosen === 'PRICE_NOT_AGREED' && mode === 'CANCEL' ? { driverPriceAmd: driverAmd, customerPriceAmd: customerAmd } : {}
    const ok = await app.sendRequest(orderId, { kind: mode, reason: chosen, comment: comment.trim() || null, ...prices })
    setBusy(false)
    if (ok) onDone()
    else sent.current = false
  }

  // Reminder while the cancel screen stays open — nothing is ever sent for him.
  useEffect(() => {
    if (mode !== 'CANCEL') return
    const opened = Date.now()
    let told = false
    let ringOff: ReturnType<typeof setTimeout> | null = null
    const timer = setInterval(() => {
      if (sent.current) return
      startOfferAlert(t('request.remindTitle'))
      if (ringOff) clearTimeout(ringOff)
      ringOff = setTimeout(stopOfferAlert, RING_MS)
      if (!told && Date.now() - opened >= STALLED_AFTER_MS) {
        told = true
        void api.cancelStalled(orderId).catch(() => undefined)
      }
    }, REMIND_EVERY_MS)
    return () => {
      clearInterval(timer)
      if (ringOff) clearTimeout(ringOff)
      stopOfferAlert()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, orderId])

  const choice = (selected: boolean) => ({ padding: 12, borderRadius: 10, borderWidth: 1, borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? '#e8eef6' : '#fff' })
  const input = { borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 10, backgroundColor: '#fff' } as const

  const outcome =
    mode === 'PROBLEM'
      ? reason === 'CUSTOMER_DECLINED'
        ? t('request.problemCustomerDeclined')
        : t('request.problemNote')
      : reason === 'CUSTOMER_DECLINED' || reason === 'CUSTOMER_WILL_CALL'
        ? t('request.cancelToOperator')
        : t('request.cancelRedispatch')

  return (
    <Screen header={<Header title={mode === 'CANCEL' ? t('request.titleCancel') : t('request.titleProblem')} onBack={busy ? undefined : onDone} />}>
      {mode === 'CANCEL' ? (
        <Card style={{ borderColor: colors.danger, borderWidth: 2 }}>
          <Text style={{ fontSize: 18, fontWeight: '800', color: colors.danger }}>{t('request.remindTitle')}</Text>
          <Note>{t('request.remindNote')}</Note>
        </Card>
      ) : null}
      <Card>
        <Text style={{ color: colors.muted }}>{t('request.reason')}</Text>
        {REASONS[mode].map((r) => (
          <Pressable key={r} accessibilityRole="radio" accessibilityState={{ selected: reason === r }} style={choice(reason === r)} onPress={() => setReason(r)}>
            <Text>{t(`request.reasons.${r}`)}</Text>
          </Pressable>
        ))}
        {asksPrice ? (
          <>
            <Text style={{ color: colors.text, fontWeight: '700' }}>{t('request.driverPrice')}</Text>
            <TextInput value={driverPrice} onChangeText={setDriverPrice} keyboardType="number-pad" placeholder="20000" style={input} />
            <Text style={{ color: colors.muted }}>{t('request.customerPrice')}</Text>
            <TextInput value={customerPrice} onChangeText={setCustomerPrice} keyboardType="number-pad" placeholder="—" style={input} />
            {priceInvalid ? <Note tone="danger">{t('request.driverPriceRequired')}</Note> : null}
          </>
        ) : null}
        <TextInput placeholder={t('request.comment')} value={comment} onChangeText={setComment} multiline style={{ ...input, minHeight: 80 }} />
        {needsComment ? <Note tone="danger">{t('request.commentRequired')}</Note> : null}
        {reason !== null ? <Note tone="warn">{outcome}</Note> : null}
      </Card>
      <Button
        variant={mode === 'CANCEL' ? 'danger' : 'primary'}
        label={mode === 'CANCEL' ? t('request.submitCancel') : t('request.submit')}
        busy={busy}
        disabled={reason === null || needsComment || priceInvalid || busy}
        onPress={() => reason !== null && void send(reason)}
      />
    </Screen>
  )
}
