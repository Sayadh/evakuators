/**
 * Pre-orders («Նախապատվերներ», 2026-11-17): jobs the operator is collecting
 * prices for. The driver reads the job — route, vehicle, its state, the
 * operator's comment, how far he is — and answers with the price he would do
 * it for. He can change or withdraw it while it is open; nobody else sees it.
 * If the operator chooses him, an ordinary offer arrives (and only then the
 * customer's contact). Never the customer here. Only the operator closes a
 * pre-order; there is no deadline.
 */
import { useEffect, useState } from 'react'
import { Text, View } from 'react-native'
import { formatClockTime, formatDateNumeric } from '~/utils/formatters'
import { formatPrice } from '~/utils/formatPrice'
import { ApiError } from '../api/client'
import type { PreOrder } from '../api/types'
import { parseAmd } from '../domain/orderSteps'
import { requirementKeys, vehicleLine } from '../domain/preOrders'
import { useT } from '../i18n'
import { useNav } from '../navigation/Navigator'
import { usePreOrders } from '../state/preOrders'
import { Icon } from '../ui/Icon'
import { Badge, Banner, Button, Card, EmptyState, Field, Header, Loading, Screen } from '../ui/kit'
import { colors, space, type } from '../ui/theme'

export function PreOrdersScreen() {
  const t = useT()
  const nav = useNav()
  const pre = usePreOrders()

  useEffect(() => {
    void pre.reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // Whatever the list shows is seen — including what arrives while it is open
  useEffect(() => {
    if (pre.unseen > 0) pre.markSeen()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pre.unseen])

  const header = <Header title={t('preOrders.title')} onBack={nav.pop} />
  if (pre.loading && pre.items.length === 0) return <Screen header={header}><Loading label={t('common.loading')} /></Screen>

  return (
    <Screen header={header} refreshing={false} onRefresh={() => void pre.reload()}>
      {pre.error ? <Banner tone="danger" action={{ label: t('common.retry'), onPress: () => void pre.reload() }}>{t('errors.NETWORK')}</Banner> : null}
      <Text style={[type.small, { color: colors.textSecondary }]}>{t('preOrders.intro')}</Text>
      {!pre.error && pre.items.length === 0 ? <EmptyState icon="document" title={t('preOrders.empty')} text={t('preOrders.emptyHint')} /> : null}
      {pre.items.map((item) => (
        <PreOrderCard key={item.id} item={item} />
      ))}
    </Screen>
  )
}

function when(iso: string): string {
  return `${formatDateNumeric(iso)} ${formatClockTime(new Date(iso))}`
}

function PreOrderCard({ item }: { item: PreOrder }) {
  const t = useT()
  const pre = usePreOrders()
  const [editing, setEditing] = useState(false)
  const [price, setPrice] = useState(item.myBidAmd === null ? '' : String(item.myBidAmd))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const vehicle = vehicleLine(item, t('preOrders.kg'))
  const chips = requirementKeys(item)
  const showInput = item.open && (editing || item.myBidAmd === null)

  async function save(amount: number | null) {
    if (amount !== null && amount < 100) {
      setError(t('preOrders.priceInvalid'))
      return
    }
    setBusy(true)
    setError(null)
    try {
      await pre.setBid(item.id, amount)
      setEditing(false)
      if (amount === null) setPrice('')
    } catch (e) {
      setError(t(`errors.${e instanceof ApiError ? e.code : 'UNKNOWN'}`))
    } finally {
      setBusy(false)
    }
  }

  const parsed = parseAmd(price)
  const badge = item.chosen
    ? { label: t('preOrders.chosen'), tone: 'success' as const }
    : !item.open
      ? { label: t('preOrders.closed'), tone: 'neutral' as const }
      : item.myBidAmd === null
        ? { label: t('preOrders.waiting'), tone: 'warn' as const }
        : { label: t('preOrders.answered'), tone: 'primary' as const }

  return (
    <Card tone={item.open && item.myBidAmd === null ? 'accent' : undefined}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <Text style={[type.bodyStrong, { color: colors.text, flex: 1 }]}>{t('preOrders.number', { id: String(item.id) })}</Text>
        <Badge label={badge.label} tone={badge.tone} />
      </View>
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <Icon name="route" size={18} color={colors.muted} style={{ marginTop: 2 }} />
        <Text style={[type.body, { color: colors.text, flex: 1 }]}>
          {item.pickup.address}
          {item.destination ? ` → ${item.destination.address}` : ''}
        </Text>
      </View>
      {item.distanceMeters !== null ? (
        <Fact icon="navigation" text={`≈ ${(item.distanceMeters / 1000).toFixed(1)} ${t('common.km')} ${t('preOrders.toPickup')}`} />
      ) : null}
      {vehicle ? <Fact icon="truck" text={vehicle} /> : null}
      {chips.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {chips.map((c) => (
            <Badge key={c.key} label={c.count ? `${t(`preOrders.req.${c.key}`)} ×${c.count}` : t(`preOrders.req.${c.key}`)} tone="neutral" />
          ))}
        </View>
      ) : null}
      {item.comment ? <Text style={[type.small, { color: colors.textSecondary }]}>{item.comment}</Text> : null}
      <Fact icon="clock" text={when(item.createdAt)} />

      {item.chosen ? <Text style={[type.small, { color: colors.success }]}>{t('preOrders.chosenHint')}</Text> : null}

      {showInput ? (
        <View style={{ gap: space.sm }}>
          <Field
            label={t('preOrders.yourPrice')}
            value={price}
            onChangeText={setPrice}
            keyboardType="number-pad"
            placeholder="15000"
            suffix="֏"
            error={error ?? undefined}
          />
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Button label={t('preOrders.send')} busy={busy} disabled={parsed === null} onPress={() => void save(parsed)} style={{ flex: 1 }} />
            {editing ? <Button variant="outline" label={t('common.cancel')} onPress={() => setEditing(false)} /> : null}
          </View>
        </View>
      ) : item.myBidAmd !== null ? (
        <View style={{ gap: space.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <Text style={[type.small, { color: colors.textSecondary, flex: 1 }]}>{t('preOrders.yourPrice')}</Text>
            <Text style={[type.bodyStrong, { color: colors.text }]}>{formatPrice(item.myBidAmd)}</Text>
          </View>
          {error ? <Text style={[type.small, { color: colors.danger }]}>{error}</Text> : null}
          {item.open ? (
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <Button variant="outline" size="sm" label={t('preOrders.change')} onPress={() => setEditing(true)} style={{ flex: 1 }} />
              <Button variant="ghost" size="sm" label={t('preOrders.withdraw')} busy={busy} onPress={() => void save(null)} />
            </View>
          ) : null}
        </View>
      ) : null}
    </Card>
  )
}

function Fact({ icon, text }: { icon: 'navigation' | 'truck' | 'clock'; text: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Icon name={icon} size={16} color={colors.muted} />
      <Text style={[type.small, { color: colors.textSecondary, flex: 1 }]}>{text}</Text>
    </View>
  )
}
