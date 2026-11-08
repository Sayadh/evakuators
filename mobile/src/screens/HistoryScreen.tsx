import React, { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { HistoryItem } from '../api/types'
import { useT } from '../i18n'
import { Button, Card, Note, Row, Screen } from '../ui/kit'

export function HistoryScreen({ onBack }: { onBack: () => void }) {
  const t = useT()
  const [items, setItems] = useState<HistoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const load = async (before?: string) => {
    setLoading(true)
    try {
      const page = await api.history(before)
      setItems((current) => (before ? [...current, ...page] : page))
      setError(false)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => void load(), [])

  return (
    <Screen title={t('history.title')}>
      {error ? <Note tone="danger">{t('errors.NETWORK')}</Note> : null}
      {!loading && items.length === 0 ? <Note>{t('history.empty')}</Note> : null}
      {items.map((item) => (
        <Card key={item.id}>
          <Row label={item.number} value={t(`order.statuses.${item.status}`)} />
          <Note>{item.pickupAddress}{item.destinationAddress ? ` → ${item.destinationAddress}` : ''}</Note>
          {item.price.amountAmd !== null ? <Row label={t('offer.price')} value={`${item.price.amountAmd.toLocaleString('hy-AM')} ${t('common.dram')}`} /> : null}
          <Note>{new Date(item.createdAt).toLocaleString('hy-AM', { timeZone: 'Asia/Yerevan' })}</Note>
        </Card>
      ))}
      {items.length >= 20 ? <Button variant="outline" label={t('history.more')} busy={loading} onPress={() => void load(items[items.length - 1].createdAt)} /> : null}
      <Button variant="outline" label={t('common.back')} onPress={onBack} />
    </Screen>
  )
}
