/**
 * Home — the driver's working screen: am I receiving orders, can the system
 * see me, and is there a job in progress. Online/offline, connection, GPS and
 * readiness are separate facts and shown separately (the server decides
 * readiness; the reasons are its own).
 */
import { useState } from 'react'
import * as Location from 'expo-location'
import { Image, Linking, Platform, StyleSheet, Text, View } from 'react-native'
import { formatPrice } from '~/utils/formatPrice'
import { ApiError, mediaUrl } from '../api/client'
import { useLanguage, useT } from '../i18n'
import { useNav } from '../navigation/Navigator'
import { useApp, type GpsRefreshResult } from '../state/AppState'
import { useProfile } from '../state/ProfileState'
import { useMissedOffers } from '../state/missedOffers'
import { blocksAlarm } from '../push/alertReadiness'
import { useAlertReadiness } from '../push/useAlertReadiness'
import { Icon } from '../ui/Icon'
import { Badge, Banner, Button, Card, Loading, Note, Screen, SwitchRow } from '../ui/kit'
import { colors, radius, space, type } from '../ui/theme'

export function HomeScreen() {
  const t = useT()
  const language = useLanguage()
  const app = useApp()
  const nav = useNav()
  const { profile } = useProfile()
  const { checks } = useAlertReadiness()
  const missed = useMissedOffers()
  const [busy, setBusy] = useState(false)
  const [toggleError, setToggleError] = useState<string | null>(null)
  const [gpsBusy, setGpsBusy] = useState(false)
  const [gpsResult, setGpsResult] = useState<GpsRefreshResult | null>(null)
  const s = app.snapshot
  if (!s) return app.lastError ? <Screen><Banner tone="danger">{t(`errors.${app.lastError}`)}</Banner><Button label={t('common.retry')} onPress={() => void app.refresh()} /></Screen> : <Loading label={t('common.loading')} />
  const a = s.availability
  const photo = profile?.kind === 'SITE_LINKED' ? profile.profile.imageDetails?.[0]?.url ?? profile.profile.images?.[0] : undefined

  const gpsText = { FRESH: t('home.gpsFresh'), STALE: t('home.gpsStale'), NONE: t('home.gpsNone'), INACCURATE: t('home.gpsInaccurate'), SUSPICIOUS: t('home.gpsSuspicious') }[a.gps]
  const toggle = async (fn: () => Promise<void>) => {
    setBusy(true)
    setToggleError(null)
    try {
      await fn()
    } catch (error) {
      // Never an unhandled rejection: say what happened. No consent → the
      // disclosure screen, which is where it is given.
      const code = error instanceof ApiError ? error.code : 'NETWORK'
      if (code === 'TRACKING_CONSENT_REQUIRED') nav.push('permissions')
      else setToggleError(t(`errors.${code}`))
    } finally {
      setBusy(false)
    }
  }

  const online = s.switches.wantsOnline
  // GPS problems the PHONE has (not the server's view): shown while the driver works
  const health = app.locationHealth
  const working = online || !!s.activeOrder
  const consented = (s.trackingConsentVersion ?? 0) >= 1
  // GPS lost → the server still offers orders measured from his base (eligibility-sql BASE)
  const hasBase = s.driver.hasBase === true
  const gpsBanner = !health || !working || !consented ? null : !health.servicesEnabled ? 'servicesOff' : !health.foreground ? 'permission' : !health.background ? 'background' : null

  async function turnOnLocation() {
    if (Platform.OS === 'android') {
      // The system "Turn on location" dialog — one tap, no leaving the app
      await Location.enableNetworkProviderAsync().catch(() => Linking.sendIntent('android.settings.LOCATION_SOURCE_SETTINGS').catch(() => Linking.openSettings()))
    } else {
      await Linking.openSettings()
    }
    await app.recheckLocation()
  }
  /** Manual «refresh GPS»: restart tracking and send a fix now (pull-to-refresh does the same while working) */
  async function refreshGps() {
    setGpsBusy(true)
    setGpsResult(null)
    try {
      setGpsResult(await app.refreshLocation())
    } finally {
      setGpsBusy(false)
    }
  }
  const status = a.eligible ? { tone: 'success' as const, text: t('home.ready') } : a.baseFallback ? { tone: 'warn' as const, text: t('home.readyByBase') } : { tone: 'neutral' as const, text: t('home.notReady') }

  return (
    <Screen refreshing={false} onRefresh={() => void (working && consented ? refreshGps() : app.refresh())}>
      <View style={styles.greeting}>
        {photo ? <Image source={{ uri: mediaUrl(photo) }} style={styles.avatar} /> : <View style={[styles.avatar, styles.avatarEmpty]}><Icon name="truck" size={24} color={colors.primary} /></View>}
        <View style={{ flex: 1 }}>
          <Text style={[type.small, { color: colors.textSecondary }]}>{t('home.hello')}</Text>
          <Text style={[type.title, { color: colors.text }]} numberOfLines={1}>{s.driver.name}</Text>
        </View>
        <Badge label={app.connected ? t('home.connected') : t('home.disconnected')} tone={app.connected ? 'success' : 'danger'} dot />
      </View>

      {s.activeOrder ? (
        <Card tone="accent" onPress={() => nav.push('order')}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <Icon name="navigation" size={22} color={colors.accentDark} />
            <Text style={[type.heading, { color: colors.text, flex: 1 }]}>{t('order.title')} · {s.activeOrder.number}</Text>
            <Icon name="chevron-right" size={20} color={colors.muted} />
          </View>
          <Badge label={t(`order.statuses.${s.activeOrder.status}`)} tone="accent" />
          <Text style={[type.small, { color: colors.textSecondary }]} numberOfLines={2}>{s.activeOrder.pickup.address}</Text>
        </Card>
      ) : null}

      {/* Blocked by an operator: why, and until when — and no way to go online meanwhile */}
      {s.driver.blocked ? (
        <Banner tone="danger" title={t('blocked.title')}>
          {[
            s.driver.blocked.reason ? t('blocked.reason', { reason: s.driver.blocked.reason }) : null,
            s.driver.blocked.until
              ? t('blocked.until', { date: new Date(s.driver.blocked.until).toLocaleString(language === 'ru' ? 'ru-RU' : 'hy-AM', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) })
              : t('blocked.untilLifted'),
            t('blocked.contact'),
          ]
            .filter(Boolean)
            .join('\n')}
        </Banner>
      ) : null}

      {s.driver.blocked ? null : (
      <View style={[styles.power, { backgroundColor: online ? colors.primary : colors.surface, borderColor: online ? colors.primary : colors.border }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <View style={[styles.powerIcon, { backgroundColor: online ? colors.success : colors.bg }]}>
            <Icon name="power" size={26} color={online ? '#fff' : colors.muted} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[type.heading, { color: online ? '#fff' : colors.text }]}>{online ? t('home.onlineTitle') : t('home.offlineTitle')}</Text>
            <Text style={[type.small, { color: online ? 'rgba(255,255,255,0.8)' : colors.textSecondary }]}>{online ? t('home.onlineHint') : t('home.offlineHint')}</Text>
          </View>
        </View>
        <Button
          variant={online ? 'outline' : 'success'}
          icon="power"
          label={online ? t('home.goOffline') : t('home.goOnline')}
          busy={busy}
          onPress={() => void toggle(() => app.setOnline(!online))}
        />
      </View>
      )}
      {!online && s.activeOrder ? <Banner tone="warn">{t('home.offlineActiveNote')}</Banner> : null}
      {toggleError ? <Banner tone="danger">{toggleError}</Banner> : null}
      {s.wallet?.low ? (
        <Banner tone="danger" title={t('wallet.lowTitle')} action={{ label: t('wallet.topUp'), onPress: () => nav.push('wallet') }}>
          {t('wallet.homeLowBody', { balance: formatPrice(s.wallet.balanceAmd) })}
        </Banner>
      ) : null}
      {missed.unseen > 0 && !s.currentOffer ? (
        <Banner tone="warn" title={t('missed.homeTitle', { count: String(missed.unseen) })} action={{ label: t('missed.homeAction'), onPress: () => nav.openOn('orders', 'missedOffers') }}>
          {t('missed.homeBody')}
        </Banner>
      ) : null}
      {checks && blocksAlarm(checks) ? (
        <Banner tone="danger" title={t('alerts.homeTitle')} action={{ label: t('alerts.homeAction'), onPress: () => nav.push('alertsSetup') }}>
          {t('alerts.homeBody')}
        </Banner>
      ) : null}
      {app.gpsRecovering ? <Banner tone="info">{t('gpsHealth.recovering')}</Banner> : null}
      {gpsBanner === 'servicesOff' ? (
        <Banner
          tone={hasBase ? 'warn' : 'danger'}
          title={t('gpsHealth.servicesOffTitle')}
          action={{ label: t(Platform.OS === 'ios' ? 'gpsHealth.servicesOffActionIos' : 'gpsHealth.servicesOffAction'), onPress: () => void turnOnLocation() }}
        >
          {hasBase ? t('gpsHealth.baseBody') : t(Platform.OS === 'ios' ? 'gpsHealth.servicesOffBodyIos' : 'gpsHealth.servicesOffBody')}
        </Banner>
      ) : gpsBanner === 'permission' ? (
        <Banner tone={hasBase ? 'warn' : 'danger'} title={t('gpsHealth.permissionTitle')} action={{ label: t('gpsHealth.permissionAction'), onPress: () => nav.push('permissions') }}>
          {hasBase ? t('gpsHealth.baseBody') : t('gpsHealth.permissionBody')}
        </Banner>
      ) : gpsBanner === 'background' ? (
        <Banner tone="warn" title={t('gpsHealth.backgroundTitle')} action={{ label: t('gpsHealth.backgroundAction'), onPress: () => void Linking.openSettings() }}>
          {t('gpsHealth.backgroundBody')}
        </Banner>
      ) : null}
      {(s.trackingConsentVersion ?? 0) < 1 ? <Banner tone="warn" title={t('home.locationOff')} action={{ label: t('home.enableLocation'), onPress: () => nav.push('permissions') }} /> : null}

      <Card>
        <View style={styles.facts}>
          <Fact icon="refresh" label={t('home.connection')} value={app.connected ? t('home.connected') : t('home.disconnected')} ok={app.connected} />
          <Fact icon="pin" label={t('home.gps')} value={`${gpsText}${a.gpsAgeSeconds !== null ? ` · ${a.gpsAgeSeconds} ${t('common.sec')}` : ''}`} ok={a.gps === 'FRESH'} />
        </View>
        {working && consented ? (
          <>
            <Button variant="outline" size="sm" icon="refresh" label={gpsBusy || app.gpsRecovering ? t('gpsHealth.refreshing') : t('gpsHealth.refresh')} busy={gpsBusy} onPress={() => void refreshGps()} />
            {gpsResult && !gpsBusy ? (
              <Note>{t(`gpsHealth.result.${gpsResult}`)}</Note>
            ) : null}
          </>
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <Text style={[type.label, { color: colors.textSecondary }]}>{t('home.status')}</Text>
          <Badge label={status.text} tone={status.tone} dot />
        </View>
        {!a.eligible ? a.reasons.map((r) => <Note key={r}>• {t(`reasons.${r}`)}</Note>) : null}
        {a.baseFallback ? <Note>{t('home.baseFallbackNote')}</Note> : null}
      </Card>

      <Card>
        <SwitchRow label={t('home.busyElsewhere')} hint={t('home.busyElsewhereHint')} value={s.switches.externalBusy} disabled={busy} onChange={(v) => void toggle(() => app.setExternalBusy(v))} />
      </Card>

      {s.wallet?.billingEnabled ? (
        <Card onPress={() => nav.push('wallet')}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
            <Icon name="wallet" size={22} color={s.wallet.low ? colors.danger : colors.primary} />
            <Text style={[type.bodyStrong, { color: colors.text, flex: 1 }]}>{t('wallet.title')}</Text>
            <Text style={[type.heading, { color: s.wallet.low ? colors.danger : colors.text }]}>{formatPrice(s.wallet.balanceAmd)}</Text>
            <Icon name="chevron-right" size={18} color={colors.muted} />
          </View>
        </Card>
      ) : null}

      <View style={{ flexDirection: 'row', gap: space.md }}>
        <Tile icon="orders" label={t('tabs.orders')} onPress={() => nav.switchTab('orders')} />
        <Tile icon="user" label={t('tabs.profile')} onPress={() => nav.switchTab('profile')} />
      </View>
    </Screen>
  )
}

function Fact({ icon, label, value, ok }: { icon: 'refresh' | 'pin'; label: string; value: string; ok: boolean }) {
  return (
    <View style={styles.fact}>
      <Icon name={icon} size={18} color={ok ? colors.success : colors.warning} />
      <View style={{ flex: 1 }}>
        <Text style={[type.caption, { color: colors.textSecondary }]}>{label}</Text>
        <Text style={[type.label, { color: ok ? colors.success : colors.warning }]} numberOfLines={1}>{value}</Text>
      </View>
    </View>
  )
}

function Tile({ icon, label, onPress }: { icon: 'orders' | 'user'; label: string; onPress: () => void }) {
  return (
    <Card onPress={onPress} style={{ flex: 1, alignItems: 'center', paddingVertical: space.lg }}>
      <Icon name={icon} size={26} color={colors.primary} />
      <Text style={[type.label, { color: colors.text }]}>{label}</Text>
    </Card>
  )
}

const styles = StyleSheet.create({
  greeting: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.border },
  avatarEmpty: { backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  power: { borderRadius: radius.lg, borderWidth: 1, padding: space.lg, gap: space.lg },
  powerIcon: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  facts: { flexDirection: 'row', gap: space.md },
  fact: { flex: 1, flexDirection: 'row', gap: space.sm, alignItems: 'center', backgroundColor: colors.bg, borderRadius: radius.md, padding: space.md },
})
