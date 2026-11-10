/**
 * Settings — also where the store-mandated privacy controls live:
 *  - the privacy policy link (App Store 5.1.1(i), Play User Data policy);
 *  - withdrawing location consent (App Store 5.1.1(ii) "easy way to withdraw");
 *  - deleting the account IN the app (App Store 5.1.1(v), Play account
 *    deletion policy) — a real deletion, not deactivation; the password is
 *    asked again (allowed re-authentication). Both are refused by the server
 *    during an active order / pending offer (ACTIVE_ORDER_IN_PROGRESS).
 * What deletion removes is the same text as the website's
 * /driver-app/delete-account and /driver-app/privacy § 6.
 */
import Constants from 'expo-constants'
import { useContext, useState } from 'react'
import { Linking, StyleSheet, TextInput } from 'react-native'
import { ApiError, DELETE_ACCOUNT_URL, PRIVACY_POLICY_URL } from '../api/client'
import { LanguageContext, useT } from '../i18n'
import { setLanguage as persistLanguage } from '../auth/session'
import { useApp } from '../state/AppState'
import { Button, Card, colors, Note, Row, Screen } from '../ui/kit'

export function SettingsScreen({ onBack, onConsentWithdrawn }: { onBack: () => void; onConsentWithdrawn: () => void }) {
  const t = useT()
  const app = useApp()
  const { language, setLanguage } = useContext(LanguageContext)
  const [withdrawing, setWithdrawing] = useState(false)
  const [withdrawMessage, setWithdrawMessage] = useState<{ tone: 'muted' | 'danger'; text: string } | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteArmed, setDeleteArmed] = useState(false)
  const [password, setPassword] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const choose = (l: 'hy' | 'ru') => {
    setLanguage(l)
    void persistLanguage(l)
  }
  const errorText = (e: unknown) => t(`errors.${e instanceof ApiError ? e.code : 'NETWORK'}`)
  const hasConsent = (app.snapshot?.trackingConsentVersion ?? 0) >= 1

  async function withdraw() {
    setWithdrawing(true)
    setWithdrawMessage(null)
    try {
      await app.withdrawConsent()
      // The driver just said no: do not put the disclosure screen in front of
      // him again this session (it stays one tap away on Home).
      onConsentWithdrawn()
      setWithdrawMessage({ tone: 'muted', text: t('privacy.withdrawn') })
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
    <Screen title={t('settings.title')}>
      <Card>
        <Row label={t('settings.language')} value={language === 'hy' ? 'Հայերեն' : 'Русский'} />
        <Button variant={language === 'hy' ? 'primary' : 'outline'} label="Հայերեն" onPress={() => choose('hy')} />
        <Button variant={language === 'ru' ? 'primary' : 'outline'} label="Русский" onPress={() => choose('ru')} />
      </Card>
      <Card>
        <Row label={t('privacy.title')} value="" />
        <Button variant="outline" label={t('privacy.policy')} onPress={() => void Linking.openURL(PRIVACY_POLICY_URL)} />
        <Row label={t('privacy.locationConsent')} value={hasConsent ? t('privacy.consentOn') : t('privacy.consentOff')} tone={hasConsent ? 'ok' : undefined} />
        {hasConsent ? (
          <>
            <Note>{t('privacy.withdrawNote')}</Note>
            <Button variant="outline" label={t('privacy.withdraw')} busy={withdrawing} onPress={() => void withdraw()} />
          </>
        ) : null}
        {withdrawMessage ? <Note tone={withdrawMessage.tone}>{withdrawMessage.text}</Note> : null}
        <Button variant="outline" label={t('privacy.systemSettings')} onPress={() => void Linking.openSettings()} />
      </Card>
      <Card>
        <Note>{t('settings.logoutNote')}</Note>
        <Button variant="danger" label={t('settings.logout')} onPress={() => void app.logout()} />
        <Row label={t('settings.version')} value={Constants.expoConfig?.version ?? '—'} />
      </Card>
      <Card>
        <Row label={t('privacy.deleteTitle')} value="" />
        {!deleteOpen ? (
          <Button variant="outline" label={t('privacy.deleteAccount')} onPress={() => setDeleteOpen(true)} />
        ) : (
          <>
            <Note>{t('privacy.deleteWhat')}</Note>
            <Note>{t('privacy.deleteKept')}</Note>
            <Note>{t('privacy.deleteSiteDriver')}</Note>
            <Note tone="warn">{t('privacy.deleteIrreversible')}</Note>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={(v) => {
                setPassword(v)
                setDeleteArmed(false)
              }}
              secureTextEntry
              autoComplete="password"
              textContentType="password"
              placeholder={t('privacy.deletePassword')}
              accessibilityLabel={t('privacy.deletePassword')}
            />
            {deleteError ? <Note tone="danger">{deleteError}</Note> : null}
            <Button
              variant="danger"
              label={deleteArmed ? t('privacy.deleteConfirm') : t('privacy.deleteAccount')}
              disabled={password.length === 0}
              busy={deleting}
              onPress={() => void remove()}
            />
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
            <Button variant="outline" label={t('privacy.deleteMore')} onPress={() => void Linking.openURL(DELETE_ACCOUNT_URL)} />
          </>
        )}
      </Card>
      <Button variant="outline" label={t('common.back')} onPress={onBack} />
    </Screen>
  )
}

const styles = StyleSheet.create({
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, fontSize: 17, color: colors.text, backgroundColor: '#fff' },
})
