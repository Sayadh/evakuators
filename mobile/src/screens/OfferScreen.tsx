/**
 * The offer. Countdown from the server's deadline; customer contact is NOT
 * here (the API does not send it before acceptance). "Accepted" is shown only
 * after the server confirmed — a dropped connection shows "checking…", never
 * a local success.
 */
import React, { useEffect, useState } from 'react'
import { Text, View } from 'react-native'
import type { CurrentOffer } from '../api/types'
import { secondsLeft } from '../domain/countdown'
import { useT } from '../i18n'
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

  return (
    <Screen title={t('offer.title')}>
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
        <Row label={t('offer.destination')} value={o.destination?.address ?? t('offer.destinationUnknown')} />
        <Row label={t('offer.vehicle')} value={[o.vehicle.make, o.vehicle.model].filter(Boolean).join(' ') + (o.vehicle.weightKg ? ` · ${o.vehicle.weightKg} kg` : '')} />
        {o.problemDescription ? <Row label={t('offer.problem')} value={o.problemDescription} /> : null}
        {(['wheelsRoll', 'steeringLocked', 'gearboxLocked', 'needsManipulator'] as const)
          .filter((k) => (k === 'wheelsRoll' ? o.requirements[k] === false : o.requirements[k] === true))
          .map((k) => (
            <Note key={k} tone="warn">• {t(`offer.requirements.${k}`)}</Note>
          ))}
        {o.price.mode === 'FIXED' ? (
          <Row label={t('offer.price')} value={`${o.price.quotedAmd?.toLocaleString('hy-AM') ?? '—'} ${t('common.dram')}`} />
        ) : (
          <Note tone="warn">{t('offer.negotiation')}</Note>
        )}
      </Card>
      {uncertain ? <Note tone="warn">{t('offer.uncertain')}</Note> : null}
      {failed && action?.errorCode ? <Note tone="danger">{t(`errors.${action.errorCode}`)}</Note> : null}
      <View style={{ gap: 10 }}>
        <Button variant="success" label={sending ? t('offer.sending') : t('offer.accept')} busy={sending} disabled={left <= 0 || uncertain} onPress={() => void app.accept(offer.offerId)} />
        <Button variant="outline" label={t('offer.reject')} disabled={left <= 0 || sending || uncertain} onPress={() => void app.reject(offer.offerId)} />
      </View>
    </Screen>
  )
}
