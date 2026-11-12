/**
 * The assigned order — one next step at a time (see domain/orderSteps.ts for
 * the whole flow). What is ALLOWED is the server's (`allowedActions`,
 * `canCancel`, `canSetPrice`); this screen only presents it. Call opens the
 * dialer; «Նավիգացիա» lets the driver pick the maps app (Google Maps,
 * Yandex, Waze, Apple Maps — domain/mapsApps.ts) and shows the exact point,
 * only when the target has usable coordinates.
 */
import { useEffect, useState } from 'react'
import { Linking, Platform, Text, TextInput } from 'react-native'
import type { ActiveOrder } from '../api/types'
import { parseAmd, planOrderScreen } from '../domain/orderSteps'
import { useT } from '../i18n'
import { useApp } from '../state/AppState'
import { Button, Card, colors, Header, ListGroup, ListItem, Note, Row, Screen, Sheet } from '../ui/kit'
import { cleanTarget, orderedApps, type MapsApp } from '../domain/mapsApps'
import { lastMapsApp, openInMaps } from '../state/mapsChoice'

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

  // «Նավիգացիա»: where to (the step's point, or the other one if the driver
  // wants it), and in which app. The last app used comes first.
  const pickupPoint = cleanTarget(order.pickup)
  const destinationPoint = cleanTarget(order.destination)
  const stepTarget = plan.navigateTo ? cleanTarget(plan.navigateTo) : null
  const [mapsOpen, setMapsOpen] = useState(false)
  const [mapsTarget, setMapsTarget] = useState<'pickup' | 'destination'>('pickup')
  const [apps, setApps] = useState<MapsApp[]>(orderedApps(Platform.OS, null))
  const [lastApp, setLastApp] = useState<MapsApp | null>(null)
  const [mapsFailed, setMapsFailed] = useState(false)
  useEffect(() => {
    if (!mapsOpen) return
    void lastMapsApp().then((last) => {
      setLastApp(last)
      setApps(orderedApps(Platform.OS, last))
    })
  }, [mapsOpen])
  function openMaps() {
    setMapsTarget(stepTarget && destinationPoint && stepTarget.latitude === destinationPoint.latitude && stepTarget.longitude === destinationPoint.longitude ? 'destination' : 'pickup')
    setMapsFailed(false)
    setMapsOpen(true)
  }
  const chosen = mapsTarget === 'destination' ? destinationPoint : pickupPoint
  async function go(app: MapsApp) {
    if (!chosen) return
    const opened = await openInMaps(app, chosen, Platform.OS)
    if (opened) setMapsOpen(false)
    else setMapsFailed(true)
  }

  const agreed = order.price.agreedAmd ?? (order.price.mode === 'FIXED' ? order.price.quotedAmd : null)

  return (
    <Screen header={<Header title={`${t('order.title')} · ${order.number}`} onBack={onBack} />}>
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

      <Button variant="accent" icon="phone" label={t('order.call')} onPress={() => void Linking.openURL(`tel:${order.customer.phone}`)} />

      {plan.priceEntry ? (
        <Card>
          <Text style={{ color: colors.text, fontWeight: '600' }}>{t('order.priceTitle')}</Text>
          <Note tone={plan.priceBlocksTransport ? 'danger' : 'muted'}>{plan.priceBlocksTransport ? t('order.priceRequiredForTransport') : t('order.priceHint')}</Note>
          <Note>{t('order.priceReviewNote')}</Note>
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

      {stepTarget ? <Button variant="outline" icon="navigation" label={t('order.navigate')} onPress={openMaps} /> : null}

      <Sheet visible={mapsOpen} onClose={() => setMapsOpen(false)} title={t('order.maps.title')}>
        {pickupPoint && destinationPoint ? (
          <ListGroup>
            <ListItem
              title={t('order.maps.toPickup')}
              subtitle={order.pickup.address}
              right={mapsTarget === 'pickup' ? <Text style={{ color: colors.primary, fontWeight: '700' }}>✓</Text> : undefined}
              onPress={() => setMapsTarget('pickup')}
            />
            <ListItem
              title={t('order.maps.toDestination')}
              subtitle={order.destination?.address}
              right={mapsTarget === 'destination' ? <Text style={{ color: colors.primary, fontWeight: '700' }}>✓</Text> : undefined}
              onPress={() => setMapsTarget('destination')}
              last
            />
          </ListGroup>
        ) : (
          <Note>{mapsTarget === 'destination' ? order.destination?.address : order.pickup.address}</Note>
        )}
        {chosen ? <Note>{t('order.maps.point', { coords: `${chosen.latitude.toFixed(6)}, ${chosen.longitude.toFixed(6)}` })}</Note> : null}
        <ListGroup>
          {apps.map((app, i) => (
            <ListItem key={app} icon="navigation" title={t(`order.maps.apps.${app}`)} subtitle={app === lastApp ? t('order.maps.recommended') : undefined} onPress={() => void go(app)} last={i === apps.length - 1} />
          ))}
        </ListGroup>
        {mapsFailed ? <Note tone="danger">{t('order.maps.failed')}</Note> : null}
      </Sheet>

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
    </Screen>
  )
}
