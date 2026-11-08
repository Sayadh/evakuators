/**
 * The assigned order. Progress buttons are exactly the server's
 * `allowedActions` — the app never decides what is allowed. Call opens the
 * dialer; navigation opens the phone's own maps app (no in-app navigation).
 */
import React from 'react'
import { Linking, Platform, Text } from 'react-native'
import type { ActiveOrder, ProgressAction } from '../api/types'
import { useT } from '../i18n'
import { useApp } from '../state/AppState'
import { Button, Card, colors, Note, Row, Screen } from '../ui/kit'

export function navigationUrl(lat: number, lng: number, os: string): string {
  return os === 'ios' ? `maps://?daddr=${lat},${lng}&dirflg=d` : `google.navigation:q=${lat},${lng}&mode=d`
}

export function ActiveOrderScreen({ order, onRequest, onBack }: { order: ActiveOrder; onRequest: () => void; onBack: () => void }) {
  const t = useT()
  const app = useApp()
  const target = order.status === 'TRANSPORTING' && order.destination ? order.destination : order.pickup
  const pendingProgress = app.pending.find((p) => p.kind === 'PROGRESS' && p.targetId === String(order.id) && p.status !== 'CONFIRMED')

  async function navigate() {
    const url = navigationUrl(target.latitude, target.longitude, Platform.OS)
    const fallback = `https://www.google.com/maps/dir/?api=1&destination=${target.latitude},${target.longitude}&travelmode=driving`
    if (await Linking.canOpenURL(url).catch(() => false)) await Linking.openURL(url)
    else await Linking.openURL(fallback)
  }

  return (
    <Screen title={`${t('order.title')} · ${order.number}`}>
      <Card>
        <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text }}>{t(`order.statuses.${order.status}`)}</Text>
        {order.status === 'NEEDS_ATTENTION' ? <Note tone="warn">{t('order.waitingOperator')}</Note> : null}
        {order.price.mode === 'NEGOTIATION_REQUIRED' && !order.price.confirmed ? <Note tone="warn">{t('order.priceNotConfirmed')}</Note> : null}
        <Row label={t('offer.pickup')} value={order.pickup.address} />
        <Row label={t('offer.destination')} value={order.destination?.address ?? t('offer.destinationUnknown')} />
        <Row label={t('offer.vehicle')} value={[order.vehicle.make, order.vehicle.model, order.vehicle.plate].filter(Boolean).join(' ')} />
        <Row label="" value={`${order.customer.name ?? ''} ${order.customer.phone}`} />
      </Card>
      <Button variant="accent" label={t('order.call')} onPress={() => void Linking.openURL(`tel:${order.customer.phone}`)} />
      <Button variant="outline" label={t('order.navigate')} onPress={() => void navigate()} />
      {order.allowedActions.map((action: ProgressAction) => (
        <Button
          key={action}
          variant={action === 'COMPLETE' ? 'success' : 'primary'}
          label={pendingProgress?.payload.action === action && pendingProgress.status === 'SENDING' ? t('order.pending') : t(`order.${action}`)}
          busy={pendingProgress?.status === 'SENDING' && pendingProgress.payload.action === action}
          disabled={!!pendingProgress && pendingProgress.status !== 'FAILED'}
          onPress={() => void app.progress(order.id, action)}
        />
      ))}
      {pendingProgress?.status === 'UNCERTAIN' ? <Note tone="warn">{t('offer.uncertain')}</Note> : null}
      {pendingProgress?.status === 'FAILED' ? <Note tone="danger">{t('order.failed', { reason: t(`errors.${pendingProgress.errorCode ?? 'UNKNOWN'}`) })}</Note> : null}
      {order.status !== 'NEEDS_ATTENTION' ? <Button variant="outline" label={t('order.problem')} onPress={onRequest} /> : null}
      <Button variant="outline" label={t('common.back')} onPress={onBack} />
    </Screen>
  )
}
