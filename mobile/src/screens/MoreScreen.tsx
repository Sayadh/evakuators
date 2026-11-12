/** More — account, privacy, help and the app itself, as one grouped menu */
import Constants from 'expo-constants'
import { useContext } from 'react'
import { Linking, Pressable, Text, View } from 'react-native'
import { CONTACT_PHONE } from '~/constants/site'
import { getPhoneHref, getTelegramPhoneUrl, getWhatsAppUrl } from '~/utils/formatPhone'
import { formatPrice } from '~/utils/formatPrice'
import { setLanguage as persistLanguage } from '../auth/session'
import { LanguageContext, useT, type Language } from '../i18n'
import { useNav } from '../navigation/Navigator'
import { useApp } from '../state/AppState'
import { useProfile } from '../state/ProfileState'
import { ListGroup, ListItem, Screen, Section } from '../ui/kit'
import { colors, radius, space, type } from '../ui/theme'

export function MoreScreen() {
  const t = useT()
  const app = useApp()
  const nav = useNav()
  const { profile } = useProfile()
  const { language, setLanguage } = useContext(LanguageContext)
  const choose = (l: Language) => {
    setLanguage(l)
    void persistLanguage(l)
  }
  const siteDriver = profile?.kind === 'SITE_LINKED'

  return (
    <Screen title={t('tabs.more')}>
      <Section title={t('more.account')}>
        <ListGroup>
          <ListItem
            icon="wallet"
            title={t('wallet.title')}
            subtitle={t('wallet.menuSubtitle')}
            value={app.snapshot?.wallet ? formatPrice(app.snapshot.wallet.balanceAmd) : undefined}
            onPress={() => nav.push('wallet')}
          />
          {siteDriver ? <ListItem icon="lock" title={t('more.changePassword')} onPress={() => nav.push('changePassword')} /> : null}
          <ListItem
            icon="language"
            title={t('settings.language')}
            last
            right={
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {(['hy', 'ru'] as const).map((l) => (
                  <Pressable
                    key={l}
                    onPress={() => choose(l)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: language === l }}
                    style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.full, backgroundColor: language === l ? colors.primary : colors.bg }}
                  >
                    <Text style={[type.caption, { color: language === l ? '#fff' : colors.text }]}>{l === 'hy' ? 'Հայերեն' : 'Русский'}</Text>
                  </Pressable>
                ))}
              </View>
            }
          />
        </ListGroup>
      </Section>

      <Section title={t('privacy.title')}>
        <ListGroup>
          <ListItem icon="shield" title={t('privacy.policy')} subtitle={t('more.policySubtitle')} onPress={() => nav.push('privacyPolicy')} />
          <ListItem icon="pin" title={t('more.locationAndData')} subtitle={t('more.locationAndDataSubtitle')} onPress={() => nav.push('privacySettings')} />
          <ListItem icon="sliders" title={t('more.permissions')} onPress={() => nav.push('permissions')} />
          <ListItem icon="alert" title={t('alerts.title')} subtitle={t('alerts.menuSubtitle')} onPress={() => nav.push('alertsSetup')} />
          <ListItem icon="bell" title={t('sound.title')} subtitle={t('sound.menuSubtitle')} onPress={() => nav.push('alertSound')} last />
        </ListGroup>
      </Section>

      <Section title={t('more.help')}>
        <ListGroup>
          <ListItem icon="phone" title={t('common.call')} value={CONTACT_PHONE} onPress={() => void Linking.openURL(getPhoneHref(CONTACT_PHONE))} />
          <ListItem icon="globe" title="WhatsApp" onPress={() => void Linking.openURL(getWhatsAppUrl(CONTACT_PHONE))} />
          <ListItem icon="globe" title="Telegram" onPress={() => void Linking.openURL(getTelegramPhoneUrl(CONTACT_PHONE))} last />
        </ListGroup>
      </Section>

      <ListGroup>
        <ListItem icon="logout" title={t('settings.logout')} subtitle={t('settings.logoutNote')} danger onPress={() => void app.logout()} last />
      </ListGroup>
      <Text style={[type.small, { color: colors.muted, textAlign: 'center', marginTop: space.sm }]}>
        Evakuators Driver · {t('settings.version')} {Constants.expoConfig?.version ?? '—'}
      </Text>
    </Screen>
  )
}
