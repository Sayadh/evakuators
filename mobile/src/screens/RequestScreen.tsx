/**
 * Two driver requests, never chosen on this screen — the caller decides:
 *
 * - CANCEL — only before setting off (server: activeOrder.canCancel). What
 *   happens is the SERVER's rule (product decision, 2026-11), the screen only
 *   says it in advance:
 *     · «Հաճախորդը հրաժարվեց» → an operator decides; the order stays with
 *       the driver until then (the whole order may be off).
 *     · any other reason → the driver is released at once and the order goes
 *       to the next driver automatically.
 *     · no reason within CANCEL_REASON_SECONDS → sent as NOT_SPECIFIED, which
 *       counts as "any other reason". A driver who walks away from the screen
 *       must not hold the customer up.
 * - PROBLEM — something is wrong but the job goes on; any active status.
 *
 * A comment is required only for «Այլ» (same rule as the server).
 */
import { useEffect, useRef, useState } from 'react'
import { Pressable, Text, TextInput } from 'react-native'
import { useT } from '../i18n'
import { useApp } from '../state/AppState'
import { Button, Card, colors, Note, Screen } from '../ui/kit'

export type RequestMode = 'CANCEL' | 'PROBLEM'

export const CANCEL_REASON_SECONDS = 45

const REASONS: Record<RequestMode, readonly string[]> = {
  CANCEL: ['DRIVER_CANNOT_PERFORM', 'PRICE_NOT_AGREED', 'CUSTOMER_DECLINED', 'WRONG_DATA', 'OTHER'],
  PROBLEM: ['TECHNICAL_PROBLEM', 'WRONG_DATA', 'CUSTOMER_DECLINED', 'PRICE_NOT_AGREED', 'OTHER'],
}

export function RequestScreen({ orderId, mode, onDone }: { orderId: number; mode: RequestMode; onDone: () => void }) {
  const t = useT()
  const app = useApp()
  // A cancel starts with NO reason picked: picking one is the driver's decision.
  const [reason, setReason] = useState<string | null>(mode === 'CANCEL' ? null : REASONS.PROBLEM[0])
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [left, setLeft] = useState(CANCEL_REASON_SECONDS)
  const sent = useRef(false)
  // The countdown's closure is from the first render: read the comment live.
  const commentRef = useRef(comment)
  commentRef.current = comment
  const needsComment = reason === 'OTHER' && comment.trim().length === 0

  async function send(chosen: string) {
    if (sent.current) return
    sent.current = true
    setBusy(true)
    const ok = await app.sendRequest(orderId, { kind: mode, reason: chosen, comment: commentRef.current.trim() || null })
    setBusy(false)
    if (ok) onDone()
    else sent.current = false
  }

  // Countdown — only while nothing has been sent yet.
  useEffect(() => {
    if (mode !== 'CANCEL') return
    const started = Date.now()
    const timer = setInterval(() => {
      const remaining = CANCEL_REASON_SECONDS - Math.floor((Date.now() - started) / 1000)
      setLeft(Math.max(0, remaining))
      if (remaining <= 0) {
        clearInterval(timer)
        void send('NOT_SPECIFIED')
      }
    }, 250)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  const choice = (selected: boolean) => ({ padding: 12, borderRadius: 10, borderWidth: 1, borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? '#e8eef6' : '#fff' })

  const outcome =
    mode === 'PROBLEM' ? t('request.problemNote') : reason === 'CUSTOMER_DECLINED' ? t('request.cancelToOperator') : t('request.cancelRedispatch')

  return (
    <Screen title={mode === 'CANCEL' ? t('request.titleCancel') : t('request.titleProblem')}>
      {mode === 'CANCEL' ? (
        <Card style={{ borderColor: left > 10 ? colors.border : colors.danger, borderWidth: 2 }}>
          <Text style={{ fontSize: 22, fontWeight: '800', color: left > 10 ? colors.text : colors.danger }} accessibilityLiveRegion="polite">
            {t('request.secondsLeft', { s: left })}
          </Text>
          <Note>{t('request.timeoutNote')}</Note>
        </Card>
      ) : null}
      <Card>
        <Text style={{ color: colors.muted }}>{t('request.reason')}</Text>
        {REASONS[mode].map((r) => (
          <Pressable key={r} accessibilityRole="radio" accessibilityState={{ selected: reason === r }} style={choice(reason === r)} onPress={() => setReason(r)}>
            <Text>{t(`request.reasons.${r}`)}</Text>
          </Pressable>
        ))}
        <TextInput
          placeholder={t('request.comment')}
          value={comment}
          onChangeText={setComment}
          multiline
          style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 10, minHeight: 80, backgroundColor: '#fff' }}
        />
        {needsComment ? <Note tone="danger">{t('request.commentRequired')}</Note> : null}
        {reason !== null ? <Note tone="warn">{outcome}</Note> : null}
      </Card>
      <Button
        variant={mode === 'CANCEL' ? 'danger' : 'primary'}
        label={mode === 'CANCEL' ? t('request.submitCancel') : t('request.submit')}
        busy={busy}
        disabled={reason === null || needsComment || busy}
        onPress={() => reason !== null && void send(reason)}
      />
      <Button variant="outline" label={t('common.back')} disabled={busy} onPress={onDone} />
    </Screen>
  )
}
