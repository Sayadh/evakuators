/**
 * Online/offline, connection, GPS and status — three separate facts, shown
 * separately, plus "busy with another order" (outside the platform).
 */
import React, { useState } from 'react'
import { Switch, Text, View } from 'react-native'
import { useT } from '../i18n'
import { useApp } from '../state/AppState'
import { Button, Card, colors, Note, Row, Screen } from '../ui/kit'

export function HomeScreen({ go }: { go: (screen: 'order' | 'history' | 'settings') => void }) {
  const t = useT()
  const app = useApp()
  const [busy, setBusy] = useState(false)
  const s = app.snapshot
  if (!s) return <Screen><Note>{app.lastError ? t(`errors.${app.lastError}`) : t('common.loading')}</Note></Screen>
  const a = s.availability

  const gpsText = { FRESH: t('home.gpsFresh'), STALE: t('home.gpsStale'), NONE: t('home.gpsNone'), INACCURATE: t('home.gpsInaccurate'), SUSPICIOUS: t('home.gpsSuspicious') }[a.gps]
  const toggle = async (fn: () => Promise<void>) => {
    setBusy(true)
    try {
      await fn()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen title={t('appName')}>
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text }}>{t('home.receiveOrders')}</Text>
          <Switch value={s.switches.wantsOnline} disabled={busy} onValueChange={(v) => void toggle(() => app.setOnline(v))} accessibilityLabel={t('home.receiveOrders')} />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 16, color: colors.text }}>{t('home.busyElsewhere')}</Text>
          <Switch value={s.switches.externalBusy} disabled={busy} onValueChange={(v) => void toggle(() => app.setExternalBusy(v))} accessibilityLabel={t('home.busyElsewhere')} />
        </View>
        {!s.switches.wantsOnline && s.activeOrder ? <Note tone="warn">{t('home.offlineActiveNote')}</Note> : null}
      </Card>
      <Card>
        <Row label={t('home.connection')} value={app.connected ? t('home.connected') : t('home.disconnected')} tone={app.connected ? 'ok' : 'bad'} />
        <Row label={t('home.gps')} value={`${gpsText}${a.gpsAgeSeconds !== null ? ` · ${a.gpsAgeSeconds} ${t('common.sec')}` : ''}`} tone={a.gps === 'FRESH' ? 'ok' : 'warn'} />
        <Row label={t('home.status')} value={a.eligible ? t('home.ready') : t('home.notReady')} tone={a.eligible ? 'ok' : 'warn'} />
        {!a.eligible ? a.reasons.map((r) => <Note key={r}>• {t(`reasons.${r}`)}</Note>) : null}
      </Card>
      {s.activeOrder ? <Button variant="accent" label={t('order.title')} onPress={() => go('order')} /> : null}
      <Button variant="outline" label={t('home.history')} onPress={() => go('history')} />
      <Button variant="outline" label={t('home.settings')} onPress={() => go('settings')} />
    </Screen>
  )
}
