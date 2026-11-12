/**
 * Sign-in. One account for the website and the app: a driver with a website
 * profile signs in with the SAME phone and password; one who signed up in the
 * app uses the password chosen there. There is no self-service reset — a
 * forgotten password is reset by an administrator (docs/auth-and-security.md
 * § "The admin reset"), so «Մոռացե՞լ եք» says so and offers the call.
 */
import { useContext, useState } from 'react'
import { Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native'
import { CONTACT_PHONE } from '~/constants/site'
import { getPhoneHref, getWhatsAppUrl } from '~/utils/formatPhone'
import { ApiError, NetworkError } from '../api/client'
import { loginErrorKey } from '../domain/registration'
import { PhoneField } from '../forms/fields'
import { LanguageContext, useT, type Language } from '../i18n'
import { setLanguage as persistLanguage } from '../auth/session'
import { useApp } from '../state/AppState'
import { Banner, Button, Card, Field, Note, Screen, Sheet } from '../ui/kit'
import { colors, radius, space, type } from '../ui/theme'

export function LoginScreen({ onRegister, onOpenPrivacy }: { onRegister: () => void; onOpenPrivacy: () => void }) {
  const t = useT()
  const app = useApp()
  const { language, setLanguage } = useContext(LanguageContext)
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<{ text: string; pending: boolean } | null>(null)
  const [forgot, setForgot] = useState(false)

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      await app.login(phone, password)
    } catch (e) {
      const key = e instanceof ApiError ? loginErrorKey(e.status, e.code) : e instanceof NetworkError ? loginErrorKey(null, null) : 'errors.UNKNOWN'
      // An unexpected failure carries its cause, so a screenshot is enough to find it
      const detail =
        key !== 'errors.UNKNOWN' ? '' : e instanceof ApiError ? ` (HTTP ${e.status} ${e.code})` : e instanceof Error && e.message ? ` (${e.message})` : ''
      setError({ text: t(key) + detail, pending: e instanceof ApiError && e.code === 'APP_ACCOUNT_PENDING' })
    } finally {
      setBusy(false)
    }
  }

  const choose = (l: Language) => {
    setLanguage(l)
    void persistLanguage(l)
  }

  return (
    <Screen contentStyle={{ padding: 0, gap: 0 }}>
      <View style={styles.hero}>
        <View style={styles.languages}>
          {(['hy', 'ru'] as const).map((l) => (
            <Pressable key={l} onPress={() => choose(l)} accessibilityRole="button" style={[styles.lang, language === l && styles.langOn]}>
              <Text style={[type.caption, { color: language === l ? colors.primaryDark : '#fff' }]}>{l === 'hy' ? 'ՀԱՅ' : 'РУС'}</Text>
            </Pressable>
          ))}
        </View>
        <Image source={require('../../assets/ui/logo-dark.png')} style={styles.logo} resizeMode="contain" accessibilityLabel="Evakuators.am" />
        <Text style={styles.tagline}>{t('login.tagline')}</Text>
      </View>
      <View style={styles.body}>
        <Card style={styles.card}>
          <Text style={[type.title, { color: colors.text }]}>{t('login.title')}</Text>
          <PhoneField label={t('login.phone')} value={phone} onChange={setPhone} />
          <Field label={t('login.password')} value={password} onChangeText={setPassword} secure autoComplete="password" textContentType="password" returnKeyType="go" onSubmitEditing={() => void submit()} />
          {error ? <Banner tone={error.pending ? 'info' : 'danger'}>{error.text}</Banner> : null}
          <Button label={t('login.submit')} onPress={() => void submit()} busy={busy} disabled={password.length === 0 || phone.length < 12} />
          <Pressable onPress={() => setForgot(true)} hitSlop={8} accessibilityRole="button" style={{ alignSelf: 'center' }}>
            <Text style={[type.label, { color: colors.primaryLight }]}>{t('login.forgot')}</Text>
          </Pressable>
        </Card>
        <Note>{t('login.hint')}</Note>
        <View style={styles.divider}>
          <View style={styles.rule} />
          <Text style={[type.caption, { color: colors.muted }]}>{t('login.newHere')}</Text>
          <View style={styles.rule} />
        </View>
        <Button variant="accent" icon="truck" label={t('login.noAccount')} onPress={onRegister} />
        <Note>{t('login.registerNote')}</Note>
        <Pressable onPress={onOpenPrivacy} accessibilityRole="link" style={{ alignSelf: 'center', paddingVertical: space.sm }}>
          <Text style={[type.small, { color: colors.textSecondary, textDecorationLine: 'underline' }]}>{t('privacy.policy')}</Text>
        </Pressable>
      </View>

      <Sheet visible={forgot} onClose={() => setForgot(false)} title={t('login.forgotTitle')}>
        <Text style={[type.body, { color: colors.text }]}>{t('login.forgotBody')}</Text>
        <Button icon="phone" label={`${t('common.call')} ${CONTACT_PHONE}`} onPress={() => void Linking.openURL(getPhoneHref(CONTACT_PHONE))} />
        <Button variant="outline" label="WhatsApp" onPress={() => void Linking.openURL(getWhatsAppUrl(CONTACT_PHONE))} />
      </Sheet>
    </Screen>
  )
}

const styles = StyleSheet.create({
  hero: { backgroundColor: colors.primary, paddingTop: space.xl, paddingBottom: 72, paddingHorizontal: space.xl, alignItems: 'center', gap: space.sm },
  languages: { alignSelf: 'flex-end', flexDirection: 'row', gap: 6 },
  lang: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.full, borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)' },
  langOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  logo: { width: '78%', height: 120, marginTop: space.sm },
  tagline: { ...type.body, color: 'rgba(255,255,255,0.85)', textAlign: 'center' },
  body: { padding: space.lg, gap: space.lg, marginTop: -56 },
  card: { gap: space.md, padding: space.xl },
  divider: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  rule: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.borderStrong },
})
