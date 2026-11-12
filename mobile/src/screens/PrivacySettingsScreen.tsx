/**
 * Location consent and account deletion — the store-mandated privacy controls
 * (moved here from the old Settings screen, unchanged in behaviour):
 *  - withdrawing location consent (App Store 5.1.1(ii) "easy way to withdraw");
 *  - deleting the account IN the app (App Store 5.1.1(v), Play account
 *    deletion policy) — a real deletion, not deactivation; the password is
 *    asked again. Both are refused by the server during an active order or a
 *    pending offer (ACTIVE_ORDER_IN_PROGRESS).
 * What deletion removes is the same text as /driver-app/privacy § 6.
 */
import { useState } from 'react'
import { Linking } from 'react-native'
import { ApiError, DELETE_ACCOUNT_URL } from '../api/client'
import { useT } from '../i18n'
import { useNav } from '../navigation/Navigator'
import { useApp } from '../state/AppState'
import { Badge, Banner, Button, Card, Field, Header, Note, Screen, Section } from '../ui/kit'

export function PrivacySettingsScreen({ onConsentWithdrawn }: { onConsentWithdrawn: () => void }) {
  const t = useT()
  const app = useApp()
  const nav = useNav()
  const [withdrawing, setWithdrawing] = useState(false)
  const [withdrawMessage, setWithdrawMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteArmed, setDeleteArmed] = useState(false)
  const [password, setPassword] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const errorText = (e: unknown) => t(`errors.${e instanceof ApiError ? e.code : 'NETWORK'}`)
  const hasConsent = (app.snapshot?.trackingConsentVersion ?? 0) >= 1

  async function withdraw() {
    setWithdrawing(true)
    setWithdrawMessage(null)
    try {
      await app.withdrawConsent()
      // The driver just said no: the disclosure screen is not put in front of
      // him again this session (it stays one tap away on Home).
      onConsentWithdrawn()
      setWithdrawMessage({ tone: 'success', text: t('privacy.withdrawn') })
    } catch (e) {
      setWithdrawMessage({ tone: 'danger', text: errorText(e) })
    } finally {
      setWithdrawing(false)
    }
  }

  async function remove() {
    if (!deleteArmed) {
      setDeleteArmed(true)
      return
    }
    setDeleting(true)
    setDeleteError(null)
    try {
      await app.deleteAccount(password)
      // Signed out: the app is back on the login screen.
    } catch (e) {
      setDeleteError(errorText(e))
      setDeleteArmed(false)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Screen header={<Header title={t('more.locationAndData')} onBack={nav.pop} />}>
      <Section title={t('privacy.locationConsent')}>
        <Card>
          <Badge label={hasConsent ? t('privacy.consentOn') : t('privacy.consentOff')} tone={hasConsent ? 'success' : 'neutral'} dot />
          {hasConsent ? (
            <>
              <Note>{t('privacy.withdrawNote')}</Note>
              <Button variant="outline" label={t('privacy.withdraw')} busy={withdrawing} onPress={() => void withdraw()} />
            </>
          ) : (
            <Button label={t('home.enableLocation')} onPress={() => nav.push('permissions')} />
          )}
          {withdrawMessage ? <Banner tone={withdrawMessage.tone}>{withdrawMessage.text}</Banner> : null}
          <Button variant="ghost" size="sm" label={t('privacy.systemSettings')} onPress={() => void Linking.openSettings()} />
        </Card>
      </Section>

      <Section title={t('privacy.deleteTitle')}>
        <Card>
          {!deleteOpen ? (
            <Button variant="outline" icon="trash" label={t('privacy.deleteAccount')} onPress={() => setDeleteOpen(true)} />
          ) : (
            <>
              <Note>{t('privacy.deleteWhat')}</Note>
              <Note>{t('privacy.deleteKept')}</Note>
              <Note>{t('privacy.deleteSiteDriver')}</Note>
              <Banner tone="warn">{t('privacy.deleteIrreversible')}</Banner>
              <Field
                label={t('privacy.deletePassword')}
                value={password}
                onChangeText={(v) => {
                  setPassword(v)
                  setDeleteArmed(false)
                }}
                secure
                autoComplete="password"
                textContentType="password"
              />
              {deleteError ? <Banner tone="danger">{deleteError}</Banner> : null}
              <Button variant="danger" label={deleteArmed ? t('privacy.deleteConfirm') : t('privacy.deleteAccount')} disabled={password.length === 0} busy={deleting} onPress={() => void remove()} />
              <Button
                variant="outline"
                label={t('common.cancel')}
                onPress={() => {
                  setDeleteOpen(false)
                  setDeleteArmed(false)
                  setPassword('')
                  setDeleteError(null)
                }}
              />
              <Button variant="ghost" size="sm" label={t('privacy.deleteMore')} onPress={() => void Linking.openURL(DELETE_ACCOUNT_URL)} />
            </>
          )}
        </Card>
      </Section>
    </Screen>
  )
}
