/**
 * The "prominent disclosure" both stores require BEFORE any OS location
 * prompt (Google Play User Data policy; App Store 5.1.1/5.1.5): it names
 * location, says it is collected ALSO WHEN THE APP IS CLOSED OR NOT IN USE,
 * lists the features it powers, who receives it, and how to stop it — and it
 * can be declined («Ոչ հիմա»). Declining keeps the app usable (history,
 * settings, account deletion); only receiving orders needs location
 * (App Store 5.1.2 — an app may not demand data it does not need for the
 * feature in use).
 *
 * Order of prompts the platforms require: foreground → background ("Always")
 * → notifications. Each OS prompt is behind the driver's own tap, after the
 * consent switch — never on screen open. Changing this text: keep it in step
 * with the website's /driver-app/privacy, the iOS purpose strings
 * (app.config.ts + locales/*.json) and the Play Console declaration; bump
 * the consent version if its MEANING changes.
 */
import * as Location from 'expo-location'
import { useEffect, useState } from 'react'
import { Linking, Switch, Text, View } from 'react-native'
import { ApiError, PRIVACY_POLICY_URL } from '../api/client'
import { useT } from '../i18n'
import { requestPushPermission, setupChannels } from '../push/push'
import { useApp } from '../state/AppState'
import { Button, Card, colors, Note, Row, Screen } from '../ui/kit'

type Status = 'unknown' | 'granted' | 'denied'

export function PermissionsScreen({ onDone, onSkip }: { onDone: () => void; onSkip: () => void }) {
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

  const [consentError, setConsentError] = useState<string | null>(null)

  async function consent(value: boolean) {
    setConsented(value)
    setConsentError(null)
    if (!value) return
    try {
      await app.consent()
    } catch (error) {
      // Not recorded by the server → the switch must not look on.
      setConsented(false)
      setConsentError(t(`errors.${error instanceof ApiError ? error.code : 'NETWORK'}`))
    }
    // Turning the switch off here is "not yet" — a recorded consent is
    // withdrawn in Settings (which also takes the driver offline).
  }

  const label = (s: Status) => (s === 'granted' ? '✓' : s === 'denied' ? '✗' : '—')

  return (
    <Screen title={t('permissions.title')}>
      <Card>
        <Text style={{ fontSize: 17, fontWeight: '700', color: colors.text }}>{t('permissions.headline')}</Text>
        <Note>{t('permissions.body1')}</Note>
        <Note>{t('permissions.body2')}</Note>
        <Note>{t('permissions.body3')}</Note>
        <Note>{t('permissions.body4')}</Note>
        <Button variant="outline" label={t('privacy.policy')} onPress={() => void Linking.openURL(PRIVACY_POLICY_URL)} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Switch value={consented} onValueChange={(v) => void consent(v)} accessibilityLabel={t('permissions.consent')} />
          <Text style={{ flex: 1 }}>{t('permissions.consent')}</Text>
        </View>
        {consentError ? <Note tone="danger">{consentError}</Note> : null}
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
          disabled={!consented || foreground !== 'granted' || background === 'granted'}
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
      <Button variant="outline" label={t('permissions.notNow')} onPress={onSkip} />
      <Note>{t('permissions.notNowNote')}</Note>
    </Screen>
  )
}
