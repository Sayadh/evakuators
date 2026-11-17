/**
 * The offer. Two choices only — Accept or Reject — before the countdown from
 * the server's deadline runs out. Customer contact is NOT here (the API does
 * not send it before acceptance); calling the customer is the first step
 * AFTER accepting (ActiveOrderScreen). "Accepted" is shown only after the
 * server confirmed — a dropped connection shows "checking…", never a local
 * success.
 *
 * Reject is ONE tap (2026-11-14, owner's decision): no second screen, no
 * reason — the offer goes to the next driver at once. The API still accepts
 * an optional reason; the app simply no longer asks for one.
 */
import { useEffect, useState } from 'react'
import { AppState as RNAppState, Platform, Text, View } from 'react-native'
import type { CurrentOffer } from '../api/types'
import { secondsLeft } from '../domain/countdown'
import { useT } from '../i18n'
import { useKeepAwake } from 'expo-keep-awake'
import { startOfferAlert, stopOfferAlert } from '../push/offerAlert'
import { isAlarmAvailable, muteAlarm, ringingOfferId, showAlarm, stopAlarm } from '../push/offerAlarm'
import { alarmTexts } from '../push/push'
import { dismissOfferNotification } from '../push/offerNotification'
import { useApp } from '../state/AppState'
import { Button, Card, colors, Note, Row, Screen } from '../ui/kit'

function km(meters: number | null): string {
  return meters === null ? '—' : `${(meters / 1000).toFixed(1)}`
}

export function OfferScreen({ offer }: { offer: CurrentOffer }) {
  const t = useT()
  const app = useApp()
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(timer)
  }, [])
  const left = secondsLeft(offer.expiresAt, app.clock, now)
  const action = app.pending.find((p) => p.targetId === offer.offerId && (p.kind === 'ACCEPT' || p.kind === 'REJECT'))
  const sending = action?.status === 'SENDING'
  const uncertain = action?.status === 'UNCERTAIN'
  const failed = action?.status === 'FAILED'
  const o = offer.order

  // Two cases (2026-11):
  // - The phone was LOCKED and the alarm brought the app up over the lock
  //   screen (Android, offerAlarm.ts): the alarm keeps ringing until the
  //   driver answers, mutes it, or the offer ends — he may be across the room.
  // - The app was already open: Android rings the same alarm (below);
  //   iOS one short ring (offerAlert.ts).
  const useAlarm = Platform.OS === 'android' && isAlarmAvailable()
  const [alarming, setAlarming] = useState(() => ringingOfferId() === offer.offerId)
  useKeepAwake('offer')
  useEffect(() => {
    const ringing = ringingOfferId() === offer.offerId
    setAlarming(ringing)
    if (useAlarm) {
      // Android (2026-11): ONE ring for every case — app open, in the
      // background or the phone locked — the alarm, until the driver answers,
      // mutes it («Անջատել ձայնը») or the offer ends. The open app used to get
      // a single 7-second ring that was easy to miss, and two ring paths
      // racing each other were behind "no sound on the first order".
      if (!ringing) {
        const route = [o.pickup.address, o.destination?.address].filter(Boolean).join(' → ')
        const deadline = new Date(Date.parse(offer.expiresAt) - app.clock.offsetMs)
        void alarmTexts({ title: t('offer.title'), body: route })
          .then((texts) => showAlarm(offer.offerId, texts, deadline))
          .then((shown) => {
            if (shown) setAlarming(true)
            else startOfferAlert(t('offer.title'))
          })
          .catch(() => startOfferAlert(t('offer.title')))
      }
    } else if (!ringing && RNAppState.currentState === 'active') {
      // iOS: one short ring while the app is open (the push rings otherwise)
      dismissOfferNotification(offer.offerId)
      startOfferAlert(t('offer.title'))
    }
    const sub = RNAppState.addEventListener('change', (state) => {
      if (state !== 'active') return
      // Back from the lock screen: if the alarm is ringing for this offer it
      // keeps ringing (with «Անջատել ձայնը»); otherwise the leftovers go.
      const nowRinging = ringingOfferId() === offer.offerId
      setAlarming(nowRinging)
      if (!nowRinging && !useAlarm) dismissOfferNotification(offer.offerId)
    })
    return () => {
      sub.remove()
      stopOfferAlert()
      // The offer left the screen (answered, expired, withdrawn): silence,
      // and the app goes back behind the lock screen.
      void stopAlarm()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offer.offerId])
  const answered = !!action || left <= 0
  useEffect(() => {
    if (!answered) return
    stopOfferAlert()
    void stopAlarm()
    setAlarming(false)
  }, [answered])

  return (
    <Screen title={t('offer.title')}>
      {alarming ? (
        <Button
          variant="outline"
          icon="close"
          label={t('alerts.mute')}
          onPress={() => {
            void muteAlarm()
            setAlarming(false)
          }}
        />
      ) : null}
      <Card style={{ borderColor: colors.accent, borderWidth: 2 }}>
        <Text style={{ fontSize: 28, fontWeight: '800', color: left > 5 ? colors.text : colors.danger }} accessibilityLiveRegion="polite">
          {left > 0 ? t('offer.secondsLeft', { s: left }) : t('offer.expired')}
        </Text>
        <Row
          label={t('offer.toPickup')}
          value={
            offer.toPickup.etaSeconds !== null
              ? `${km(offer.toPickup.roadMeters)} ${t('common.km')} · ${Math.max(1, Math.round(offer.toPickup.etaSeconds / 60))} ${t('common.min')} (${t('offer.approximate')})`
              : `${km(offer.toPickup.straightLineMeters)} ${t('common.km')} ${t('offer.straightLine')}`
          }
        />
      </Card>
      <Card>
        <Row label={t('offer.pickup')} value={o.pickup.address} />
        {o.pickup.precision ? <Note tone={o.pickup.precision === 'EXACT' ? 'success' : 'warn'}>{t(`order.precision.${o.pickup.precision}`)}</Note> : null}
        <Row label={t('offer.destination')} value={o.destination?.address ?? t('offer.destinationUnknown')} />
        <Row label={t('offer.vehicle')} value={[o.vehicle.make, o.vehicle.model].filter(Boolean).join(' ') + (o.vehicle.weightKg ? ` · ${o.vehicle.weightKg} kg` : '')} />
        {o.problemDescription ? <Row label={t('offer.problem')} value={o.problemDescription} /> : null}
        {(['wheelsRoll', 'steeringLocked', 'gearboxLocked', 'needsManipulator'] as const)
          .filter((k) => (k === 'wheelsRoll' ? o.requirements[k] === false : o.requirements[k] === true))
          .map((k) => (
            <Note key={k} tone="warn">• {t(`offer.requirements.${k}`)}</Note>
          ))}
        {o.requirements.needsWheelSkates ? (
          <Note tone="warn">
            • {o.requirements.wheelSkatesCount ? t('offer.requirements.wheelSkatesCount', { n: o.requirements.wheelSkatesCount }) : t('offer.requirements.wheelSkates')}
          </Note>
        ) : null}
        {o.price.mode === 'FIXED' ? (
          <Row label={t('offer.price')} value={`${o.price.quotedAmd?.toLocaleString('hy-AM') ?? '—'} ${t('common.dram')}`} />
        ) : (
          <Note tone="warn">{t('offer.negotiation')}</Note>
        )}
        {offer.fee ? (
          <Row
            label={t('offer.fee')}
            value={
              offer.fee.amountAmd === 0
                ? t('wallet.free')
                : `${offer.fee.amountAmd.toLocaleString('hy-AM')} ${t('common.dram')}${offer.fee.provisional ? ` · ${t('offer.feeProvisional')}` : ''}`
            }
          />
        ) : null}
      </Card>
      {uncertain ? <Note tone="warn">{t('offer.uncertain')}</Note> : null}
      {failed && action?.errorCode ? <Note tone="danger">{t(`errors.${action.errorCode}`)}</Note> : null}
      <View style={{ gap: 10 }}>
        <Button variant="success" label={sending && action?.kind === 'ACCEPT' ? t('offer.sending') : t('offer.accept')} busy={sending && action?.kind === 'ACCEPT'} disabled={left <= 0 || sending || uncertain} onPress={() => void app.accept(offer.offerId)} />
        <Button variant="outline" label={sending && action?.kind === 'REJECT' ? t('offer.sending') : t('offer.reject')} busy={sending && action?.kind === 'REJECT'} disabled={left <= 0 || sending || uncertain} onPress={() => void app.reject(offer.offerId, null)} />
      </View>
    </Screen>
  )
}
