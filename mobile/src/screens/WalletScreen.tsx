/**
 * Wallet («Հաշիվ», 2026-11-12): the driver's prepaid balance, how the fee per
 * order is worked out, topping up through Idram, and the statement.
 *
 * Money moves only on the server. Topping up = the server makes an Idram
 * bill and a short-lived link; the phone's browser carries the driver to
 * Idram; the balance changes when Idram confirms to the server — the app
 * waits for that (polls the bill, and re-reads on a realtime hint or when the
 * driver comes back to the app), it never assumes the payment went through.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState as RNAppState, Linking, Text, View } from 'react-native'
import { formatClockTime, formatDateLong } from '~/utils/formatters'
import { formatPrice } from '~/utils/formatPrice'
import { api, ApiError } from '../api/client'
import type { WalletEntry, WalletResponse } from '../api/types'
import { bonusFor, ENTRY_ICON, feeBands, feeExamples, ordersCovered, parseTopupAmount, topupPresets } from '../domain/wallet'
import { useLanguage, useT } from '../i18n'
import { useNav } from '../navigation/Navigator'
import { useApp } from '../state/AppState'
import { Icon } from '../ui/Icon'
import { Banner, Button, Card, Chips, EmptyState, Field, Header, Loading, Note, Row, Screen, Section } from '../ui/kit'
import { colors, space, type } from '../ui/theme'

/** How long the screen keeps asking whether Idram confirmed a payment */
const WAIT_FOR_PAYMENT_MS = 10 * 60 * 1000
const POLL_MS = 3000

export function WalletScreen() {
  const t = useT()
  const language = useLanguage()
  const nav = useNav()
  const app = useApp()
  const [wallet, setWallet] = useState<WalletResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [more, setMore] = useState<WalletEntry[]>([])
  const [moreBusy, setMoreBusy] = useState(false)
  const [moreDone, setMoreDone] = useState(false)
  const [amountText, setAmountText] = useState('')
  const [preset, setPreset] = useState<number | null>(null)
  const [topupError, setTopupError] = useState<string | null>(null)
  const [paying, setPaying] = useState(false)
  const [waiting, setWaiting] = useState<{ paymentId: number; amountAmd: number; since: number } | null>(null)
  const [outcome, setOutcome] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null)

  const load = useCallback(async () => {
    try {
      setWallet(await api.wallet())
      setMore([])
      setMoreDone(false)
      setError(null)
    } catch (e) {
      setError(t(`errors.${e instanceof ApiError ? e.code : 'NETWORK'}`))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `t` only words the error; reloading on a language switch is not wanted
  }, [])

  // First load, back from the browser, and the server's "balance changed" hint
  const balanceHint = app.snapshot?.wallet?.balanceAmd
  useEffect(() => void load(), [load, balanceHint])
  useEffect(() => {
    const sub = RNAppState.addEventListener('change', (state) => {
      if (state === 'active') void load()
    })
    return () => sub.remove()
  }, [load])

  // Waiting for Idram's confirmation of the bill the driver just paid
  const refreshApp = app.refresh
  const waitingRef = useRef(waiting)
  waitingRef.current = waiting
  useEffect(() => {
    if (!waiting) return
    const timer = setInterval(async () => {
      const current = waitingRef.current
      if (!current || RNAppState.currentState !== 'active') return
      if (Date.now() - current.since > WAIT_FOR_PAYMENT_MS) {
        setWaiting(null)
        return
      }
      const bill = await api.topup(current.paymentId).catch(() => null)
      if (!bill || bill.status === 'PENDING') return
      setWaiting(null)
      setOutcome(
        bill.status === 'PAID'
          ? { tone: 'success', text: t('wallet.paid', { amount: formatPrice(bill.amountAmd) }) }
          : { tone: 'danger', text: t('wallet.notPaid') },
      )
      void load()
      void refreshApp()
    }, POLL_MS)
    return () => clearInterval(timer)
  }, [waiting, load, refreshApp, t])

  if (!wallet) {
    return (
      <Screen header={<Header title={t('wallet.title')} onBack={nav.pop} />}>
        {error ? <Banner tone="danger" action={{ label: t('common.retry'), onPress: () => void load() }}>{error}</Banner> : <Loading label={t('common.loading')} />}
      </Screen>
    )
  }

  const bounds = wallet.topup
  const credit = wallet.creditLimitAmd ?? 0
  const low = wallet.billingEnabled && wallet.balanceAmd + credit < wallet.fees.baseAmd
  const tiers = bounds.bonus ?? []
  const typed = preset ?? (parseTopupAmount(amountText, bounds).ok ? Number(amountText.replace(/[\s,]/g, '')) : null)
  const typedBonus = typed !== null ? bonusFor(typed, tiers) : 0
  const entries = [...wallet.entries, ...more]

  async function topUp() {
    setTopupError(null)
    setOutcome(null)
    const parsed = preset !== null ? { ok: true as const, amountAmd: preset } : parseTopupAmount(amountText, bounds)
    if (!parsed.ok) {
      setTopupError(t(`wallet.amountErrors.${parsed.reason}`, { min: formatPrice(bounds.minAmd), max: formatPrice(bounds.maxAmd) }))
      return
    }
    setPaying(true)
    try {
      const bill = await api.createTopup(parsed.amountAmd)
      setWaiting({ paymentId: bill.paymentId, amountAmd: bill.amountAmd, since: Date.now() })
      await Linking.openURL(bill.payUrl)
    } catch (e) {
      setTopupError(t(`errors.${e instanceof ApiError ? e.code : 'NETWORK'}`))
    } finally {
      setPaying(false)
    }
  }

  async function loadMore() {
    const last = entries[entries.length - 1]
    if (!last) return
    setMoreBusy(true)
    try {
      const page = await api.walletEntries(last.id)
      setMore((current) => [...current, ...page])
      setMoreDone(page.length === 0)
    } catch {
      // the button stays; a retry is a tap away
    } finally {
      setMoreBusy(false)
    }
  }

  return (
    <Screen header={<Header title={t('wallet.title')} onBack={nav.pop} />} refreshing={false} onRefresh={() => void load()}>
      <Card tone="primary">
        <Text style={[type.caption, { color: 'rgba(255,255,255,0.75)', textTransform: 'uppercase' }]}>{t('wallet.balance')}</Text>
        <Text style={[type.display, { color: wallet.balanceAmd < 0 ? '#ffb4ab' : '#fff' }]}>{formatPrice(wallet.balanceAmd)}</Text>
        <Text style={[type.small, { color: 'rgba(255,255,255,0.85)' }]}>
          {!wallet.billingEnabled
            ? t('wallet.billingOff')
            : low
              ? t('wallet.lowHint', { fee: formatPrice(wallet.fees.baseAmd) })
              : t('wallet.covers', { count: String(ordersCovered(wallet.balanceAmd + credit, wallet.fees)) })}
        </Text>
        {credit > 0 ? (
          <Text style={[type.caption, { color: 'rgba(255,255,255,0.75)' }]}>{t('wallet.creditLimit', { amount: formatPrice(credit) })}</Text>
        ) : null}
      </Card>

      {outcome ? <Banner tone={outcome.tone}>{outcome.text}</Banner> : null}
      {waiting ? (
        <Banner tone="info" title={t('wallet.waitingTitle', { amount: formatPrice(waiting.amountAmd) })} action={{ label: t('wallet.checkNow'), onPress: () => void load() }}>
          {t('wallet.waitingBody')}
        </Banner>
      ) : null}
      {low ? <Banner tone="danger" title={t('wallet.lowTitle')}>{t('wallet.lowBody')}</Banner> : null}
      {error ? <Banner tone="danger">{error}</Banner> : null}

      <Section title={t('wallet.topupTitle')}>
        <Card>
          {wallet.topupAvailable ? (
            <>
              {tiers.length > 0 ? (
                <Note tone="success">
                  {tiers.map((tier) => t('wallet.bonusTier', { from: formatPrice(tier.fromAmd), percent: String(tier.percent) })).join(' · ')}
                </Note>
              ) : null}
              <Chips
                options={topupPresets(bounds).map((amount) => {
                  const bonus = bonusFor(amount, tiers)
                  return { value: String(amount), label: bonus > 0 ? `${formatPrice(amount)} +${formatPrice(bonus)}` : formatPrice(amount) }
                })}
                selected={preset !== null ? [String(preset)] : []}
                onToggle={(value) => {
                  setPreset(preset === Number(value) ? null : Number(value))
                  setAmountText('')
                }}
              />
              <Field
                label={t('wallet.otherAmount')}
                value={amountText}
                onChangeText={(text) => {
                  setAmountText(text)
                  setPreset(null)
                }}
                keyboardType="number-pad"
                suffix="֏"
                placeholder={String(bounds.minAmd)}
                error={topupError ?? undefined}
                hint={t('wallet.bounds', { min: formatPrice(bounds.minAmd), max: formatPrice(bounds.maxAmd) })}
              />
              {typedBonus > 0 && typed !== null ? (
                <Note tone="success">{t('wallet.youGet', { amount: formatPrice(typed + typedBonus), bonus: formatPrice(typedBonus) })}</Note>
              ) : null}
              <Button icon="wallet" label={t('wallet.payWithIdram')} busy={paying} onPress={() => void topUp()} />
              <Note>{t('wallet.idramNote')}</Note>
            </>
          ) : (
            <Note>{t('wallet.topupUnavailable')}</Note>
          )}
        </Card>
      </Section>

      <Section title={t('wallet.howTitle')}>
        <Card>
          {feeBands(wallet.fees).map((band) => (
            <Row
              key={band.fromAmd}
              label={band.fromAmd === 0 ? t('wallet.bandUpTo', { to: formatPrice(band.toAmd) }) : `${formatPrice(band.fromAmd)} – ${formatPrice(band.toAmd)}`}
              value={band.feeAmd === 0 ? t('wallet.free') : formatPrice(band.feeAmd)}
            />
          ))}
          <Row
            label={t('wallet.bandFrom', { from: formatPrice(wallet.fees.baseMaxPriceAmd + 1) })}
            value={wallet.fees.maxAmd > 0 ? t('wallet.percentCapped', { percent: String(wallet.fees.percent), max: formatPrice(wallet.fees.maxAmd) }) : `${wallet.fees.percent}%`}
          />
          <Note>
            {t('wallet.examples')}{' '}
            {feeExamples(wallet.fees)
              .map((e) => `${formatPrice(e.priceAmd)} → ${formatPrice(e.feeAmd)}`)
              .join(' · ')}
          </Note>
          <Note>• {t('wallet.ruleAccept')}</Note>
          <Note>• {t('wallet.ruleNegotiated', { fee: formatPrice(wallet.fees.baseAmd) })}</Note>
          {wallet.fees.freeMaxPriceAmd ? <Note>• {t('wallet.ruleFree', { price: formatPrice(wallet.fees.freeMaxPriceAmd), fee: formatPrice(wallet.fees.baseAmd) })}</Note> : null}
          <Note>• {t('wallet.ruleRefund')}</Note>
          <Note>• {t('wallet.ruleLow')}</Note>
          <Note>• {t('wallet.ruleReview')}</Note>
          <Note>• {t('wallet.ruleArrived')}</Note>
        </Card>
      </Section>

      <Section title={t('wallet.statement')}>
        {entries.length === 0 ? (
          <EmptyState icon="wallet" title={t('wallet.empty')} />
        ) : (
          <Card>
            {entries.map((entry, index) => (
              <View key={entry.id} style={{ flexDirection: 'row', gap: space.md, alignItems: 'center', paddingVertical: space.sm, borderTopWidth: index === 0 ? 0 : 1, borderTopColor: colors.border }}>
                <Icon name={ENTRY_ICON[entry.kind]} size={20} color={entry.amountAmd > 0 ? colors.success : colors.muted} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[type.bodyStrong, { color: colors.text }]}>
                    {entry.kind === 'ORDER_FEE_ADJUSTMENT' && entry.amountAmd > 0 ? t('wallet.kinds.ORDER_FEE_RETURNED') : t(`wallet.kinds.${entry.kind}`)}
                    {entry.orderNumber ? ` · № ${entry.orderNumber}` : ''}
                  </Text>
                  {entry.note && (entry.kind === 'ADMIN_CREDIT' || entry.kind === 'ADMIN_DEBIT') ? (
                    <Text style={[type.small, { color: colors.textSecondary }]}>{entry.note}</Text>
                  ) : null}
                  <Text style={[type.caption, { color: colors.textSecondary }]}>
                    {formatDateLong(entry.createdAt, language)}, {formatClockTime(new Date(entry.createdAt))}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[type.bodyStrong, { color: entry.amountAmd > 0 ? colors.success : colors.text }]}>
                    {entry.amountAmd > 0 ? '+' : '−'}
                    {formatPrice(Math.abs(entry.amountAmd))}
                  </Text>
                  <Text style={[type.caption, { color: colors.textSecondary }]}>{formatPrice(entry.balanceAfterAmd)}</Text>
                </View>
              </View>
            ))}
          </Card>
        )}
        {entries.length >= 30 && !moreDone ? <Button variant="outline" label={t('history.more')} busy={moreBusy} onPress={() => void loadMore()} /> : null}
      </Section>
    </Screen>
  )
}
