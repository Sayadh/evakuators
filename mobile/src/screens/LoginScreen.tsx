import React, { useState } from 'react'
import { Text, TextInput, StyleSheet } from 'react-native'
import { ApiError } from '../api/client'
import { useT } from '../i18n'
import { useApp } from '../state/AppState'
import { Button, Card, colors, Note, Screen } from '../ui/kit'

export function LoginScreen() {
  const t = useT()
  const app = useApp()
  const [phone, setPhone] = useState('+374')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      await app.login(phone.replace(/[\s-]/g, ''), password)
    } catch (e) {
      setError(e instanceof ApiError && e.status === 403 ? t('login.deactivated') : e instanceof ApiError ? t('login.invalid') : t('errors.NETWORK'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen title={t('login.title')}>
      <Card>
        <Text style={styles.label}>{t('login.phone')}</Text>
        <TextInput style={styles.input} value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" textContentType="telephoneNumber" />
        <Text style={styles.label}>{t('login.password')}</Text>
        <TextInput style={styles.input} value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" textContentType="password" />
        {error ? <Note tone="danger">{error}</Note> : null}
        <Button label={t('login.submit')} onPress={submit} busy={busy} disabled={password.length === 0} />
        <Note>{t('login.hint')}</Note>
        <Note>{t('login.otherDevice')}</Note>
      </Card>
    </Screen>
  )
}

const styles = StyleSheet.create({
  label: { color: colors.muted, fontSize: 14 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, fontSize: 17, color: colors.text, backgroundColor: '#fff' },
})
