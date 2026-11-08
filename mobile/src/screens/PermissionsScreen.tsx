/**
 * Plain-language explanation BEFORE any OS prompt, the consent switch, then
 * the prompts in the order the platforms require: foreground location →
 * background ("Always") → notifications. Every denial has its own message and
 * a way to the system settings; the app keeps working with less (only while
 * open) rather than locking the driver out.
 */
import * as Location from 'expo-location'
import React, { useEffect, useState } from 'react'
import { Linking, Switch, Text, View } from 'react-native'
import { useT } from '../i18n'
import { requestPushPermission, setupChannels } from '../push/push'
import { useApp } from '../state/AppState'
import { Button, Card, Note, Row, Screen } from '../ui/kit'

type Status = 'unknown' | 'granted' | 'denied'

export function PermissionsScreen({ onDone }: { onDone: () => void }) {
  const t = useT()
  const app = useApp()
  const [consented, setConsented] = useState((app.snapshot?.trackingConsentVersion ?? 0) >= 1)
  const [foreground, setForeground] = useState<Status>('unknown')
  const [background, setBackground] = useState<Status>('unknown')
  const [notifications, setNotifications] = useState<Status>('unknown')

  useEffect(() => {
    void Location.getForegroundPermissionsAsync().then((p) => setForeground(p.granted ? 'granted' : p.canAskAgain ? 'unknown' : 'denied'))
    void Location.getBackgroundPermissionsAsync().then((p) => setBackground(p.granted ? 'granted' : p.canAskAgain ? 'unknown' : 'denied'))
    void setupChannels()
  }, [])

  async function consent(value: boolean) {
    setConsented(value)
    if (value) await app.consent()
  }

  const label = (s: Status) => (s === 'granted' ? '✓' : s === 'denied' ? '✗' : '—')

  return (
    <Screen title={t('permissions.title')}>
      <Card>
        <Note>{t('permissions.body1')}</Note>
        <Note>{t('permissions.body2')}</Note>
        <Note>{t('permissions.body3')}</Note>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Switch value={consented} onValueChange={(v) => void consent(v)} accessibilityLabel={t('permissions.consent')} />
          <Text style={{ flex: 1 }}>{t('permissions.consent')}</Text>
        </View>
      </Card>
      <Card>
        <Row label={t('permissions.allowForeground')} value={label(foreground)} tone={foreground === 'granted' ? 'ok' : foreground === 'denied' ? 'bad' : undefined} />
        <Button
          label={t('permissions.allowForeground')}
          disabled={!consented || foreground === 'granted'}
          onPress={async () => setForeground((await Location.requestForegroundPermissionsAsync()).granted ? 'granted' : 'denied')}
        />
        <Row label={t('permissions.allowBackground')} value={label(background)} tone={background === 'granted' ? 'ok' : background === 'denied' ? 'warn' : undefined} />
        <Button
          variant="outline"
          label={t('permissions.allowBackground')}
          disabled={foreground !== 'granted' || background === 'granted'}
          onPress={async () => setBackground((await Location.requestBackgroundPermissionsAsync()).granted ? 'granted' : 'denied')}
        />
        {background !== 'granted' ? <Note tone="warn">{t('permissions.backgroundWhy')}</Note> : null}
        <Row label={t('permissions.allowNotifications')} value={label(notifications)} />
        <Button variant="outline" label={t('permissions.allowNotifications')} onPress={async () => setNotifications((await requestPushPermission()) ? 'granted' : 'denied')} />
        {foreground === 'denied' || notifications === 'denied' ? (
          <>
            <Note tone="danger">{t('permissions.denied')}</Note>
            <Button variant="outline" label={t('permissions.openSettings')} onPress={() => void Linking.openSettings()} />
          </>
        ) : null}
      </Card>
      <Button label={t('permissions.continue')} disabled={!consented || foreground !== 'granted'} onPress={onDone} />
    </Screen>
  )
}
