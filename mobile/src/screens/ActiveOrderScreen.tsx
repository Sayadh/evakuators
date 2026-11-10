/**
 * The assigned order — one next step at a time (see domain/orderSteps.ts for
 * the whole flow). What is ALLOWED is the server's (`allowedActions`,
 * `canCancel`, `canSetPrice`); this screen only presents it. Call opens the
 * dialer; navigation opens the phone's own maps app (no in-app navigation),
 * and only when the target has coordinates.
 */
import { useState } from 'react'
import { Linking, Platform, Text, TextInput } from 'react-native'
import type { ActiveOrder } from '../api/types'
import { parseAmd, planOrderScreen } from '../domain/orderSteps'
import { useT } from '../i18n'
import { useApp } from '../state/AppState'
import { Button, Card, colors, Note, Row, Screen } from '../ui/kit'

export function navigationUrl(lat: number, lng: number, os: string): string {
  return os === 'ios' ? `maps://?daddr=${lat},${lng}&dirflg=d` : `google.navigation:q=${lat},${lng}&mode=d`
}

export function ActiveOrderScreen({
  order,
  onCancel,
  onProblem,
  onBack,
}: {
  order: ActiveOrder
  onCancel: () => void
  onProblem: () => void
  onBack: () => void
}) {
  const t = useT()
  const app = useApp()
  const plan = planOrderScreen(order)
  const [priceText, setPriceText] = useState('')
  const price = parseAmd(priceText)

  const mine = (kind: 'PROGRESS' | 'PRICE') => app.pending.find((p) => p.kind === kind && p.targetId === String(order.id) && p.status !== 'CONFIRMED')
  const pendingProgress = mine('PROGRESS')
  const pendingPrice = mine('PRICE')
  const progressLocked = !!pendingProgress && pendingProgress.status !== 'FAILED'

  async function navigate() {
    if (!plan.navigateTo) return
    const { latitude, longitude } = plan.navigateTo
    const url = navigationUrl(latitude, longitude, Platform.OS)
    const fallback = `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}&travelmode=driving`
    if (await Linking.canOpenURL(url).catch(() => false)) await Linking.openURL(url)
    else await Linking.openURL(fallback)
  }

  const agreed = order.price.agreedAmd ?? (order.price.mode === 'FIXED' ? order.price.quotedAmd : null)

  return (
    <Screen title={`${t('order.title')} · ${order.number}`}>
      <Card>
        <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text }}>{t(`order.statuses.${order.status}`)}</Text>
        {plan.waitingForOperator ? <Note tone="warn">{t('order.waitingOperator')}</Note> : null}
        <Row label={t('offer.pickup')} value={order.pickup.address} />
        <Row label={t('offer.destination')} value={order.destination?.address ?? t('offer.destinationUnknown')} />
        <Row label={t('offer.vehicle')} value={[order.vehicle.make, order.vehicle.model, order.vehicle.plate].filter(Boolean).join(' ') || '—'} />
        {order.requirements.needsWheelSkates ? (
          <Note tone="warn">
            {order.requirements.wheelSkatesCount
              ? t('offer.requirements.wheelSkatesCount', { n: order.requirements.wheelSkatesCount })
              : t('offer.requirements.wheelSkates')}
          </Note>
        ) : null}
        <Row label={t('order.customer')} value={`${order.customer.name ?? ''} ${order.customer.phone}`.trim()} />
        <Row label={t('offer.price')} value={agreed !== null ? `${agreed.toLocaleString('hy-AM')} ${t('common.dram')}` : t('order.priceNotAgreed')} />
      </Card>

      <Button variant="accent" label={t('order.call')} onPress={() => void Linking.openURL(`tel:${order.customer.phone}`)} />

      {plan.priceEntry ? (
        <Card>
          <Text style={{ color: colors.text, fontWeight: '600' }}>{t('order.priceTitle')}</Text>
          <Note tone={plan.priceBlocksTransport ? 'danger' : 'muted'}>{plan.priceBlocksTransport ? t('order.priceRequiredForTransport') : t('order.priceHint')}</Note>
          <TextInput
            value={priceText}
            onChangeText={setPriceText}
            keyboardType="number-pad"
            placeholder={t('order.pricePlaceholder')}
            accessibilityLabel={t('order.priceTitle')}
            style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, fontSize: 17, backgroundColor: '#fff' }}
          />
          <Button
            label={pendingPrice?.status === 'SENDING' ? t('order.pending') : t('order.priceSave')}
            busy={pendingPrice?.status === 'SENDING'}
            disabled={price === null || (!!pendingPrice && pendingPrice.status !== 'FAILED')}
            onPress={async () => {
              if (price === null) return
              if (await app.setPrice(order.id, price)) setPriceText('')
            }}
          />
          {pendingPrice?.status === 'FAILED' ? <Note tone="danger">{t('order.failed', { reason: t(`errors.${pendingPrice.errorCode ?? 'UNKNOWN'}`) })}</Note> : null}
        </Card>
      ) : null}

      {plan.navigateTo ? <Button variant="outline" label={t('order.navigate')} onPress={() => void navigate()} /> : null}

      {plan.primary ? (
        <Button
          variant={plan.primary === 'COMPLETE' ? 'success' : 'primary'}
          label={progressLocked && pendingProgress?.status === 'SENDING' ? t('order.pending') : t(`order.${plan.primary}`)}
          busy={pendingProgress?.status === 'SENDING'}
          disabled={progressLocked}
          onPress={() => void app.progress(order.id, plan.primary!)}
        />
      ) : null}
      {pendingProgress?.status === 'UNCERTAIN' ? <Note tone="warn">{t('offer.uncertain')}</Note> : null}
      {pendingProgress?.status === 'FAILED' ? <Note tone="danger">{t('order.failed', { reason: t(`errors.${pendingProgress.errorCode ?? 'UNKNOWN'}`) })}</Note> : null}

      {plan.secondary === 'CANCEL' ? <Button variant="outline" label={t('order.cancel')} onPress={onCancel} /> : null}
      {plan.secondary === 'PROBLEM' ? <Button variant="outline" label={t('order.problem')} onPress={onProblem} /> : null}
      <Button variant="outline" label={t('common.back')} onPress={onBack} />
    </Screen>
  )
}
