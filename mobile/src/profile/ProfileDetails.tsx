/**
 * The driver's whole website profile, field by field, as he entered it at
 * registration — not a one-line summary (2026-11-12: «the profile shows too
 * little»). Every section has its own «Փոխել», which opens that section's
 * editor (ProfileEditScreen); edits go to moderation, as on the website.
 *
 * Labels are the WEBSITE's own words (siteT → frontend/i18n/locales), so the
 * driver sees the same names here as on his registration form. An empty
 * optional field is shown as «Նշված չէ», never hidden: what is missing is
 * exactly what he may want to fill in.
 */
import { mediaUrl } from '../api/client'
import { Image, StyleSheet, Text, View } from 'react-native'
import type { TowTruck } from '~/types/towTruck'
import { capacityRangeFromTons, specialistSpecFieldsFor, usesExactCapacity } from '~/constants/vehicles'
import { serviceCategoriesFor } from '~/constants/services'
import { formatCoordinates } from '~/utils/coordinates'
import { formatPrice } from '~/utils/formatPrice'
import { useLanguage, useT } from '../i18n'
import type { ProfileSection } from './sections'
import { catalog, siteT } from '../shared/site'
import { Badge, Card, Row, Section } from '../ui/kit'
import { colors, radius, space, type } from '../ui/theme'

export function ProfileDetails({ profile: p, onEdit }: { profile: TowTruck; onEdit?: (section: ProfileSection) => void }) {
  const t = useT()
  const language = useLanguage()
  const c = catalog(language)
  const site = (key: string) => siteT(language, key)
  const none = t('register.notGiven')
  const edit = (section: ProfileSection) => (onEdit ? { label: t('common.edit'), onPress: () => onEdit(section) } : undefined)
  const yesNo = (value: boolean | undefined) => (value ? site('truck.yes') : site('truck.no'))
  const amd = (value: number | undefined, suffix = '') => (value === undefined || value === null ? none : `${formatPrice(value)}${suffix}`)

  const v = p.vehicle
  const photos = p.imageDetails?.map((image) => ({ key: String(image.id), url: image.url })) ?? p.images.map((url) => ({ key: url, url }))
  const specs = specialistSpecFieldsFor(v.type)
  const exactCapacity = usesExactCapacity(v.type)
  const categories = serviceCategoriesFor(v.type)
    .map((category) => ({ category, chosen: category.services.filter((service) => p.services.includes(service)) }))
    .filter((group) => group.chosen.length > 0)
  const grouped = new Set(categories.flatMap((group) => group.chosen))
  const otherServices = p.services.filter((service) => !grouped.has(service))
  const platform = v.platformLengthM && v.platformWidthM ? `${v.platformLengthM} × ${v.platformWidthM} ${c.specFieldUnit('մ')}` : none

  return (
    <View style={{ gap: space.lg }}>
      <Section title={`${t('profile.sections.photos')} · ${photos.length}`} action={edit('photos')}>
        {photos.length > 0 ? (
          <View style={styles.thumbs}>
            {photos.map((photo) => (
              <Image key={photo.key} source={{ uri: mediaUrl(photo.url) }} style={styles.thumb} />
            ))}
          </View>
        ) : (
          <Card><Text style={[type.small, { color: colors.textSecondary }]}>{none}</Text></Card>
        )}
      </Section>

      <Section title={t('profile.sections.contacts')} action={edit('contacts')}>
        <Card>
          <Row label={t('profile.name')} value={p.driverName} />
          <Row label={site('registrationFields.companyNameLabel')} value={p.companyName || none} />
          <Row label={site('registrationFields.phoneLabel')} value={p.phone} />
          <Row label={site('registrationFields.secondaryPhoneLabel')} value={p.secondaryPhone || none} />
          <Row label="WhatsApp" value={p.whatsapp || none} />
          <Row label="Telegram" value={p.telegram || none} />
          <Text style={[type.caption, { color: colors.textSecondary }]}>{t('profile.phoneIsLogin')}</Text>
        </Card>
      </Section>

      <Section title={t('profile.sections.vehicle')} action={edit('vehicle')}>
        <Card>
          <Row label={site('truck.type')} value={c.vehicleTypeLabel(v.type)} />
          <Row label={site('truck.brand')} value={v.brand || none} />
          <Row label={site('truck.model')} value={v.model || none} />
          <Row label={site('truck.year')} value={v.year ? String(v.year) : none} />
          {exactCapacity ? null : <Row label={site('truck.capacity')} value={c.capacityRangeLabel(capacityRangeFromTons(v.capacityTons)) || none} />}
          {specs.map((field) => {
            const value = v[field.key]
            return <Row key={field.key} label={c.specFieldLabel(field, v.type)} value={value === undefined || value === null ? none : `${value} ${c.specFieldUnit(field.unit)}`} />
          })}
          <Row label={site('truck.platformSize')} value={platform} />
          {v.plateNumber ? <Row label={site('truck.plateNumber')} value={v.plateNumber} /> : null}
        </Card>
        <Card>
          <Feature label={site('registrationFields.winchLabel')} value={v.winch} text={yesNo(v.winch)} />
          <Feature label={site('registrationFields.manipulatorLabel')} value={v.manipulator} text={yesNo(v.manipulator)} />
          <Feature label={site('registrationFields.wheelSkatesLabel')} value={v.wheelSkates} text={yesNo(v.wheelSkates)} />
          <Feature label={site('registrationFields.doubleDeckLabel')} value={v.doubleDeck} text={yesNo(v.doubleDeck)} />
          <Feature label={site('registrationFields.towHitchLabel')} value={v.towHitch} text={yesNo(v.towHitch)} />
          <Feature label={site('registrationFields.heavyEquipmentLabel')} value={v.heavyEquipment === true} text={yesNo(v.heavyEquipment)} />
        </Card>
      </Section>

      <Section title={t('profile.sections.coverage')} action={edit('coverage')}>
        <Card>
          {p.servesAllArmenia ? (
            <Text style={[type.bodyStrong, { color: colors.text }]}>{t('profile.allArmenia')}</Text>
          ) : p.serviceAreas.length > 0 ? (
            <View style={styles.chips}>
              {p.serviceAreas.map((area) => (
                <Badge key={`${area.type}-${area.slug}`} label={c.placeName(area.type === 'route' ? 'zone' : (area.type as 'city'), area.slug, area.name)} />
              ))}
            </View>
          ) : (
            <Text style={[type.small, { color: colors.textSecondary }]}>{none}</Text>
          )}
          <Row label={t('profile.baseCity')} value={p.location.name || none} />
        </Card>
      </Section>

      <Section title={t('profile.sections.services')} action={edit('services')}>
        <Card>
          <Row label={site('registrationFields.workingHoursLabel')} value={p.works24Hours ? '24/7' : p.workingHoursText || none} />
          {categories.map(({ category, chosen }) => (
            <View key={category.key} style={{ gap: space.xs }}>
              <Text style={[type.label, { color: colors.textSecondary }]}>{c.categoryTitle(category)}</Text>
              <View style={styles.chips}>
                {chosen.map((service) => <Badge key={service} label={c.serviceLabel(service)} tone="primary" />)}
              </View>
            </View>
          ))}
          {otherServices.length > 0 ? (
            <View style={styles.chips}>
              {otherServices.map((service) => <Badge key={service} label={c.serviceLabel(service)} tone="primary" />)}
            </View>
          ) : null}
          {p.services.length === 0 ? <Text style={[type.small, { color: colors.textSecondary }]}>{none}</Text> : null}
        </Card>
      </Section>

      <Section title={t('profile.sections.prices')} action={edit('prices')}>
        <Card>
          <Row label={site('pricing.cityCallout')} value={amd(p.pricing?.cityCallout)} />
          <Row label={site('pricing.intercity')} value={amd(p.pricing?.perKm, `/${t('common.km')}`)} />
          <Row label={site('pricing.waiting')} value={amd(p.pricing?.waitingPerHour, `/${t('profile.hour')}`)} />
          <Row label={site('pricing.nightSurcharge')} value={p.pricing?.nightSurchargePercent !== undefined ? `+${p.pricing.nightSurchargePercent}%` : none} />
          <Row label={site('pricing.extraLoading')} value={amd(p.pricing?.extraLoading)} />
        </Card>
      </Section>

      <Section title={t('profile.sections.location')} action={edit('location')}>
        <Card>
          <Row label={t('profile.baseCity')} value={p.location.name || none} />
          <Row
            label={site('coordinatesInput.fieldLabel')}
            value={typeof p.location.latitude === 'number' && typeof p.location.longitude === 'number' ? formatCoordinates(p.location.latitude, p.location.longitude) : none}
            tone={typeof p.location.latitude === 'number' ? undefined : 'warn'}
          />
          <Text style={[type.caption, { color: colors.textSecondary }]}>{t('profile.baseUsedWhenGpsLost')}</Text>
        </Card>
      </Section>

      <Section title={t('profile.sections.about')} action={edit('about')}>
        <Card>
          <Text style={[type.body, { color: p.description ? colors.text : colors.textSecondary }]}>{p.description || none}</Text>
        </Card>
      </Section>
    </View>
  )
}

function Feature({ label, value, text }: { label: string; value: boolean; text: string }) {
  return (
    <View style={styles.feature}>
      <Text style={[type.body, { color: colors.text, flex: 1 }]}>{label}</Text>
      <Badge label={text} tone={value ? 'success' : 'neutral'} />
    </View>
  )
}

const styles = StyleSheet.create({
  thumbs: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  thumb: { width: '31.5%', aspectRatio: 1, borderRadius: radius.md, backgroundColor: colors.border },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  feature: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: 2 },
})
