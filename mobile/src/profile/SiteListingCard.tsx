/**
 * "Website" block of the profile (2026-11-12). An app driver is NOT on
 * evakuators.am until they ask: here they ask, see the review, read a refusal,
 * and — once published — open their page and connect Telegram (optional; it
 * never changes the password they chose).
 */
import { useState } from 'react'
import { Linking, Text, View } from 'react-native'
import { api, ApiError } from '../api/client'
import type { SiteListingView } from '../api/types'
import { useT } from '../i18n'
import { Badge, Banner, Button, Card, Field, Section } from '../ui/kit'
import { colors, space, type } from '../ui/theme'

export function SiteListingCard({ site, onChanged }: { site: SiteListingView; onChanged: () => Promise<void> | void }) {
  const t = useT()
  const [asking, setAsking] = useState(false)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('errors.NETWORK'))
    } finally {
      setBusy(false)
    }
  }

  const sendRequest = () =>
    run(async () => {
      await api.requestSiteListing(note.trim() || undefined)
      setAsking(false)
      setNote('')
      await onChanged()
    })

  const connectTelegram = () =>
    run(async () => {
      const link = await api.telegramLink()
      if (link.url) await Linking.openURL(link.url)
      else await onChanged()
    })

  const badge = {
    LISTED: { label: t('site.state.LISTED'), tone: 'success' as const },
    APP_ONLY: { label: t('site.state.APP_ONLY'), tone: 'neutral' as const },
    REQUESTED: { label: t('site.state.REQUESTED'), tone: 'accent' as const },
    REJECTED: { label: t('site.state.REJECTED'), tone: 'danger' as const },
    DEACTIVATED: { label: t('site.state.DEACTIVATED'), tone: 'warn' as const },
  }[site.state]

  return (
    <Section title={t('site.title')}>
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm }}>
          <Text style={[type.body, { color: colors.text, fontWeight: '600', flex: 1 }]}>evakuators.am</Text>
          <Badge label={badge.label} tone={badge.tone} dot />
        </View>

        {site.state === 'LISTED' ? (
          <View style={{ gap: space.sm }}>
            <Text style={[type.small, { color: colors.textSecondary }]}>{t('site.listedBody')}</Text>
            {site.url ? <Button icon="globe" variant="outline" label={t('site.viewPage')} onPress={() => void Linking.openURL(site.url!)} /> : null}
            {site.telegramLinked ? (
              <Badge label={t('site.telegramLinked')} tone="success" dot />
            ) : site.telegramAvailable ? (
              <>
                <Text style={[type.small, { color: colors.textSecondary }]}>{t('site.telegramHint')}</Text>
                <Button icon="bell" variant="outline" label={t('site.telegramConnect')} busy={busy} onPress={() => void connectTelegram()} />
              </>
            ) : null}
          </View>
        ) : null}

        {site.state === 'APP_ONLY' || site.state === 'REJECTED' ? (
          <View style={{ gap: space.sm }}>
            {site.state === 'REJECTED' ? (
              <Banner tone="danger" title={t('site.rejectedTitle')}>{site.rejectionReason ?? ''}</Banner>
            ) : null}
            <Text style={[type.small, { color: colors.textSecondary }]}>{t('site.appOnlyBody')}</Text>
            {asking ? (
              <>
                <Field label={t('site.noteLabel')} placeholder={t('site.notePlaceholder')} value={note} onChangeText={setNote} multiline maxLength={500} />
                <Button icon="check" label={t('site.send')} busy={busy} onPress={() => void sendRequest()} />
                <Button variant="ghost" label={t('common.cancel')} disabled={busy} onPress={() => setAsking(false)} />
              </>
            ) : (
              <Button icon="globe" label={t(site.state === 'REJECTED' ? 'site.askAgain' : 'site.ask')} onPress={() => setAsking(true)} />
            )}
          </View>
        ) : null}

        {site.state === 'REQUESTED' ? (
          <Text style={[type.small, { color: colors.textSecondary }]}>{t('site.requestedBody')}</Text>
        ) : null}

        {site.state === 'DEACTIVATED' ? (
          <Text style={[type.small, { color: colors.textSecondary }]}>{t('site.deactivatedBody')}</Text>
        ) : null}

        {error ? <Banner tone="danger">{error}</Banner> : null}
      </Card>
    </Section>
  )
}
