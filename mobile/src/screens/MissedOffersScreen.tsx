/**
 * Missed offers («Բաց թողնված պատվերներ», 2026-11): every offer the driver
 * let run out — when, where from and to, how far he was, why it was missed
 * and what became of the order. Never the customer's contact, never who took
 * the order. If some never reached the phone, the fix (alert setup) is one
 * tap away. Opening the list marks everything in it as seen.
 */
import { useEffect } from 'react'
import { Text, View } from 'react-native'
import { formatClockTime, formatDateLong } from '~/utils/formatters'
import { formatPrice } from '~/utils/formatPrice'
import type { MissedOffer } from '../api/types'
import { groupMissedByDay, hasDeliveryProblem, pickupDistance } from '../domain/missed'
import { useLanguage, useT } from '../i18n'
import { useNav } from '../navigation/Navigator'
import { useMissedOffers } from '../state/missedOffers'
import { Icon } from '../ui/Icon'
import { Badge, Banner, Button, Card, EmptyState, Header, Loading, Screen, type BadgeTone } from '../ui/kit'
import { colors, space, type } from '../ui/theme'

const REASON_TONE: Record<MissedOffer['reason'], BadgeTone> = { NOT_DELIVERED: 'danger', TOO_LATE: 'warn', NO_ANSWER: 'warn' }
const OUTCOME_TONE: Record<MissedOffer['outcome'], BadgeTone> = { TAKEN: 'neutral', CANCELLED: 'neutral', OPEN: 'primary', CLOSED: 'neutral' }

export function MissedOffersScreen() {
  const t = useT()
  const language = useLanguage()
  const nav = useNav()
  const missed = useMissedOffers()

  useEffect(() => {
    void missed.reload().then(missed.markSeen)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const header = <Header title={t('missed.title')} onBack={nav.pop} />
  if (missed.loading && missed.items.length === 0) return <Screen header={header}><Loading label={t('common.loading')} /></Screen>

  return (
    <Screen header={header} refreshing={false} onRefresh={() => void missed.reload().then(missed.markSeen)}>
      {missed.error ? <Banner tone="danger" action={{ label: t('common.retry'), onPress: () => void missed.reload() }}>{t('errors.NETWORK')}</Banner> : null}
      {hasDeliveryProblem(missed.items) ? (
        <Banner tone="danger" title={t('missed.deliveryTitle')} action={{ label: t('missed.deliveryAction'), onPress: () => nav.push('alertsSetup') }}>
          {t('missed.deliveryBody')}
        </Banner>
      ) : null}
      {!missed.error && missed.items.length === 0 ? <EmptyState icon="check" title={t('missed.empty')} text={t('missed.emptyHint')} /> : null}

      {groupMissedByDay(missed.items).map((group) => (
        <View key={group.dayKey} style={{ gap: space.sm }}>
          <Text style={[type.caption, { color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 }]}>
            {formatDateLong(`${group.dayKey}T12:00:00+04:00`, language)}
          </Text>
          {group.items.map((item) => (
            <MissedCard key={item.offerId} item={item} />
          ))}
        </View>
      ))}
      {missed.hasMore ? <Button variant="outline" label={t('history.more')} busy={missed.loadingMore} onPress={() => void missed.loadMore()} /> : null}
    </Screen>
  )
}

function MissedCard({ item }: { item: MissedOffer }) {
  const t = useT()
  const distance = pickupDistance(item)
  const minutes = item.toPickup.etaSeconds !== null ? Math.max(1, Math.round(item.toPickup.etaSeconds / 60)) : null
  const vehicle = [item.order.vehicle.make, item.order.vehicle.model].filter(Boolean).join(' ')
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <Icon name="clock" size={18} color={colors.muted} />
        <Text style={[type.bodyStrong, { color: colors.text, flex: 1 }]}>
          {formatClockTime(new Date(item.offeredAt))} · № {item.order.number}
        </Text>
        <Badge label={t(`missed.reasons.${item.reason}`)} tone={REASON_TONE[item.reason]} />
      </View>
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <Icon name="route" size={18} color={colors.muted} style={{ marginTop: 2 }} />
        <Text style={[type.small, { color: colors.textSecondary, flex: 1 }]} numberOfLines={3}>
          {item.order.pickupAddress}
          {item.order.destinationAddress ? ` → ${item.order.destinationAddress}` : ''}
        </Text>
      </View>
      {distance || vehicle ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md }}>
          {distance ? (
            <Fact icon="navigation" text={`${distance.approximate ? '≈ ' : ''}${(distance.meters / 1000).toFixed(1)} ${t('common.km')}${minutes ? ` · ${minutes} ${t('common.min')}` : ''} ${t('missed.toPickup')}`} />
          ) : null}
          {vehicle ? <Fact icon="truck" text={vehicle} /> : null}
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <Badge label={t(`missed.outcomes.${item.outcome}`)} tone={OUTCOME_TONE[item.outcome]} />
        <View style={{ flex: 1 }} />
        {item.order.price.amountAmd !== null ? <Text style={[type.bodyStrong, { color: colors.text }]}>{formatPrice(item.order.price.amountAmd)}</Text> : null}
      </View>
    </Card>
  )
}

function Fact({ icon, text }: { icon: 'navigation' | 'truck'; text: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Icon name={icon} size={16} color={colors.muted} />
      <Text style={[type.small, { color: colors.textSecondary }]}>{text}</Text>
    </View>
  )
}
