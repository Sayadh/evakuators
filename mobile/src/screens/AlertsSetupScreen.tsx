/**
 * «Ծանուցումների կարգավորում» — makes sure a new offer RINGS and comes up on
 * screen on a locked phone, and lets the driver prove it with a test.
 *
 * Android: notifications, the alarm channel, «Full screen notifications»
 * (Android 14+ asks the user), alarm volume — required; overriding Do Not
 * Disturb and battery optimisation — recommended. iOS: notifications (and
 * Critical Alerts once Apple approves them); iOS offers no "over the lock
 * screen" for a non-calling app, so the offer is a time-sensitive alert with
 * the ring, repeated until answered.
 */
import * as Notifications from 'expo-notifications'
import { useEffect, useState } from 'react'
import { Linking, Platform, Text, View } from 'react-native'
import { useT } from '../i18n'
import { useNav } from '../navigation/Navigator'
import { blocksAlarm, type ReadinessCheck } from '../push/alertReadiness'
import { openAlarmSettings, raiseAlarmVolume, testAlarm } from '../push/offerAlarm'
import { requestPushPermission } from '../push/push'
import { getAlertSound, onAlertSoundChange, soundFile, type AlertSoundId } from '../push/sounds'
import { useAlertReadiness } from '../push/useAlertReadiness'
import { useApp } from '../state/AppState'
import { Icon } from '../ui/Icon'
import { Badge, Banner, Button, Card, Header, ListGroup, ListItem, Loading, Note, Screen, Section } from '../ui/kit'
import { colors, space, type } from '../ui/theme'

export function AlertsSetupScreen() {
  const t = useT()
  const nav = useNav()
  const app = useApp()
  const { checks, recheck } = useAlertReadiness()
  const [testing, setTesting] = useState(false)
  const [testStartedAt, setTestStartedAt] = useState<number | null>(null)
  const [sound, setSound] = useState<AlertSoundId | null>(null)
  useEffect(() => {
    void getAlertSound().then(setSound)
    return onAlertSoundChange(setSound)
  }, [])

  if (!checks) return <Loading />

  async function fix(check: ReadinessCheck) {
    const f = check.fix
    if (!f) return
    if (f.kind === 'request') {
      const granted = Platform.OS === 'ios' ? await requestPushPermission().catch(() => false) : (await Notifications.requestPermissionsAsync()).granted
      if (!granted) await Linking.openSettings()
    } else if (f.kind === 'settings') {
      if (f.which === 'app' || !openAlarmSettings(f.which)) await Linking.openSettings()
    } else if (f.kind === 'volume') {
      raiseAlarmVolume()
    }
    await recheck()
  }

  async function test() {
    setTesting(true)
    setTestStartedAt(Date.now())
    const texts = { title: t('alerts.testTitle'), body: t('alerts.testBody'), accept: t('offer.accept'), reject: t('offer.reject'), channelName: t('alerts.channelName') }
    if (Platform.OS === 'android') {
      await testAlarm(5000, texts)
    } else {
      await Notifications.scheduleNotificationAsync({
        content: { title: texts.title, body: texts.body, sound: soundFile(await getAlertSound()), interruptionLevel: 'timeSensitive' },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 5 },
      })
    }
    setTimeout(() => setTesting(false), 6000)
  }

  const blocked = blocksAlarm(checks)
  const required = checks.filter((c) => c.required)
  const recommended = checks.filter((c) => !c.required)
  const testSeen = app.alarmTestSeenAt !== null && testStartedAt !== null && app.alarmTestSeenAt > testStartedAt

  const row = (check: ReadinessCheck) => (
    <Card key={check.key} style={!check.ok && check.required ? { borderColor: colors.danger } : undefined}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <Icon name={check.ok ? 'check' : 'alert'} size={22} color={check.ok ? colors.success : check.required ? colors.danger : colors.warning} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[type.bodyStrong, { color: colors.text }]}>{t(`alerts.checks.${check.key}.title`)}</Text>
          <Text style={[type.small, { color: colors.textSecondary }]}>{t(`alerts.checks.${check.key}.${check.ok ? 'ok' : 'missing'}`)}</Text>
        </View>
        {check.ok ? <Badge label={t('alerts.ok')} tone="success" /> : null}
      </View>
      {!check.ok && check.fix && check.fix.kind !== 'rebuild' ? (
        <Button size="sm" variant={check.required ? 'primary' : 'outline'} label={t(`alerts.checks.${check.key}.action`)} onPress={() => void fix(check)} />
      ) : null}
    </Card>
  )

  return (
    <Screen header={<Header title={t('alerts.title')} onBack={nav.pop} />}>
      {blocked ? <Banner tone="danger" title={t('alerts.blockedTitle')}>{t('alerts.blockedBody')}</Banner> : <Banner tone="success" title={t('alerts.readyTitle')}>{t(Platform.OS === 'ios' ? 'alerts.readyBodyIos' : 'alerts.readyBody')}</Banner>}

      <Section title={t('alerts.required')}>{required.map(row)}</Section>
      {recommended.length > 0 ? <Section title={t('alerts.recommended')}>{recommended.map(row)}</Section> : null}

      <Section title={t('sound.title')}>
        <ListGroup>
          <ListItem icon="bell" title={t('sound.title')} subtitle={t('sound.menuSubtitle')} value={sound ? t(`sound.names.${sound}`) : undefined} onPress={() => nav.push('alertSound')} last />
        </ListGroup>
      </Section>

      <Section title={t('alerts.testSection')}>
        <Card>
          <Note>{t(Platform.OS === 'ios' ? 'alerts.testHintIos' : 'alerts.testHint')}</Note>
          <Button icon="refresh" label={testing ? t('alerts.testWaiting') : t('alerts.test')} busy={testing} onPress={() => void test()} />
          {testSeen ? <Banner tone="success">{t('alerts.testSeen')}</Banner> : null}
        </Card>
      </Section>
      {Platform.OS === 'ios' ? <Note>{t('alerts.iosNote')}</Note> : null}
    </Screen>
  )
}
