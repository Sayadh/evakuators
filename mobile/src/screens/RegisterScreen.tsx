/**
 * Sign-up — the WEBSITE's registration, in steps (2026-11).
 *
 * The same questions, rules, words, consent and moderation as
 * evakuators.am/register: the form state, the validator and the payload are
 * the website's own functions (`~/utils/registrationForm`,
 * `~/utils/registrationPayload`). What the app adds: a password (so the driver
 * can sign in here once approved), steps sized for a phone, a draft that
 * survives the app being closed, and the camera for photos.
 *
 * On submit the photos are uploaded first (`POST /images`), then the request
 * is filed (`POST /driver-app/site-registrations`). After approval the
 * driver's page is public on the website and they sign in to the app with this
 * phone and password.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Linking, Text, View } from 'react-native'
import { PRIVACY_POLICY_VERSION } from '~/constants/privacyConsent'
import { createRegistrationFormState, validateRegistrationForm } from '~/utils/registrationForm'
import { buildRegistrationPayload } from '~/utils/registrationPayload'
import { api, ApiError, NetworkError, SITE_PRIVACY_URL } from '../api/client'
import { applyChange, type FormErrors, type RegistrationFormState } from '../forms/state'
import { ContactFields, CoverageFields, LocationFields, NameFields, PhoneField, PricesFields, ServicesFields, VehicleFields } from '../forms/fields'
import { useLanguage, useT } from '../i18n'
import { uploadGallery, type GalleryPhoto } from '../media/gallery'
import { PhotosField } from '../media/PhotosField'
import { catalog, siteT } from '../shared/site'
import { Icon } from '../ui/Icon'
import { Banner, Button, Card, Checkbox, Field, Header, Note, Row, Screen, Steps } from '../ui/kit'
import { colors, space, type } from '../ui/theme'
import { clearDraft, loadDraft, saveDraft, withExistingPhotos } from '../register/draft'
import { errorsOf, firstStepWithErrors, passwordErrors, STEPS, stepHasErrors, type StepName } from '../register/steps'

export function RegisterScreen({ onBack, onOpenPrivacy }: { onBack: () => void; onOpenPrivacy: () => void }) {
  const t = useT()
  const language = useLanguage()
  const [form, setForm] = useState<RegistrationFormState>(createRegistrationFormState)
  const [password, setPassword] = useState('')
  const [passwordRepeat, setPasswordRepeat] = useState('')
  const [gallery, setGallery] = useState<GalleryPhoto[]>([])
  const [consent, setConsent] = useState(false)
  const [step, setStep] = useState(0)
  const [shown, setShown] = useState<Set<StepName>>(new Set())
  const [submitting, setSubmitting] = useState<string | null>(null)
  const [serverError, setServerError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [draftOffer, setDraftOffer] = useState<{ step: number; form: RegistrationFormState; gallery: GalleryPhoto[] } | null>(null)
  const loaded = useRef(false)

  useEffect(() => {
    void loadDraft().then((draft) => {
      if (draft && (draft.form.firstName || draft.form.brand || draft.gallery.length > 0)) setDraftOffer(draft)
      loaded.current = true
    })
  }, [])

  // Saved on every change once the stored draft has been offered — so a
  // fresh form never overwrites a draft the driver has not chosen to drop.
  useEffect(() => {
    if (!loaded.current || draftOffer || sent) return
    const timer = setTimeout(() => saveDraft({ step, form, gallery }), 600)
    return () => clearTimeout(timer)
  }, [form, gallery, step, draftOffer, sent])

  const errors = useMemo<FormErrors>(() => {
    const all: FormErrors = {}
    validateRegistrationForm(form, all, language)
    Object.assign(all, passwordErrors(password, passwordRepeat, { tooShort: t('register.invalid.password'), mismatch: t('register.invalid.passwordRepeat') }))
    all.photos = gallery.length === 0 ? siteT(language, 'registerPage.mainImageRequiredError') : ''
    all.consent = consent ? '' : t('register.consentRequired')
    return all
  }, [form, password, passwordRepeat, gallery, consent, language, t])

  const name = STEPS[step]
  const visibleErrors = shown.has(name) ? errorsOf(name, errors) : {}
  const change = (patch: Partial<RegistrationFormState>) => setForm((current) => applyChange(current, patch))

  function next() {
    if (stepHasErrors(name, errors)) {
      setShown((s) => new Set(s).add(name))
      return
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1))
  }

  function back() {
    if (step === 0) onBack()
    else setStep((s) => s - 1)
  }

  async function submit() {
    setServerError(null)
    const broken = firstStepWithErrors(errors)
    if (broken !== null) {
      setShown(new Set(STEPS))
      setStep(broken)
      return
    }
    const coordinates = (() => {
      const result: FormErrors = {}
      return validateRegistrationForm(form, result, language).coordinates
    })()
    // A photo whose file the phone no longer has cannot be sent: drop it and
    // send the driver back to the photos step rather than failing as "network"
    const checked = withExistingPhotos(gallery)
    if (checked.lost > 0) {
      setGallery(checked.gallery)
      setServerError(t('register.photosLost', { n: checked.lost }))
      const photosStep = STEPS.indexOf('photos')
      if (photosStep >= 0) setStep(photosStep)
      return
    }
    let phase: 'upload' | 'send' = 'upload'
    try {
      setSubmitting(t('register.uploading', { done: 0, total: gallery.length }))
      const uploaded = await uploadGallery(gallery, (photo) => api.uploadImage(photo), (done, total) => setSubmitting(t('register.uploading', { done, total })))
      setGallery(uploaded.gallery)
      phase = 'send'
      setSubmitting(t('register.sending'))
      await api.registerOnSite({ ...buildRegistrationPayload(form, uploaded.imageIds, coordinates), password })
      clearDraft()
      setSent(true)
    } catch (e) {
      if (e instanceof ApiError) {
        // The website's image rule ("one of the photos is not valid any more"):
        // drop the ids so the next attempt uploads them again.
        if (/Նկար/.test(e.message)) setGallery((g) => g.map((p) => (p.kind === 'local' ? { ...p, uploadedId: undefined } : p)))
        const key = `register.errors.${e.status === 429 ? 'RATE_LIMITED' : e.code}`
        const known = t(key)
        setServerError(known !== key ? known : e.message)
      } else {
        // Say WHICH step failed and why: "no internet" alone hid a photo upload that timed out
        const base = e instanceof NetworkError ? t(phase === 'upload' ? 'register.uploadFailed' : 'errors.NETWORK') : t('errors.UNKNOWN')
        const detail = e instanceof Error && e.message && e.message !== 'network' ? ` (${e.message})` : ''
        setServerError(base + detail)
      }
    } finally {
      setSubmitting(null)
    }
  }

  if (sent) {
    return (
      <Screen contentStyle={{ flexGrow: 1, justifyContent: 'center' }}>
        <View style={{ alignItems: 'center', gap: space.md }}>
          <View style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: colors.successSoft, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="check" size={44} color={colors.success} />
          </View>
          <Text style={[type.title, { color: colors.text, textAlign: 'center' }]}>{siteT(language, 'registerPage.successTitle')}</Text>
          <Text style={[type.body, { color: colors.textSecondary, textAlign: 'center' }]}>{t('register.sentBody')}</Text>
        </View>
        <Card>
          <Row label={t('login.phone')} value={form.phone} />
          <Note>{t('register.sentHowToLogin')}</Note>
        </Card>
        <Button label={t('register.backToLogin')} onPress={onBack} />
      </Screen>
    )
  }

  if (draftOffer) {
    return (
      <Screen header={<Header title={t('register.title')} onBack={onBack} />}>
        <Card>
          <Text style={[type.heading, { color: colors.text }]}>{t('register.draftTitle')}</Text>
          <Note>{t('register.draftBody')}</Note>
          <Button
            label={t('register.draftContinue')}
            onPress={() => {
              setForm({ ...createRegistrationFormState(), ...draftOffer.form })
              setGallery(draftOffer.gallery)
              setStep(Math.min(draftOffer.step, STEPS.length - 1))
              setDraftOffer(null)
            }}
          />
          <Button
            variant="outline"
            label={t('register.draftDiscard')}
            onPress={() => {
              clearDraft()
              setDraftOffer(null)
            }}
          />
        </Card>
      </Screen>
    )
  }

  const footer = (
    <>
      {serverError ? <Banner tone="danger">{serverError}</Banner> : null}
      {name === 'review' ? (
        <Button label={submitting ?? siteT(language, 'registerPage.submit')} busy={submitting !== null} onPress={() => void submit()} icon="check" />
      ) : (
        <Button label={t('register.next')} onPress={next} />
      )}
    </>
  )

  return (
    <Screen header={<Header title={t('register.title')} onBack={back} />} footer={footer}>
      <Steps current={step} total={STEPS.length} label={t('register.stepOf', { n: step + 1, total: STEPS.length, title: t(`register.steps.${name}`) })} />
      <View style={{ gap: 4 }}>
        <Text style={[type.title, { color: colors.text }]}>{t(`register.steps.${name}`)}</Text>
        <Text style={[type.small, { color: colors.textSecondary }]}>{t(`register.stepHints.${name}`)}</Text>
      </View>

      {name === 'account' ? (
        <>
          {step === 0 ? <Banner tone="info">{t('register.alreadyOnSite')}</Banner> : null}
          <NameFields form={form} errors={visibleErrors} onChange={change} />
          <PhoneField label={siteT(language, 'registrationFields.phoneLabel')} value={form.phone} onChange={(phone) => change({ phone })} error={visibleErrors.phone} hint={siteT(language, 'registrationFields.phoneHint')} />
          <Field label={t('register.password')} value={password} onChangeText={setPassword} secure autoComplete="new-password" textContentType="newPassword" error={visibleErrors.password} hint={t('register.passwordHint')} />
          <Field label={t('register.passwordRepeat')} value={passwordRepeat} onChangeText={setPasswordRepeat} secure autoComplete="new-password" textContentType="newPassword" error={visibleErrors.passwordRepeat} />
        </>
      ) : null}
      {name === 'contacts' ? <ContactFields form={form} errors={visibleErrors} onChange={change} /> : null}
      {name === 'vehicle' ? <VehicleFields form={form} errors={visibleErrors} onChange={change} /> : null}
      {name === 'coverage' ? (
        form.vehicleType ? <CoverageFields form={form} errors={visibleErrors} onChange={change} /> : <Banner tone="warn">{t('forms.vehicleFirst')}</Banner>
      ) : null}
      {name === 'services' ? <ServicesFields form={form} errors={visibleErrors} onChange={change} /> : null}
      {name === 'location' ? <LocationFields form={form} errors={visibleErrors} onChange={change} /> : null}
      {name === 'prices' ? <PricesFields form={form} errors={visibleErrors} onChange={change} /> : null}
      {name === 'photos' ? <PhotosField gallery={gallery} onChange={setGallery} error={visibleErrors.photos} /> : null}
      {name === 'review' ? (
        <Review form={form} gallery={gallery} errors={errors} goTo={setStep} consent={consent} setConsent={setConsent} showConsentError={shown.has('review')} onOpenPrivacy={onOpenPrivacy} />
      ) : null}
    </Screen>
  )
}

function Review({
  form,
  gallery,
  errors,
  goTo,
  consent,
  setConsent,
  showConsentError,
  onOpenPrivacy,
}: {
  form: RegistrationFormState
  gallery: GalleryPhoto[]
  errors: FormErrors
  goTo: (step: number) => void
  consent: boolean
  setConsent: (value: boolean) => void
  showConsentError: boolean
  onOpenPrivacy: () => void
}) {
  const t = useT()
  const language = useLanguage()
  const c = catalog(language)
  const line = (step: StepName, value: string) => {
    const index = STEPS.indexOf(step)
    const broken = stepHasErrors(step, errors)
    return (
      <Card key={step} onPress={() => goTo(index)} style={broken ? { borderColor: colors.danger } : undefined}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <Icon name={broken ? 'alert' : 'check'} size={18} color={broken ? colors.danger : colors.success} />
          <Text style={[type.bodyStrong, { color: colors.text, flex: 1 }]}>{t(`register.steps.${step}`)}</Text>
          <Text style={[type.label, { color: colors.primaryLight }]}>{t('common.edit')}</Text>
        </View>
        <Text style={[type.small, { color: colors.textSecondary }]} numberOfLines={3}>
          {value || '—'}
        </Text>
      </Card>
    )
  }
  return (
    <>
      {line('account', `${form.firstName} ${form.lastName} · ${form.phone}`)}
      {line('contacts', [form.companyName, form.secondaryPhone, form.whatsapp && `WhatsApp ${form.whatsapp}`, form.telegram].filter(Boolean).join(' · '))}
      {line('vehicle', [form.brand, form.model, form.year, form.vehicleType && c.vehicleTypeLabel(form.vehicleType)].filter(Boolean).join(' · '))}
      {line('coverage', form.servesAllArmenia ? t('profile.allArmenia') : t('register.placesCount', { n: form.citySlugs.length || form.regionSlugs.length }))}
      {line('services', t('register.servicesCount', { n: form.services.length }))}
      {line('location', form.coordinates || t('register.notGiven'))}
      {line('prices', [form.priceCityCallout && `${form.priceCityCallout} ֏`, form.pricePerKm && `${form.pricePerKm} ֏/km`].filter(Boolean).join(' · ') || t('register.notGiven'))}
      {line('photos', t('photos.count', { n: gallery.length, max: 6 }))}

      <Card>
        <Text style={[type.heading, { color: colors.text }]}>{siteT(language, 'privacyConsent.title')}</Text>
        {[1, 2, 3, 4].map((n) => (
          <Text key={n} style={[type.small, { color: colors.text }]}>
            {siteT(language, `privacyConsent.paragraph${n}`)}
          </Text>
        ))}
        <Text style={[type.small, { color: colors.text }]}>
          {siteT(language, 'privacyConsent.policySentenceBefore')}
          <Text style={{ color: colors.primaryLight, fontWeight: '600' }} onPress={() => void Linking.openURL(SITE_PRIVACY_URL)}>
            {siteT(language, 'privacyConsent.policyLinkLabel')}
          </Text>
          {siteT(language, 'privacyConsent.policySentenceAfter')}
        </Text>
        <Text style={[type.small, { color: colors.primaryLight, fontWeight: '600' }]} onPress={onOpenPrivacy}>
          {t('register.appPolicyLink')}
        </Text>
        <Checkbox label={siteT(language, 'privacyConsent.checkboxLabel')} value={consent} onChange={setConsent} />
        {showConsentError && errors.consent ? <Note tone="danger">{errors.consent}</Note> : null}
        <Note>{t('register.policyVersion', { v: PRIVACY_POLICY_VERSION })}</Note>
      </Card>
    </>
  )
}
