import Constants from 'expo-constants'
import React, { useContext } from 'react'
import { LanguageContext, useT } from '../i18n'
import { setLanguage as persistLanguage } from '../auth/session'
import { useApp } from '../state/AppState'
import { Button, Card, Note, Row, Screen } from '../ui/kit'

export function SettingsScreen({ onBack }: { onBack: () => void }) {
  const t = useT()
  const app = useApp()
  const { language, setLanguage } = useContext(LanguageContext)
  const choose = (l: 'hy' | 'ru') => {
    setLanguage(l)
    void persistLanguage(l)
  }
  return (
    <Screen title={t('settings.title')}>
      <Card>
        <Row label={t('settings.language')} value={language === 'hy' ? 'Հայերեն' : 'Русский'} />
        <Button variant={language === 'hy' ? 'primary' : 'outline'} label="Հայերեն" onPress={() => choose('hy')} />
        <Button variant={language === 'ru' ? 'primary' : 'outline'} label="Русский" onPress={() => choose('ru')} />
      </Card>
      <Card>
        <Note>{t('settings.logoutNote')}</Note>
        <Button variant="danger" label={t('settings.logout')} onPress={() => void app.logout()} />
        <Row label={t('settings.version')} value={Constants.expoConfig?.version ?? '—'} />
      </Card>
      <Button variant="outline" label={t('common.back')} onPress={onBack} />
    </Screen>
  )
}
