/**
 * The driver app's privacy policy, IN the app — the same text as
 * evakuators.am/driver-app/privacy, because both render
 * `frontend/constants/driverAppPrivacyContent.ts` (the stores require the
 * policy to be reachable from inside the app; one text means the app and the
 * store listing can never disagree).
 */
import { Linking, Text, View } from 'react-native'
import { PRIVACY_DATA_CONTROLLER } from '~/constants/privacyConsent'
import { DRIVER_APP_PRIVACY_EFFECTIVE_DATE, DRIVER_APP_PRIVACY_VERSION } from '~/constants/driverAppPrivacy'
import { DRIVER_APP_PRIVACY_INTRO, DRIVER_APP_PRIVACY_SECTIONS, DRIVER_APP_PRIVACY_TITLE, type PrivacyInline } from '~/constants/driverAppPrivacyContent'
import { PRIVACY_POLICY_URL, websiteUrl } from '../api/client'
import { useT } from '../i18n'
import { Button, Card, Header, Screen } from '../ui/kit'
import { colors, space, type } from '../ui/theme'

function Inline({ pieces }: { pieces: PrivacyInline[] }) {
  return (
    <>
      {pieces.map((piece, i) =>
        typeof piece === 'string' ? (
          piece
        ) : 'strong' in piece ? (
          <Text key={i} style={{ fontWeight: '700' }}>{piece.strong}</Text>
        ) : (
          <Text key={i} style={{ color: colors.primaryLight, textDecorationLine: 'underline' }} onPress={() => void Linking.openURL(piece.to.startsWith('/') ? websiteUrl(piece.to) : piece.to)}>
            {piece.link}
          </Text>
        ),
      )}
    </>
  )
}

export function PrivacyPolicyScreen({ onBack }: { onBack: () => void }) {
  const t = useT()
  const body = [type.body, { color: colors.text }]
  return (
    <Screen header={<Header title={t('privacy.policy')} onBack={onBack} />}>
      <View style={{ gap: space.xs }}>
        <Text style={[type.title, { color: colors.text }]}>{DRIVER_APP_PRIVACY_TITLE}</Text>
        <Text style={[type.small, { color: colors.textSecondary }]}>
          {DRIVER_APP_PRIVACY_EFFECTIVE_DATE} · v{DRIVER_APP_PRIVACY_VERSION} · {PRIVACY_DATA_CONTROLLER}
        </Text>
      </View>
      <Text style={body}>
        <Inline pieces={DRIVER_APP_PRIVACY_INTRO} />
      </Text>
      {DRIVER_APP_PRIVACY_SECTIONS.map((section) => (
        <Card key={section.id}>
          <Text style={[type.heading, { color: colors.primary }]} accessibilityRole="header">{section.title}</Text>
          {section.blocks.map((block, b) =>
            'p' in block ? (
              <Text key={b} style={body}>
                <Inline pieces={block.p} />
              </Text>
            ) : (
              <View key={b} style={{ gap: space.sm }}>
                {block.ul.map((item, i) => (
                  <View key={i} style={{ flexDirection: 'row', gap: space.sm }}>
                    <Text style={[body, { color: colors.accentDark }]}>•</Text>
                    <Text style={[body, { flex: 1 }]}>
                      <Inline pieces={item} />
                    </Text>
                  </View>
                ))}
              </View>
            ),
          )}
        </Card>
      ))}
      <Button variant="outline" icon="globe" label={t('privacy.openOnSite')} onPress={() => void Linking.openURL(PRIVACY_POLICY_URL)} />
    </Screen>
  )
}
