/**
 * Changes the website password — which is also this app's password for a
 * driver with a website profile (one account). The website's rule: the
 * current password is always asked, the new one is 8–72 characters. Other
 * signed-in devices stay signed in (the website has no session list either).
 */
import { useState } from 'react'
import { api, ApiError, NetworkError } from '../api/client'
import { useT } from '../i18n'
import { useNav } from '../navigation/Navigator'
import { Banner, Button, Field, Header, Note, Screen } from '../ui/kit'

export function ChangePasswordScreen() {
  const t = useT()
  const nav = useNav()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [repeat, setRepeat] = useState('')
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)
  const errors = {
    next: next.length < 8 || next.length > 72 ? t('register.invalid.password') : '',
    repeat: repeat !== next ? t('register.invalid.passwordRepeat') : '',
  }

  async function save() {
    setTried(true)
    setResult(null)
    if (errors.next || errors.repeat || !current) return
    setBusy(true)
    try {
      await api.changePassword({ currentPassword: current, newPassword: next })
      setResult({ ok: true, text: t('password.changed') })
      setCurrent('')
      setNext('')
      setRepeat('')
      setTried(false)
    } catch (e) {
      setResult({ ok: false, text: e instanceof ApiError ? e.message : t(e instanceof NetworkError ? 'errors.NETWORK' : 'errors.UNKNOWN') })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen header={<Header title={t('more.changePassword')} onBack={nav.pop} />} footer={<Button icon="check" label={t('common.save')} busy={busy} onPress={() => void save()} />}>
      <Note>{t('password.note')}</Note>
      <Field label={t('password.current')} value={current} onChangeText={setCurrent} secure autoComplete="password" textContentType="password" error={tried && !current ? t('password.currentRequired') : undefined} />
      <Field label={t('password.new')} value={next} onChangeText={setNext} secure autoComplete="new-password" textContentType="newPassword" error={tried ? errors.next : undefined} hint={t('register.passwordHint')} />
      <Field label={t('register.passwordRepeat')} value={repeat} onChangeText={setRepeat} secure autoComplete="new-password" textContentType="newPassword" error={tried ? errors.repeat : undefined} />
      {result ? <Banner tone={result.ok ? 'success' : 'danger'}>{result.text}</Banner> : null}
    </Screen>
  )
}
