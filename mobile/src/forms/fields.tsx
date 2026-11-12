/**
 * The registration form's questions, as React Native field groups.
 *
 * The mobile counterpart of `frontend/components/registration/RegistrationFormFields.vue`
 * and its pickers: the SAME questions, shown under the SAME conditions
 * (`asksWheelSkates`, `specialistSpecFieldsFor`, `hasUncappedCoverage`, …), in
 * the website's own words (`siteT`). Each group is used twice — by the sign-up
 * wizard and by the profile editor — so registering and editing can never
 * offer different choices (CLAUDE.md, "Registration and the driver dashboard
 * must offer the same fields").
 *
 * A group gets the whole form and returns patches through `onChange`, which
 * runs `applyChange` (forms/state.ts) — the website's watchers.
 */
import { useState } from 'react'
import { Linking, Pressable, Text, View } from 'react-native'
import * as Location from 'expo-location'
import { serviceCategoriesFor, withService } from '~/constants/services'
import { coverageModeOptions, countLimitedAreas, hasUncappedCoverage, maxAreasFor, MAX_REGIONS, uncappedCoverageReason } from '~/constants/serviceAreaLimits'
import { asksDoubleDeck, asksTowHitch, asksWheelSkates, CAPACITY_RANGE_OPTIONS, specialistSpecFieldsFor, usesExactCapacity, VEHICLE_TYPE_OPTIONS } from '~/constants/vehicles'
import { LocationType, ServiceType, VehicleType } from '~/types/enums'
import { buildRegionOptions, getRegionCities, getRegionServiceZones, getStaticDistricts, resolveAreaType, YEREVAN_REGION_SLUG } from '~/utils/geography'
import { isAvailable247, isManipulatorVehicleType } from '~/utils/registrationForm'
import { useLanguage, useT } from '../i18n'
import { catalog, siteT } from '../shared/site'
import { Banner, Button, Card, Checkbox, ChoiceList, Chips, Field, Note, Sheet } from '../ui/kit'
import { colors, space, type } from '../ui/theme'
import type { FormErrors, RegistrationFormState } from './state'
import { timeMask } from './timeMask'

export interface GroupProps<F extends RegistrationFormState = RegistrationFormState> {
  form: F
  errors: FormErrors
  onChange: (patch: Partial<F>) => void
}

/** The local 8 digits, shown after a fixed "+374" — same model as the website's phone inputs */
const localDigits = (value: string) => value.replace(/^\+374/, '')
const withPrefix = (digits: string) => (digits.replace(/\D/g, '') ? `+374${digits.replace(/\D/g, '')}` : '')

export function PhoneField({ label, value, onChange, error, hint, editable }: { label: string; value: string; onChange: (value: string) => void; error?: string; hint?: string; editable?: boolean }) {
  return (
    <Field
      label={label}
      prefix="+374"
      value={localDigits(value)}
      onChangeText={(digits) => onChange(withPrefix(digits))}
      keyboardType="phone-pad"
      maxLength={8}
      placeholder="91 234567"
      error={error}
      hint={hint}
      editable={editable}
      autoComplete="tel"
      textContentType="telephoneNumber"
    />
  )
}

/** A small "?" that opens the website's explanation for a checkbox */
function Explain({ title, text }: { title: string; text: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Pressable onPress={() => setOpen(true)} hitSlop={10} accessibilityRole="button" accessibilityLabel={title} style={{ alignSelf: 'flex-start', marginLeft: 36, marginTop: -4 }}>
        <Text style={[type.small, { color: colors.primaryLight, fontWeight: '600' }]}>ⓘ {title}</Text>
      </Pressable>
      <Sheet visible={open} onClose={() => setOpen(false)} title={title}>
        <Text style={[type.body, { color: colors.text }]}>{text}</Text>
      </Sheet>
    </>
  )
}

// ─── Personal & contacts ───────────────────────────────────────────────────

export function NameFields({ form, errors, onChange }: GroupProps) {
  const language = useLanguage()
  return (
    <>
      <Field label={siteT(language, 'registrationFields.firstNameLabel')} value={form.firstName} onChangeText={(v) => onChange({ firstName: v })} error={errors.firstName} autoComplete="given-name" textContentType="givenName" />
      <Field label={siteT(language, 'registrationFields.lastNameLabel')} value={form.lastName} onChangeText={(v) => onChange({ lastName: v })} error={errors.lastName} autoComplete="family-name" textContentType="familyName" />
    </>
  )
}

export function ContactFields({ form, errors, onChange }: GroupProps) {
  const language = useLanguage()
  return (
    <>
      <Field label={siteT(language, 'registrationFields.companyNameLabel')} value={form.companyName} onChangeText={(v) => onChange({ companyName: v })} />
      <PhoneField label={siteT(language, 'registrationFields.secondaryPhoneLabel')} value={form.secondaryPhone} onChange={(v) => onChange({ secondaryPhone: v })} error={errors.secondaryPhone} />
      <PhoneField label="WhatsApp" value={form.whatsapp} onChange={(v) => onChange({ whatsapp: v })} error={errors.whatsapp} />
      <Field label="Telegram (username)" placeholder="@username" autoCapitalize="none" autoCorrect={false} value={form.telegram} onChangeText={(v) => onChange({ telegram: v })} />
    </>
  )
}

// ─── Vehicle ───────────────────────────────────────────────────────────────

export function VehicleFields({ form, errors, onChange }: GroupProps) {
  const language = useLanguage()
  const c = catalog(language)
  const specFields = specialistSpecFieldsFor(form.vehicleType)
  const isManipulatorType = isManipulatorVehicleType(form.vehicleType)
  const isHeavyDutyType = form.vehicleType === VehicleType.HeavyDuty
  return (
    <>
      <Field label={siteT(language, 'registrationFields.brandLabel')} value={form.brand} onChangeText={(v) => onChange({ brand: v })} error={errors.brand} placeholder="Isuzu" />
      <Field label={siteT(language, 'registrationFields.modelLabel')} value={form.model} onChangeText={(v) => onChange({ model: v })} placeholder="NPR" />
      <Field label={siteT(language, 'registrationFields.yearLabel')} value={form.year} onChangeText={(v) => onChange({ year: v.replace(/\D/g, '').slice(0, 4) })} keyboardType="number-pad" maxLength={4} error={errors.year} placeholder="2015" />

      <Text style={[type.label, { color: colors.text }]}>{siteT(language, 'registrationFields.typeLabel')}</Text>
      <ChoiceList
        options={VEHICLE_TYPE_OPTIONS.map((option) => ({ value: option.value as string, label: c.vehicleTypeLabel(option.value), hint: c.vehicleTypeHint(option.value) }))}
        value={form.vehicleType}
        onChange={(value) => onChange({ vehicleType: value })}
        error={errors.vehicleType}
      />

      {!usesExactCapacity(form.vehicleType) && form.vehicleType ? (
        <>
          <Text style={[type.label, { color: colors.text }]}>{siteT(language, 'registrationFields.capacityBandLabel')}</Text>
          <Chips
            options={CAPACITY_RANGE_OPTIONS.map((option) => ({ value: option.value, label: c.capacityRangeLabel(option.value) }))}
            selected={form.capacity ? [form.capacity] : []}
            onToggle={(value) => onChange({ capacity: value })}
          />
          {errors.capacity ? <Note tone="danger">{errors.capacity}</Note> : null}
        </>
      ) : null}

      {specFields.map((field) => (
        <Field
          key={field.key}
          label={`${c.specFieldLabel(field, form.vehicleType)}${field.required ? ' *' : ''}`}
          suffix={c.specFieldUnit(field.unit)}
          placeholder={field.placeholder}
          keyboardType="decimal-pad"
          value={form[field.key]}
          onChangeText={(v) => onChange({ [field.key]: v } as Partial<RegistrationFormState>)}
          error={errors[field.key]}
        />
      ))}

      <Text style={[type.label, { color: colors.text }]}>{siteT(language, 'platformDimensionsInput.label')}</Text>
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <View style={{ flex: 1 }}>
          <Field accessibilityLabel={siteT(language, 'platformDimensionsInput.lengthAria')} value={form.platformLengthM} onChangeText={(v) => onChange({ platformLengthM: v })} keyboardType="decimal-pad" placeholder="5.5" suffix={c.specFieldUnit('մ')} />
        </View>
        <View style={{ flex: 1 }}>
          <Field accessibilityLabel={siteT(language, 'platformDimensionsInput.widthAria')} value={form.platformWidthM} onChangeText={(v) => onChange({ platformWidthM: v })} keyboardType="decimal-pad" placeholder="2.2" suffix={c.specFieldUnit('մ')} />
        </View>
      </View>
      {errors.platformDimensions ? <Note tone="danger">{errors.platformDimensions}</Note> : <Note>{siteT(language, 'platformDimensionsInput.hint')}</Note>}

      <View style={{ gap: space.xs }}>
        <Checkbox label={siteT(language, 'registrationFields.winchLabel')} value={form.winch} onChange={(v) => onChange({ winch: v })} />
        <Checkbox label={siteT(language, 'registrationFields.manipulatorLabel')} value={form.manipulator} disabled={isManipulatorType} onChange={(v) => onChange({ manipulator: v })} />
        <Checkbox label={siteT(language, 'registrationFields.heavyEquipmentLabel')} value={form.heavyEquipment} disabled={isHeavyDutyType} onChange={(v) => onChange({ heavyEquipment: v })} />
        <Explain title={siteT(language, 'registrationFields.heavyEquipmentTooltipLabel')} text={siteT(language, 'registrationFields.heavyEquipmentTooltipText')} />
        {asksWheelSkates(form.vehicleType) ? (
          <>
            <Checkbox label={siteT(language, 'registrationFields.wheelSkatesLabel')} value={form.wheelSkates} onChange={(v) => onChange({ wheelSkates: v })} />
            <Explain title={siteT(language, 'registrationFields.wheelSkatesTooltipLabel')} text={siteT(language, 'registrationFields.wheelSkatesTooltipText')} />
          </>
        ) : null}
        {asksDoubleDeck(form.vehicleType) ? (
          <>
            <Checkbox label={siteT(language, 'registrationFields.doubleDeckLabel')} value={form.doubleDeck} onChange={(v) => onChange({ doubleDeck: v })} />
            <Explain title={siteT(language, 'registrationFields.doubleDeckTooltipLabel')} text={siteT(language, 'registrationFields.doubleDeckTooltipText')} />
          </>
        ) : null}
        {asksTowHitch(form.vehicleType) ? (
          <>
            <Checkbox label={siteT(language, 'registrationFields.towHitchLabel')} value={form.towHitch} onChange={(v) => onChange({ towHitch: v })} />
            <Explain title={siteT(language, 'registrationFields.towHitchTooltipLabel')} text={siteT(language, 'registrationFields.towHitchTooltipText')} />
          </>
        ) : null}
      </View>
    </>
  )
}

// ─── Coverage ──────────────────────────────────────────────────────────────

/**
 * `ServiceAreaPicker.vue` / `ServiceRegionPicker.vue`: an ordinary truck picks
 * 1–2 marzes and then places inside them, within the budget
 * (`maxAreasFor`/`countLimitedAreas`); an uncapped one (crane, machinery)
 * picks «Ամբողջ Հայաստան» or any number of marzes. A ticked place is never
 * disabled — a cap must not trap a driver in their own choice.
 */
export function CoverageFields({ form, errors, onChange }: GroupProps) {
  const language = useLanguage()
  const t = useT()
  const c = catalog(language)
  const regionOptions = buildRegionOptions(language)
  const uncapped = hasUncappedCoverage(form)

  if (uncapped) {
    const appearsOnManipulator = isManipulatorVehicleType(form.vehicleType) || form.manipulator
    const appearsOnHeavy = form.vehicleType === VehicleType.HeavyDuty || form.heavyEquipment
    const nationwideNote = appearsOnManipulator && appearsOnHeavy ? 'nationwideNoteBoth' : appearsOnManipulator ? 'nationwideNoteManipulator' : 'nationwideNoteHeavyDuty'
    return (
      <>
        <Banner tone="info">{uncappedCoverageReason(form, language)}</Banner>
        <Text style={[type.label, { color: colors.text }]}>{siteT(language, 'registrationFields.coverageAreaLabel')}</Text>
        <ChoiceList
          options={coverageModeOptions(language).map((option) => ({ value: option.value, label: option.label }))}
          value={form.servesAllArmenia ? 'all-armenia' : 'regions'}
          onChange={(mode) => onChange({ servesAllArmenia: mode === 'all-armenia' })}
        />
        {form.servesAllArmenia ? (
          <Note>{siteT(language, `registrationFields.${nationwideNote}`)}</Note>
        ) : (
          <>
            <Text style={[type.label, { color: colors.text }]}>{siteT(language, 'serviceRegionPicker.label')}</Text>
            <Note>{siteT(language, 'serviceRegionPicker.hint')}</Note>
            <Chips
              options={regionOptions.map((o) => ({ value: o.value, label: o.label }))}
              selected={form.regionSlugs}
              onToggle={(slug) => onChange({ regionSlugs: toggle(form.regionSlugs, slug) })}
            />
          </>
        )}
        {errors.regionSlugs ? <Note tone="danger">{errors.regionSlugs}</Note> : null}
        {errors.citySlugs ? <Note tone="danger">{errors.citySlugs}</Note> : null}
      </>
    )
  }

  const maxAreas = maxAreasFor(form.regionSlugs)
  const used = countLimitedAreas(form.citySlugs.map(resolveAreaType))
  const limitReached = used >= maxAreas
  const hasChargeableRegion = form.regionSlugs.some((slug) => slug !== YEREVAN_REGION_SLUG)
  const isAreaDisabled = (slug: string) => !form.citySlugs.includes(slug) && resolveAreaType(slug) !== LocationType.District && limitReached

  const setRegions = (regionSlugs: string[]) => {
    // Places of a marz that is no longer chosen go with it — the website's
    // picker does the same, so no invisible tick survives.
    const keep = new Set(
      regionSlugs.flatMap((region) =>
        region === YEREVAN_REGION_SLUG
          ? getStaticDistricts().map((d) => d.slug)
          : [...getRegionCities(region).map((city) => city.slug), ...getRegionServiceZones(region).map((zone) => zone.slug)],
      ),
    )
    onChange({ regionSlugs, citySlugs: form.citySlugs.filter((slug) => keep.has(slug)) })
  }

  return (
    <>
      <Note>{siteT(language, 'registrationFields.citiesNoteText1')}</Note>
      <Note>{siteT(language, 'registrationFields.citiesNoteText2')}</Note>
      <Text style={[type.label, { color: colors.text }]}>{siteT(language, 'serviceAreaPicker.selectRegionsLabel')}</Text>
      <Chips
        options={regionOptions.map((o) => ({ value: o.value, label: o.label }))}
        selected={form.regionSlugs}
        onToggle={(slug) => setRegions(toggle(form.regionSlugs, slug))}
        isDisabled={() => form.regionSlugs.length >= MAX_REGIONS}
      />
      {errors.regionSlugs ? <Note tone="danger">{errors.regionSlugs}</Note> : null}

      {hasChargeableRegion ? (
        <Badge2
          text={`${siteT(language, 'serviceAreaPicker.counterText', { used, max: maxAreas })} ${
            used > maxAreas ? siteT(language, 'serviceAreaPicker.overLimitNote', { count: used - maxAreas }) : form.regionSlugs.includes(YEREVAN_REGION_SLUG) ? siteT(language, 'serviceAreaPicker.yerevanExemptNote') : ''
          }`}
          warn={used > maxAreas}
        />
      ) : null}

      {form.regionSlugs.map((regionSlug) => {
        const isYerevan = regionSlug === YEREVAN_REGION_SLUG
        const regionLabel = regionOptions.find((o) => o.value === regionSlug)?.label ?? regionSlug
        const places = isYerevan
          ? getStaticDistricts().map((d) => ({ value: d.slug, label: c.placeName('district', d.slug, d.name) }))
          : getRegionCities(regionSlug).map((city) => ({ value: city.slug, label: c.placeName('city', city.slug, city.name) }))
        const zones = isYerevan ? [] : getRegionServiceZones(regionSlug).map((zone) => ({ value: zone.slug, label: c.placeName('zone', zone.slug, zone.name) }))
        const allDistricts = isYerevan && places.every((p) => form.citySlugs.includes(p.value))
        return (
          <Card key={regionSlug}>
            <Text style={[type.bodyStrong, { color: colors.text }]}>{siteT(language, 'serviceAreaPicker.groupLabel', { region: regionLabel })}</Text>
            {isYerevan ? (
              <Checkbox
                label={siteT(language, 'serviceAreaPicker.wholeYerevanLabel')}
                value={allDistricts}
                onChange={(on) =>
                  onChange({
                    citySlugs: on ? [...new Set([...form.citySlugs, ...places.map((p) => p.value)])] : form.citySlugs.filter((slug) => !places.some((p) => p.value === slug)),
                  })
                }
              />
            ) : null}
            <Chips options={places} selected={form.citySlugs} onToggle={(slug) => onChange({ citySlugs: toggle(form.citySlugs, slug) })} isDisabled={isAreaDisabled} />
            {zones.length > 0 ? (
              <>
                <Text style={[type.label, { color: colors.text, marginTop: space.sm }]}>{siteT(language, 'serviceAreaPicker.zonesSublabel')}</Text>
                <Note>{siteT(language, 'serviceAreaPicker.zonesHint').replace(/^—\s*/, '')}</Note>
                <Chips options={zones} selected={form.citySlugs} onToggle={(slug) => onChange({ citySlugs: toggle(form.citySlugs, slug) })} isDisabled={isAreaDisabled} />
              </>
            ) : null}
          </Card>
        )
      })}
      {form.regionSlugs.length === 0 ? <Note>{t('forms.pickRegionFirst')}</Note> : null}
      {errors.citySlugs ? <Note tone="danger">{errors.citySlugs}</Note> : null}
    </>
  )
}

function Badge2({ text, warn }: { text: string; warn?: boolean }) {
  return (
    <View style={{ backgroundColor: warn ? colors.dangerSoft : colors.primarySoft, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 }}>
      <Text style={[type.small, { color: warn ? colors.danger : colors.primary, fontWeight: '600' }]}>{text}</Text>
    </View>
  )
}

const toggle = (list: readonly string[], value: string) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value])

// ─── Services & hours ──────────────────────────────────────────────────────

export function ServicesFields({ form, errors, onChange }: GroupProps) {
  const language = useLanguage()
  const c = catalog(language)
  const categories = serviceCategoriesFor(form.vehicleType)
  const providesInvoice = form.services.includes(ServiceType.InvoiceProvided)
  return (
    <>
      {errors.services ? <Note tone="danger">{errors.services}</Note> : null}
      {categories.map((category) => {
        const all = category.services.length > 0 && category.services.every((s) => form.services.includes(s))
        return (
          <Card key={category.key}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.sm }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[type.bodyStrong, { color: colors.text }]}>{c.categoryTitle(category)}</Text>
                <Text style={[type.small, { color: colors.textSecondary }]}>{c.categoryHint(category)}</Text>
              </View>
              <Pressable
                hitSlop={8}
                accessibilityRole="button"
                onPress={() =>
                  onChange({
                    services: all ? form.services.filter((s) => !category.services.includes(s as ServiceType)) : [...new Set([...form.services, ...category.services])],
                  })
                }
              >
                <Text style={[type.label, { color: colors.primaryLight }]}>{siteT(language, 'serviceCategories.selectAll')}</Text>
              </Pressable>
            </View>
            <Chips
              options={category.services.map((slug) => ({ value: slug, label: c.serviceLabel(slug) }))}
              selected={form.services}
              onToggle={(slug) => onChange({ services: toggle(form.services, slug) })}
            />
          </Card>
        )
      })}
      <Checkbox
        label={siteT(language, 'registrationFields.invoiceLabel')}
        hint={siteT(language, 'registrationFields.invoiceTooltipText')}
        value={providesInvoice}
        onChange={(on) => onChange({ services: withService(form.services, ServiceType.InvoiceProvided, on) })}
      />
      {!isAvailable247(form.services) ? (
        <View style={{ gap: space.sm }}>
          <Text style={[type.label, { color: colors.text }]}>{siteT(language, 'registrationFields.workingHoursLabel')}</Text>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <View style={{ flex: 1 }}>
              <Field label={siteT(language, 'registrationFields.workingHoursStartLabel')} placeholder="09:00" value={form.workingHoursStart} onChangeText={(v) => onChange({ workingHoursStart: timeMask(v) })} keyboardType="number-pad" maxLength={5} />
            </View>
            <View style={{ flex: 1 }}>
              <Field label={siteT(language, 'registrationFields.workingHoursEndLabel')} placeholder="20:00" value={form.workingHoursEnd} onChangeText={(v) => onChange({ workingHoursEnd: timeMask(v) })} keyboardType="number-pad" maxLength={5} />
            </View>
          </View>
          {errors.workingHours ? <Note tone="danger">{errors.workingHours}</Note> : null}
        </View>
      ) : null}
    </>
  )
}

// ─── Prices ────────────────────────────────────────────────────────────────

export function PricesFields({ form, errors, onChange }: GroupProps) {
  const language = useLanguage()
  const price = (key: 'priceCityCallout' | 'pricePerKm' | 'priceWaitingPerHour' | 'priceNightSurchargePercent' | 'priceExtraLoading', label: string, placeholder: string) => (
    <Field label={siteT(language, `registrationFields.${label}`)} value={form[key]} onChangeText={(v) => onChange({ [key]: v.replace(/\D/g, '') } as Partial<RegistrationFormState>)} keyboardType="number-pad" placeholder={placeholder} error={errors[key]} />
  )
  return (
    <>
      <Note>{siteT(language, 'registrationFields.pricesNote')}</Note>
      {price('priceCityCallout', 'priceCityCalloutLabel', '10000')}
      {price('pricePerKm', 'pricePerKmLabel', '300')}
      {price('priceWaitingPerHour', 'priceWaitingLabel', '3000')}
      {price('priceNightSurchargePercent', 'priceNightSurchargeLabel', '20')}
      {price('priceExtraLoading', 'priceExtraLoadingLabel', '5000')}
    </>
  )
}

// ─── Location ──────────────────────────────────────────────────────────────

/**
 * `CoordinatesInput.vue`: the website's guidance, plus the one thing a phone
 * can do better — use where it is right now (asks for location only on tap).
 */
export function LocationFields({ form, errors, onChange }: GroupProps) {
  const language = useLanguage()
  const t = useT()
  const [locating, setLocating] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  async function useHere() {
    setProblem(null)
    setLocating(true)
    try {
      const permission = await Location.requestForegroundPermissionsAsync()
      if (!permission.granted) {
        setProblem(t('register.baseNoPermission'))
        return
      }
      const here = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High })
      onChange({ coordinates: `${here.coords.latitude.toFixed(6)}, ${here.coords.longitude.toFixed(6)}` })
    } catch {
      setProblem(t('register.baseFailed'))
    } finally {
      setLocating(false)
    }
  }

  return (
    <>
      <Note>{siteT(language, 'coordinatesInput.intro')}</Note>
      <Button icon="pin" label={locating ? t('common.loading') : t('forms.useCurrentLocation')} busy={locating} onPress={() => void useHere()} />
      {problem ? <Note tone="warn">{problem}</Note> : null}
      <Card>
        <Text style={[type.bodyStrong, { color: colors.text }]}>{t('forms.orFromMaps')}</Text>
        {(['step1', 'step2', 'step3', 'step4', 'step5'] as const).map((step, i) => (
          <Text key={step} style={[type.small, { color: colors.textSecondary }]}>
            {i + 1}. {siteT(language, `coordinatesInput.${step}`)}
          </Text>
        ))}
        <Button variant="outline" size="sm" icon="globe" label={siteT(language, 'coordinatesInput.mapsLinkText')} onPress={() => void Linking.openURL('https://maps.google.com')} />
      </Card>
      <Field
        label={siteT(language, 'coordinatesInput.fieldLabel')}
        placeholder="40.177200, 44.512600"
        keyboardType="numbers-and-punctuation"
        autoCorrect={false}
        value={form.coordinates}
        onChangeText={(v) => onChange({ coordinates: v })}
        error={errors.coordinates}
        hint={siteT(language, 'coordinatesInput.hint')}
      />
      <Note>{siteT(language, 'coordinatesInput.fallbackNote')}</Note>
    </>
  )
}
