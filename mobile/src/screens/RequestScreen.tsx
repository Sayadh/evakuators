/**
 * "I can't do it" / "there's a problem". A cancel request NEVER frees the
 * order by itself — the operator decides (and the driver is told so).
 */
import React, { useState } from 'react'
import { Pressable, Text, TextInput } from 'react-native'
import { useT } from '../i18n'
import { useApp } from '../state/AppState'
import { Button, Card, colors, Note, Screen } from '../ui/kit'

const REASONS = ['DRIVER_CANNOT_PERFORM', 'CUSTOMER_DECLINED', 'WRONG_DATA', 'PRICE_NOT_AGREED', 'TECHNICAL_PROBLEM', 'OTHER'] as const

export function RequestScreen({ orderId, onDone }: { orderId: number; onDone: () => void }) {
  const t = useT()
  const app = useApp()
  const [kind, setKind] = useState<'CANCEL' | 'PROBLEM'>('PROBLEM')
  const [reason, setReason] = useState<(typeof REASONS)[number]>('TECHNICAL_PROBLEM')
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const needsComment = reason === 'OTHER' && comment.trim().length === 0

  const choice = (selected: boolean) => ({ padding: 12, borderRadius: 10, borderWidth: 1, borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? '#e8eef6' : '#fff' })

  return (
    <Screen title={t('request.title')}>
      <Card>
        {(['PROBLEM', 'CANCEL'] as const).map((k) => (
          <Pressable key={k} accessibilityRole="radio" accessibilityState={{ selected: kind === k }} style={choice(kind === k)} onPress={() => setKind(k)}>
            <Text>{k === 'CANCEL' ? t('request.kindCancel') : t('request.kindProblem')}</Text>
          </Pressable>
        ))}
      </Card>
      <Card>
        <Text style={{ color: colors.muted }}>{t('request.reason')}</Text>
        {REASONS.map((r) => (
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
        {kind === 'CANCEL' ? <Note tone="warn">{t('order.waitingOperator')}</Note> : null}
      </Card>
      <Button
        label={t('request.submit')}
        busy={busy}
        disabled={needsComment}
        onPress={async () => {
          setBusy(true)
          const ok = await app.sendRequest(orderId, { kind, reason, comment: comment.trim() || null })
          setBusy(false)
          if (ok) onDone()
        }}
      />
      <Button variant="outline" label={t('common.back')} onPress={onDone} />
    </Screen>
  )
}
