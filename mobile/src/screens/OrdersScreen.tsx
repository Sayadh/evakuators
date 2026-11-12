/**
 * Orders — every job this driver was assigned, newest first: a month summary,
 * filters, day groups, and paging (the server's cursor). Tapping a job opens
 * its details. No customer contact here: that is for the live order only.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Text, View } from 'react-native'
import { formatDateLong } from '~/utils/formatters'
import { formatPrice } from '~/utils/formatPrice'
import { api } from '../api/client'
import type { HistoryItem } from '../api/types'
import { groupByDay, matchesFilter, monthSummary, nextCursor, PAGE_SIZE, type HistoryFilter } from '../domain/history'
import { useLanguage, useT } from '../i18n'
import { useNav } from '../navigation/Navigator'
import { useMissedOffers } from '../state/missedOffers'
import { Icon } from '../ui/Icon'
import { Badge, Banner, Button, Card, Chips, EmptyState, Loading, Screen, type BadgeTone } from '../ui/kit'
import { colors, space, type } from '../ui/theme'

export const STATUS_TONE: Record<string, BadgeTone> = {
  COMPLETED: 'success',
  CANCELLED: 'danger',
  NEEDS_ATTENTION: 'warn',
  TRANSPORTING: 'accent',
  EN_ROUTE_TO_PICKUP: 'accent',
  ARRIVED_AT_PICKUP: 'accent',
  ASSIGNED: 'primary',
  PRICE_CONFIRMATION_PENDING: 'primary',
}

export function OrdersScreen() {
  const t = useT()
  const language = useLanguage()
  const nav = useNav()
  const [items, setItems] = useState<HistoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [more, setMore] = useState(false)
  const [error, setError] = useState(false)
  const [done, setDone] = useState(false)
  const [filter, setFilter] = useState<HistoryFilter>('all')
  const missed = useMissedOffers()

  const load = useCallback(async (before?: string) => {
    if (before) setMore(true)
    else setLoading(true)
    try {
      const page = await api.history(before)
      setItems((current) => (before ? [...current, ...page] : page))
      setDone(page.length < PAGE_SIZE)
      setError(false)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
      setMore(false)
    }
  }, [])
  useEffect(() => void load(), [load])

  const visible = useMemo(() => items.filter((item) => matchesFilter(item, filter)), [items, filter])
  const summary = useMemo(() => monthSummary(items, new Date()), [items])

  if (loading && items.length === 0) return <Loading label={t('common.loading')} />

  return (
    <Screen title={t('history.title')} refreshing={false} onRefresh={() => void load()}>
      <Card tone="primary">
        <Text style={[type.caption, { color: 'rgba(255,255,255,0.75)', textTransform: 'uppercase' }]}>{t('history.thisMonth')}</Text>
        <View style={{ flexDirection: 'row', gap: space.xl }}>
          <View>
            <Text style={[type.display, { color: '#fff' }]}>{summary.completed}</Text>
            <Text style={[type.small, { color: 'rgba(255,255,255,0.8)' }]}>{t('history.completedJobs')}</Text>
          </View>
          <View>
            <Text style={[type.display, { color: colors.accent }]}>{formatPrice(summary.earnedAmd)}</Text>
            <Text style={[type.small, { color: 'rgba(255,255,255,0.8)' }]}>{t('history.earned')}</Text>
          </View>
        </View>
      </Card>

      <Card onPress={() => nav.push('missedOffers')}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <Icon name="alert" size={22} color={missed.unseen > 0 ? colors.danger : colors.muted} />
          <View style={{ flex: 1 }}>
            <Text style={[type.bodyStrong, { color: colors.text }]}>{t('missed.title')}</Text>
            <Text style={[type.small, { color: colors.textSecondary }]}>
              {missed.items.length === 0 ? t('missed.menuNone') : t('missed.menuSubtitle')}
            </Text>
          </View>
          {missed.unseen > 0 ? <Badge label={t('missed.unseen', { count: String(missed.unseen) })} tone="danger" /> : null}
          <Icon name="chevron-right" size={18} color={colors.muted} />
        </View>
      </Card>

      <Chips
        options={(['all', 'completed', 'cancelled', 'other'] as const).map((value) => ({ value, label: t(`history.filters.${value}`) }))}
        selected={[filter]}
        onToggle={(value) => setFilter(value as HistoryFilter)}
      />

      {error ? <Banner tone="danger" action={{ label: t('common.retry'), onPress: () => void load() }}>{t('errors.NETWORK')}</Banner> : null}
      {!error && visible.length === 0 ? <EmptyState icon="orders" title={t('history.empty')} text={t('history.emptyHint')} /> : null}

      {groupByDay(visible).map((group) => (
        <View key={group.dayKey} style={{ gap: space.sm }}>
          <Text style={[type.caption, { color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 }]}>{formatDateLong(`${group.dayKey}T12:00:00+04:00`, language)}</Text>
          {group.items.map((item) => (
            <Card key={item.id} onPress={() => nav.push('orderDetail', { item })}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                <Text style={[type.bodyStrong, { color: colors.text, flex: 1 }]}>№ {item.number}</Text>
                <Badge label={t(`order.statuses.${item.status}`)} tone={STATUS_TONE[item.status] ?? 'neutral'} />
              </View>
              <View style={{ flexDirection: 'row', gap: space.sm }}>
                <Icon name="route" size={18} color={colors.muted} style={{ marginTop: 2 }} />
                <Text style={[type.small, { color: colors.textSecondary, flex: 1 }]} numberOfLines={2}>
                  {item.pickupAddress}
                  {item.destinationAddress ? ` → ${item.destinationAddress}` : ''}
                </Text>
              </View>
              {item.price.amountAmd !== null ? <Text style={[type.bodyStrong, { color: colors.text }]}>{formatPrice(item.price.amountAmd)}</Text> : null}
            </Card>
          ))}
        </View>
      ))}
      {!done && items.length > 0 ? <Button variant="outline" label={t('history.more')} busy={more} onPress={() => void load(nextCursor(items))} /> : null}
    </Screen>
  )
}
