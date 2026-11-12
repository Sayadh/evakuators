/**
 * Edits one section of the website profile. The whole profile is submitted —
 * exactly as the website dashboard does — so the server's diff contains only
 * what changed; nothing is written until a moderator approves it.
 *
 * The rules are the website's (profile/profileForm.ts → `validateRegistrationForm`
 * and friends); a problem in ANOTHER section (old data that predates a rule)
 * is named, with a way to open that section, instead of a silent refusal.
 */
import { useMemo, useState } from 'react'
import { Text } from 'react-native'
import { parseCoordinates } from '~/utils/coordinates'
import { api, ApiError, NetworkError } from '../api/client'
import { applyChange, type FormErrors } from '../forms/state'
import { ContactFields, CoverageFields, LocationFields, PricesFields, ServicesFields, VehicleFields } from '../forms/fields'
import { useLanguage, useT } from '../i18n'
import { uploadGallery, type GalleryPhoto } from '../media/gallery'
import { PhotosField } from '../media/PhotosField'
import { useNav } from '../navigation/Navigator'
import { buildProfileUpdate, profileToForm, validateProfileForm, type ProfileForm } from '../profile/profileForm'
import type { ProfileSection } from '../profile/sections'
import { useProfile } from '../state/ProfileState'
import { Banner, Button, Card, Field, Header, Loading, Note, Screen } from '../ui/kit'
import { colors, type } from '../ui/theme'

const SECTION_ERRORS: Record<ProfileSection, readonly string[]> = {
  contacts: ['driverName', 'secondaryPhone', 'whatsapp'],
  vehicle: ['brand', 'year', 'vehicleType', 'capacity', 'platformDimensions', 'craneCapacityTons', 'craneReachM', 'maxLoadTons', 'platformLoadHeightCm'],
  coverage: ['regionSlugs', 'citySlugs', 'baseSlug'],
  services: ['services', 'workingHours'],
  prices: ['priceCityCallout', 'pricePerKm', 'priceWaitingPerHour', 'priceNightSurchargePercent', 'priceExtraLoading'],
  location: ['coordinates'],
  photos: ['photos'],
  about: ['description'],
}

export function ProfileEditScreen({ section }: { section: ProfileSection }) {
  const t = useT()
  const language = useLanguage()
  const nav = useNav()
  const { profile, reload } = useProfile()
  const site = profile?.kind === 'SITE_LINKED' ? profile.profile : null
  const [form, setForm] = useState<ProfileForm | null>(() => (site ? profileToForm(site) : null))
  const [gallery, setGallery] = useState<GalleryPhoto[]>(() => (site?.imageDetails ?? []).map((image) => ({ kind: 'existing', key: `e${image.id}`, id: image.id, url: image.url })))
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<{ tone: 'success' | 'info' | 'danger'; text: string } | null>(null)

  const errors = useMemo<FormErrors>(() => {
    if (!form) return {}
    const all: FormErrors = {}
    validateProfileForm(form, all, language)
    all.photos = gallery.length === 0 ? t('photos.required') : ''
    if (section === 'location') {
      const parsed = form.coordinates.trim() ? parseCoordinates(form.coordinates) : null
      all.coordinates = !form.coordinates.trim() ? t('profile.coordinatesRequired') : parsed && !parsed.ok ? parsed.error : ''
    }
    return all
  }, [form, gallery, language, section, t])

  if (!form || !site) return <Loading />

  const own = Object.fromEntries(SECTION_ERRORS[section].map((key) => [key, tried ? (errors[key] ?? '') : ''])) as FormErrors
  const elsewhere = (Object.keys(SECTION_ERRORS) as ProfileSection[]).filter(
    (other) => other !== section && other !== 'location' && SECTION_ERRORS[other].some((key) => errors[key]),
  )
  const change = (patch: Partial<ProfileForm>) => setForm((current) => (current ? applyChange(current, patch) : current))

  async function save() {
    if (!form) return
    setTried(true)
    setOutcome(null)
    if (SECTION_ERRORS[section].some((key) => errors[key]) || (section !== 'location' && elsewhere.length > 0)) return
    try {
      let status
      if (section === 'location') {
        const parsed = parseCoordinates(form.coordinates)
        if (!parsed.ok) return
        setBusy(t('profile.saving'))
        status = await api.updateCoordinates({ latitude: parsed.latitude, longitude: parsed.longitude })
      } else {
        let imageIds: number[] | undefined
        if (section === 'photos') {
          const uploaded = await uploadGallery(gallery, (photo) => api.uploadImage(photo), (done, total) => setBusy(t('register.uploading', { done, total })))
          setGallery(uploaded.gallery)
          imageIds = uploaded.imageIds
        }
        setBusy(t('profile.saving'))
        status = await api.updateProfile(buildProfileUpdate(form, imageIds))
      }
      await reload()
      setOutcome(status.pending ? { tone: 'success', text: t('profile.queued') } : { tone: 'info', text: t('profile.unchanged') })
    } catch (e) {
      setOutcome({ tone: 'danger', text: e instanceof ApiError ? (e.status === 402 ? t('profile.subscriptionLocked') : e.message) : t(e instanceof NetworkError ? 'errors.NETWORK' : 'errors.UNKNOWN') })
    } finally {
      setBusy(null)
    }
  }

  const footer = (
    <>
      {outcome ? <Banner tone={outcome.tone}>{outcome.text}</Banner> : null}
      {outcome?.tone === 'success' ? <Button variant="outline" label={t('common.done')} onPress={nav.pop} /> : <Button icon="check" label={busy ?? t('profile.submit')} busy={busy !== null} onPress={() => void save()} />}
    </>
  )

  return (
    <Screen header={<Header title={t(`profile.sections.${section}`)} onBack={nav.pop} />} footer={footer}>
      <Note>{t('profile.moderationNote')}</Note>
      {tried && elsewhere.length > 0 && section !== 'location' ? (
        <Banner tone="warn" title={t('profile.otherSectionsTitle')}>
          {elsewhere.map((other) => t(`profile.sections.${other}`)).join(', ')}
        </Banner>
      ) : null}

      {section === 'contacts' ? (
        <>
          <Field label={t('profile.name')} value={form.driverName} onChangeText={(v) => change({ driverName: v })} error={own.driverName} />
          <Field label={t('login.phone')} value={form.phone} editable={false} hint={t('profile.phoneLocked')} />
          <ContactFields form={form} errors={own} onChange={change} />
        </>
      ) : null}
      {section === 'vehicle' ? <VehicleFields form={form} errors={own} onChange={change} /> : null}
      {section === 'coverage' ? (
        <>
          <Card>
            <Text style={[type.label, { color: colors.textSecondary }]}>{t('profile.base')}</Text>
            <Text style={[type.bodyStrong, { color: colors.text }]}>{form.locationName}</Text>
            <Note>{t('profile.baseLocked')}</Note>
          </Card>
          {own.baseSlug ? <Banner tone="danger">{own.baseSlug}</Banner> : null}
          <CoverageFields form={form} errors={own} onChange={change} />
        </>
      ) : null}
      {section === 'services' ? <ServicesFields form={form} errors={own} onChange={change} /> : null}
      {section === 'prices' ? <PricesFields form={form} errors={own} onChange={change} /> : null}
      {section === 'location' ? <LocationFields form={form} errors={own} onChange={change} /> : null}
      {section === 'photos' ? <PhotosField gallery={gallery} onChange={setGallery} error={own.photos} /> : null}
      {section === 'about' ? (
        <Field label={t('profile.description')} value={form.description} onChangeText={(v) => change({ description: v })} multiline maxLength={2000} error={own.description} hint={t('profile.descriptionHint')} />
      ) : null}
    </Screen>
  )
}
