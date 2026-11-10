/**
 * Sign-up for drivers who are NOT on the website. The account is created as
 * "pending" — nothing is shown on the website, and the driver cannot sign in
 * until an admin approves. A website driver must not register here (the
 * server refuses their number and says to use the site password).
 */
import React, { useState } from 'react'
import { Linking, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native'
import * as Location from 'expo-location'
import { api, ApiError, PRIVACY_POLICY_URL } from '../api/client'
import { formatCoordinates, isWithinArmenia } from '../domain/coordinates'
import { EMPTY_REGISTRATION, REGISTRATION_VEHICLE_TYPES, validateRegistration, type RegistrationField, type RegistrationForm } from '../domain/registration'
import { useT } from '../i18n'
import { Button, Card, colors, Note, Screen } from '../ui/kit'

export function RegisterScreen({ onBack }: { onBack: () => void }) {
  const t = useT()
  const [form, setForm] = useState<RegistrationForm>(EMPTY_REGISTRATION)
  const [errors, setErrors] = useState<Partial<Record<RegistrationField, true>>>({})
  const [busy, setBusy] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [locating, setLocating] = useState(false)
  const [locateError, setLocateError] = useState<string | null>(null)

  /** "Use where I am now" — asks for location permission only when the driver taps it */
  async function useCurrentLocation() {
    setLocateError(null)
    setLocating(true)
    try {
      const permission = await Location.requestForegroundPermissionsAsync()
      if (!permission.granted) {
        setLocateError(t('register.baseNoPermission'))
        return
      }
      const here = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High })
      if (!isWithinArmenia(here.coords.latitude, here.coords.longitude)) {
        setLocateError(t('register.invalid.baseCoords'))
        return
      }
      set('baseCoords', formatCoordinates(here.coords))
    } catch {
      setLocateError(t('register.baseFailed'))
    } finally {
      setLocating(false)
    }
  }

  const set = <K extends keyof RegistrationForm>(key: K, value: RegistrationForm[K]) => setForm((f) => ({ ...f, [key]: value }))

  async function submit() {
    setServerError(null)
    const checked = validateRegistration(form)
    if (!checked.ok) {
      setErrors(checked.errors)
      return
    }
    setErrors({})
    setBusy(true)
    try {
      await api.register(checked.payload)
      setSent(true)
    } catch (e) {
      const code = e instanceof ApiError ? (e.status === 429 ? 'RATE_LIMITED' : e.code) : null
      const key = code ? `register.errors.${code}` : 'errors.NETWORK'
      const text = t(key)
      setServerError(text === key ? t('errors.UNKNOWN') : text)
    } finally {
      setBusy(false)
    }
  }

  if (sent) {
    return (
      <Screen title={t('register.sentTitle')}>
        <Card>
          <Note>{t('register.sentBody')}</Note>
          <Button label={t('register.backToLogin')} onPress={onBack} />
        </Card>
      </Screen>
    )
  }

  const field = (key: Exclude<RegistrationField, 'vehicleType'>, props: Partial<React.ComponentProps<typeof TextInput>> = {}) => (
    <View style={{ gap: 4 }}>
      <Text style={styles.label}>{t(`register.${key}`)}</Text>
      <TextInput
        style={[styles.input, errors[key] && styles.inputError]}
        value={form[key]}
        onChangeText={(v) => set(key, v)}
        accessibilityLabel={t(`register.${key}`)}
        {...props}
      />
      {errors[key] ? <Text style={styles.error}>{t(`register.invalid.${key}`)}</Text> : null}
    </View>
  )

  return (
    <Screen title={t('register.title')}>
        <Card>
          <Note>{t('register.intro')}</Note>
          <Note tone="warn">{t('register.alreadyOnSite')}</Note>
        </Card>
        <Card>
          {field('phone', { keyboardType: 'phone-pad', autoComplete: 'tel', textContentType: 'telephoneNumber' })}
          {field('driverName', { autoComplete: 'name', textContentType: 'name' })}
          {field('password', { secureTextEntry: true, autoComplete: 'new-password', textContentType: 'newPassword' })}
          {field('passwordRepeat', { secureTextEntry: true, autoComplete: 'new-password', textContentType: 'newPassword' })}
        </Card>
        <Card>
          <Text style={styles.label}>{t('register.vehicleType')}</Text>
          {REGISTRATION_VEHICLE_TYPES.map((type) => (
            <Pressable
              key={type}
              accessibilityRole="radio"
              accessibilityState={{ selected: form.vehicleType === type }}
              style={[styles.choice, form.vehicleType === type && styles.choiceSelected]}
              onPress={() => set('vehicleType', type)}
            >
              <Text>{t(`register.vehicleTypes.${type}`)}</Text>
            </Pressable>
          ))}
          {errors.vehicleType ? <Text style={styles.error}>{t('register.invalid.vehicleType')}</Text> : null}
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>{t('register.wheelSkates')}</Text>
            <Switch value={form.wheelSkates} onValueChange={(v) => set('wheelSkates', v)} accessibilityLabel={t('register.wheelSkates')} />
          </View>
          <Note>{t('register.wheelSkatesHint')}</Note>
          {field('vehicleDescription')}
        </Card>
        <Card>
          <Text style={{ fontWeight: '600', color: colors.text }}>{t('register.baseTitle')}</Text>
          <Note>{t('register.baseHint')}</Note>
          {field('baseCoords', { keyboardType: 'numbers-and-punctuation', placeholder: '40.177200, 44.512600', autoCorrect: false })}
          <Button variant="outline" label={locating ? t('common.loading') : t('register.baseUseCurrent')} busy={locating} onPress={() => void useCurrentLocation()} />
          {locateError ? <Text style={styles.error}>{locateError}</Text> : null}
        </Card>
        {serverError ? <Note tone="danger">{serverError}</Note> : null}
        <Note>{t('privacy.registerNote')}</Note>
        <Button variant="outline" label={t('privacy.policy')} onPress={() => void Linking.openURL(PRIVACY_POLICY_URL)} />
        <Button label={t('register.submit')} onPress={() => void submit()} busy={busy} />
        <Button label={t('register.backToLogin')} onPress={onBack} variant="outline" />
    </Screen>
  )
}

const styles = StyleSheet.create({
  label: { color: colors.muted, fontSize: 14 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, fontSize: 17, color: colors.text, backgroundColor: '#fff' },
  inputError: { borderColor: colors.danger },
  error: { color: colors.danger, fontSize: 13 },
  choice: { padding: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: '#fff' },
  choiceSelected: { borderColor: colors.primary, backgroundColor: '#e8eef6' },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  switchLabel: { flex: 1, color: colors.text, fontSize: 15 },
})
