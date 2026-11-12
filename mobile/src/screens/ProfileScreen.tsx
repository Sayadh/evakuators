/**
 * Profile — the driver's own page: every field he registered with
 * (profile/ProfileDetails), section by section, each editable. Edits are moderated (the server queues a diff), so
 * the screen always says what is waiting and what the last verdict was.
 *
 * A driver whose sign-up is still in review cannot be here (they cannot sign
 * in until approved); an older app-only account sees its data read-only.
 */
import { Image, Linking, StyleSheet, Text, View } from 'react-native'
import { useState } from 'react'
import { profileFieldLabel } from '~/utils/profileChangeLabels'
import { api, ApiError, websiteUrl, mediaUrl } from '../api/client'
import { useLanguage, useT } from '../i18n'
import { useNav } from '../navigation/Navigator'
import { ProfileDetails } from '../profile/ProfileDetails'
import { catalog } from '../shared/site'
import { useProfile } from '../state/ProfileState'
import { Badge, Banner, Button, Card, EmptyState, Loading, Row, Screen } from '../ui/kit'
import { colors, radius, shadow, space, type } from '../ui/theme'
import { Icon } from '../ui/Icon'
import { SiteListingCard } from '../profile/SiteListingCard'

export function ProfileScreen() {
  const t = useT()
  const language = useLanguage()
  const nav = useNav()
  const { profile, loading, error, reload } = useProfile()
  const [withdrawing, setWithdrawing] = useState(false)
  const [withdrawError, setWithdrawError] = useState<string | null>(null)

  if (!profile) {
    if (loading) return <Loading label={t('common.loading')} />
    return (
      <Screen>
        <EmptyState icon="user" title={t('profile.loadFailed')} text={error ?? undefined} action={{ label: t('common.retry'), onPress: () => void reload() }} />
      </Screen>
    )
  }

  if (profile.kind === 'APP_ONLY') {
    const a = profile.appAccount
    const c = catalog(language)
    return (
      <Screen title={t('tabs.profile')} onRefresh={() => void reload()} refreshing={loading}>
        <Banner tone="info" title={t('profile.appOnlyTitle')}>{t('profile.appOnlyBody')}</Banner>
        <Card>
          <Row label={t('profile.name')} value={a.driverName} />
          <Row label={t('login.phone')} value={a.phone} />
          <Row label={t('profile.vehicleType')} value={c.vehicleTypeLabel(a.vehicleType)} />
          {a.vehicleDescription ? <Row label={t('profile.vehicle')} value={a.vehicleDescription} /> : null}
        </Card>
      </Screen>
    )
  }

  const p = profile.profile
  // Hidden from the site because the driver is app-only (not yet published)
  // is NOT "switched off": the profile stays editable. Only an admin
  // deactivation freezes it (2026-11-12).
  const site = profile.site
  const editable = site ? site.state !== 'DEACTIVATED' : profile.siteActive
  const photo = p.imageDetails?.[0]?.url ?? p.images?.[0]
  const pending = profile.change.pending
  const last = profile.change.lastReviewed
  const c = catalog(language)

  async function withdraw() {
    setWithdrawing(true)
    setWithdrawError(null)
    try {
      await api.withdrawProfileChange()
      await reload()
    } catch (e) {
      setWithdrawError(e instanceof ApiError ? e.message : t('errors.NETWORK'))
    } finally {
      setWithdrawing(false)
    }
  }

  return (
    <Screen onRefresh={() => void reload()} refreshing={loading} contentStyle={{ paddingTop: 0, paddingHorizontal: 0 }}>
      {/* Cover: the main photo, or the brand colour with a truck when there is none */}
      <View style={styles.cover}>
        {photo ? (
          <Image source={{ uri: mediaUrl(photo) }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        ) : (
          <View style={styles.coverEmpty}>
            <Icon name="truck" size={56} color="rgba(255,255,255,0.35)" />
          </View>
        )}
        <View style={styles.coverShade} />
      </View>

      {/* Identity card, overlapping the cover */}
      <View style={styles.identity}>
        <View style={styles.avatar}>
          {photo ? <Image source={{ uri: mediaUrl(photo) }} style={styles.avatarImage} /> : <Icon name="user" size={30} color={colors.primary} />}
        </View>
        <Text style={[type.title, { color: colors.text, textAlign: 'center' }]} numberOfLines={2} accessibilityRole="header">{p.driverName}</Text>
        {p.companyName ? <Text style={[type.body, { color: colors.textSecondary, textAlign: 'center' }]}>{p.companyName}</Text> : null}
        <Text style={[type.small, { color: colors.textSecondary, textAlign: 'center' }]}>
          {[p.phone, c.vehicleTypeLabel(p.vehicle.type)].filter(Boolean).join(' · ')}
        </Text>
        <View style={styles.badges}>
          <Badge label={site?.state === 'LISTED' || (!site && editable) ? t('profile.onSite') : t('profile.offSite')} tone={site?.state === 'LISTED' || (!site && editable) ? 'success' : 'neutral'} dot />
          {p.rating ? <Badge label={`★ ${p.rating.average.toFixed(1)} · ${p.rating.count}`} tone="accent" /> : null}
          {site?.telegramLinked ? <Badge label="Telegram ✓" tone="primary" /> : null}
        </View>
      </View>

      <View style={{ paddingHorizontal: space.lg, gap: space.lg }}>
        {site ? (
          <SiteListingCard site={site} onChanged={reload} />
        ) : (
          <Button icon="globe" variant="outline" label={t('profile.viewOnSite')} onPress={() => void Linking.openURL(websiteUrl(`/tow-trucks/${p.slug}`))} />
        )}

        {!editable ? <Banner tone="warn" title={t('profile.offSiteTitle')}>{t('profile.offSiteBody')}</Banner> : null}
        {pending ? (
          <Banner tone="info" title={t('profile.pendingTitle')} action={{ label: withdrawing ? t('common.loading') : t('profile.withdraw'), onPress: () => void withdraw() }}>
            {t('profile.pendingBody', { fields: pending.fields.map((f) => profileFieldLabel(f.field)).join(', ') })}
          </Banner>
        ) : last?.status === 'REJECTED' ? (
          <Banner tone="danger" title={t('profile.rejectedTitle')}>{last.rejectionReason ?? t('profile.rejectedNoReason')}</Banner>
        ) : last?.status === 'APPROVED' ? (
          <Banner tone="success">{t('profile.approvedNote')}</Banner>
        ) : null}
        {withdrawError ? <Banner tone="danger">{withdrawError}</Banner> : null}
        {editable && !pending ? (
          <Banner tone="info" title={t('profile.editHintTitle')}>{t('profile.editHintBody')}</Banner>
        ) : null}

        <ProfileDetails profile={p} onEdit={editable ? (section) => nav.push('profileEdit', { section }) : undefined} />
        <View style={{ height: space.lg }} />
      </View>
    </Screen>
  )
}

const AVATAR = 88

const styles = StyleSheet.create({
  cover: { height: 160, backgroundColor: colors.primary, overflow: 'hidden' },
  coverEmpty: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primaryLight },
  coverShade: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(13,33,54,0.25)' },
  identity: {
    marginTop: -AVATAR / 2 - space.lg,
    marginHorizontal: space.lg,
    marginBottom: space.lg,
    paddingTop: AVATAR / 2 + space.sm,
    paddingBottom: space.lg,
    paddingHorizontal: space.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    alignItems: 'center',
    gap: 4,
    ...shadow.card,
  },
  avatar: {
    position: 'absolute',
    top: -AVATAR / 2,
    alignSelf: 'center',
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    borderWidth: 4,
    borderColor: colors.surface,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: { width: '100%', height: '100%' },
  badges: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: space.sm, marginTop: space.sm },
})
