/** One past job — what, where, how it went, for how much. Never the customer. */
import { Text, View } from 'react-native'
import { formatClockTime, formatDateLong } from '~/utils/formatters'
import { formatPrice } from '~/utils/formatPrice'
import type { HistoryItem } from '../api/types'
import { useLanguage, useT } from '../i18n'
import { useNav } from '../navigation/Navigator'
import { Icon } from '../ui/Icon'
import { Badge, Card, Header, Row, Screen, Section } from '../ui/kit'
import { colors, space, type } from '../ui/theme'
import { STATUS_TONE } from './OrdersScreen'

export function OrderDetailScreen({ item }: { item: HistoryItem }) {
  const t = useT()
  const language = useLanguage()
  const nav = useNav()
  const time = (iso: string | null | undefined) => (iso ? `${formatDateLong(iso, language)}, ${formatClockTime(new Date(iso))}` : null)
  const steps: { label: string; at: string | null }[] = [
    { label: t('orderDetail.assigned'), at: time(item.timeline?.assignedAt ?? item.assignedAt) },
    { label: t('orderDetail.enRoute'), at: time(item.timeline?.enRouteAt) },
    { label: t('orderDetail.arrived'), at: time(item.timeline?.arrivedAt) },
    { label: t('orderDetail.transport'), at: time(item.timeline?.transportStartedAt) },
    item.status === 'CANCELLED' ? { label: t('orderDetail.cancelled'), at: time(item.cancelledAt) } : { label: t('orderDetail.completed'), at: time(item.completedAt) },
  ]
  const vehicle = [item.vehicle?.make, item.vehicle?.model].filter(Boolean).join(' ')
  return (
    <Screen header={<Header title={`№ ${item.number}`} onBack={nav.pop} />}>
      <Card>
        <Badge label={t(`order.statuses.${item.status}`)} tone={STATUS_TONE[item.status] ?? 'neutral'} />
        <View style={{ gap: space.sm }}>
          <Place icon="pin" label={t('offer.pickup')} value={item.pickupAddress} />
          <Place icon="navigation" label={t('offer.destination')} value={item.destinationAddress ?? t('offer.destinationUnknown')} />
        </View>
      </Card>
      <Card>
        {item.price.amountAmd !== null ? <Row label={t('offer.price')} value={formatPrice(item.price.amountAmd)} /> : <Row label={t('offer.price')} value={t('order.priceNotAgreed')} />}
        {item.route ? <Row label={t('orderDetail.distance')} value={`${(item.route.meters / 1000).toFixed(1)} ${t('common.km')}`} /> : null}
        {vehicle ? <Row label={t('offer.vehicle')} value={vehicle} /> : null}
        {item.problemDescription ? <Row label={t('offer.problem')} value={item.problemDescription} /> : null}
        {item.cancelReason ? <Row label={t('orderDetail.cancelReason')} value={t(`request.reasons.${item.cancelReason}`) === `request.reasons.${item.cancelReason}` ? item.cancelReason : t(`request.reasons.${item.cancelReason}`)} /> : null}
      </Card>
      <Section title={t('orderDetail.timeline')}>
        <Card>
          {steps.map((step, i) => (
            <View key={step.label} style={{ flexDirection: 'row', gap: space.md }}>
              <View style={{ alignItems: 'center' }}>
                <View style={{ width: 14, height: 14, borderRadius: 7, marginTop: 3, backgroundColor: step.at ? colors.success : colors.border }} />
                {i < steps.length - 1 ? <View style={{ width: 2, flex: 1, minHeight: 20, backgroundColor: colors.border }} /> : null}
              </View>
              <View style={{ flex: 1, paddingBottom: space.md }}>
                <Text style={[type.bodyStrong, { color: step.at ? colors.text : colors.muted }]}>{step.label}</Text>
                <Text style={[type.small, { color: colors.textSecondary }]}>{step.at ?? '—'}</Text>
              </View>
            </View>
          ))}
        </Card>
      </Section>
    </Screen>
  )
}

function Place({ icon, label, value }: { icon: 'pin' | 'navigation'; label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: space.md }}>
      <Icon name={icon} size={20} color={colors.primary} style={{ marginTop: 2 }} />
      <View style={{ flex: 1 }}>
        <Text style={[type.caption, { color: colors.textSecondary }]}>{label}</Text>
        <Text style={[type.body, { color: colors.text }]}>{value}</Text>
      </View>
    </View>
  )
}
