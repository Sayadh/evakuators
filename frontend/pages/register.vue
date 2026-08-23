<script setup lang="ts">
import { imageRepository, isApiEnabled, registrationRepository } from '~/repositories'
import { CONTACT_PHONE, SITE_NAME } from '~/constants/site'
import { VEHICLE_TYPE_LABELS } from '~/constants/vehicles'
import { VehicleType } from '~/types/enums'
import { trackRegistrationSubmit } from '~/utils/analytics'
import type { Coordinates } from '~/utils/coordinates'
import { extractErrorMessage } from '~/utils/errors'
import { getPhoneHref } from '~/utils/formatPhone'
import {
  createRegistrationFormState,
  validateRegistrationForm,
} from '~/utils/registrationForm'

useSeoMetaData({
  title: `Գրանցել էվակուատոր | Միացեք հարթակին | ${SITE_NAME}`,
  description:
    'Գրանցեք ձեր էվակուատորը Evakuators.am հարթակում և ստացեք պատվերներ ձեր տարածքից։',
  path: '/register',
})

/**
 * The questions themselves live in `RegistrationFormFields.vue`, and their
 * state and rules in `utils/registrationForm.ts` — both shared with the admin
 * review page at `/admin/registrations/:id`, which renders this same form
 * pre-filled and submits the moderator's corrections as the published profile.
 *
 * What is left in this page is only what a driver has and a moderator does not:
 * the photo upload, and the thank-you dialog.
 */
const form = reactive(createRegistrationFormState())

const errors = reactive<Record<string, string>>({})

/** Photo filenames, page-local: they are not part of the shared form state
 * because the review page has nothing to upload — see RegistrationFormFields. */
const imageNames = reactive({ main: '', extra: [] as string[] })

const MAX_EXTRA_IMAGES = 5

const mainImageInput = ref<HTMLInputElement | null>(null)
const extraImagesInput = ref<HTMLInputElement | null>(null)

const mainImageFile = shallowRef<File | null>(null)
const extraImageFiles = shallowRef<File[]>([])

/**
 * Ids of the files already uploaded, in the same order as `selectedFiles()`.
 *
 * Uploading is a SEPARATE request per photo (POST /images), throttled at
 * 10/60s per IP, and the registration itself can legitimately be rejected
 * afterwards (duplicate phone, taken slug…). Re-uploading all 6 photos on
 * every retry therefore burns the whole budget on the second attempt and the
 * driver gets a 429 they can do nothing about for a minute — while the first
 * attempt's uploads sit orphaned in Storage until the nightly purge.
 *
 * So uploads are resumable: this survives a failed submit, and only resets
 * when the driver actually changes which files they picked (an id points at a
 * specific uploaded file, so a different selection invalidates all of them).
 */
const uploadedImageIds = ref<number[]>([])

function resetUploadedImages(): void {
  uploadedImageIds.value = []
}

// Local object URLs so the driver sees a thumbnail of what they picked
// before it's ever uploaded — revoked on replace/unmount to avoid leaking.
const mainImagePreview = ref<string | null>(null)
const extraImagePreviews = ref<string[]>([])

function onMainImageChange(event: Event): void {
  const input = event.target as HTMLInputElement
  mainImageFile.value = input.files?.[0] ?? null
  imageNames.main = mainImageFile.value?.name ?? ''
  resetUploadedImages()

  if (mainImagePreview.value) URL.revokeObjectURL(mainImagePreview.value)
  mainImagePreview.value = mainImageFile.value ? URL.createObjectURL(mainImageFile.value) : null
}

function onExtraImagesChange(event: Event): void {
  const input = event.target as HTMLInputElement
  extraImageFiles.value = Array.from(input.files ?? []).slice(0, MAX_EXTRA_IMAGES)
  imageNames.extra = extraImageFiles.value.map((file) => file.name)
  resetUploadedImages()

  extraImagePreviews.value.forEach((url) => URL.revokeObjectURL(url))
  extraImagePreviews.value = extraImageFiles.value.map((file) => URL.createObjectURL(file))
}

function removeMainImage(): void {
  mainImageFile.value = null
  imageNames.main = ''
  resetUploadedImages()

  if (mainImagePreview.value) URL.revokeObjectURL(mainImagePreview.value)
  mainImagePreview.value = null

  // Reset the native input too — otherwise re-picking the exact same file
  // wouldn't fire a "change" event and the removal would look permanent.
  if (mainImageInput.value) mainImageInput.value.value = ''
}

/** Only touches our own reactive state — the upload on submit reads from
 * extraImageFiles, never back from the native <input>'s FileList, so this
 * is enough on its own (see submitToApi below). */
function removeExtraImage(index: number): void {
  URL.revokeObjectURL(extraImagePreviews.value[index])

  extraImageFiles.value = extraImageFiles.value.filter((_, i) => i !== index)
  extraImagePreviews.value = extraImagePreviews.value.filter((_, i) => i !== index)
  imageNames.extra = imageNames.extra.filter((_, i) => i !== index)
  resetUploadedImages()
}

onBeforeUnmount(() => {
  if (mainImagePreview.value) URL.revokeObjectURL(mainImagePreview.value)
  extraImagePreviews.value.forEach((url) => URL.revokeObjectURL(url))
})

/**
 * The parsed pair from the last successful `validate()` — see
 * `validateRegistrationForm`, which does the parsing and hands it back so the
 * string is read exactly once.
 */
const parsedCoordinates = ref<Coordinates | null>(null)

function validate(): boolean {
  const shared = validateRegistrationForm(form, errors)
  parsedCoordinates.value = shared.coordinates

  // The one question this page asks that the shared form does not: a driver
  // must attach a main photo. The moderator's copy has no upload at all, which
  // is why it is checked here rather than in the shared validator.
  errors.mainImage = imageNames.main ? '' : 'Ավելացրեք գլխավոր նկարը'

  return shared.ok && !errors.mainImage
}

const isSuccessOpen = ref(false)
const isSubmitting = ref(false)
const submitError = ref('')

/**
 * The consent gate between «Ուղարկել հայտը» and the request actually going out.
 *
 * Opened only once the form VALIDATES — see `onSubmit`. Asking a driver to
 * consent and then telling them their phone number is malformed would make them
 * read and agree to a page of text before finding out they cannot submit yet,
 * which is both rude and, on a second attempt, a second consent dialog for one
 * act of registering.
 */
const isConsentOpen = ref(false)

/** The consent dialog's own error line — kept apart from `submitError`, which
 * belongs to the form and is rendered above the submit button on the page. */
const consentError = ref('')

/** Wipes the whole form back to a blank state after a successful submission
 * — fields, validation errors, selected files/previews, and the native file
 * inputs themselves (clearing those needs a direct DOM reset, resetting the
 * reactive state alone doesn't change what the browser shows in the input). */
function resetForm(): void {
  Object.assign(form, createRegistrationFormState())
  Object.keys(errors).forEach((key) => {
    errors[key] = ''
  })

  mainImageFile.value = null
  extraImageFiles.value = []
  imageNames.main = ''
  imageNames.extra = []
  // Those ids now belong to the submitted request — a second registration
  // must upload its own photos, not try to reattach already-attached ones.
  resetUploadedImages()
  // Same reasoning: the parsed pair belongs to the submission that just went
  // through, and leaving it behind would let a second submit reuse it if
  // validate() were ever bypassed.
  parsedCoordinates.value = null

  if (mainImagePreview.value) URL.revokeObjectURL(mainImagePreview.value)
  mainImagePreview.value = null
  extraImagePreviews.value.forEach((url) => URL.revokeObjectURL(url))
  extraImagePreviews.value = []

  if (mainImageInput.value) mainImageInput.value.value = ''
  if (extraImagesInput.value) extraImagesInput.value.value = ''

  if (import.meta.client) window.scrollTo({ top: 0, behavior: 'smooth' })
}

/** Main image first — the backend treats imageIds[0] as the primary photo */
function selectedFiles(): File[] {
  return [mainImageFile.value, ...extraImageFiles.value].filter(
    (file): file is File => file !== null,
  )
}

/** Uploads whatever isn't uploaded yet, then submits the request */
async function submitToApi(coordinates: Coordinates | null): Promise<void> {
  // Resumes from where the last attempt stopped — see uploadedImageIds. Each
  // id is committed to the array as soon as its upload returns, so a failure
  // halfway through (or a rejected submit afterwards) never costs the driver
  // the photos that already went up.
  for (const file of selectedFiles().slice(uploadedImageIds.value.length)) {
    const image = await imageRepository.upload(file)
    uploadedImageIds.value = [...uploadedImageIds.value, image.id]
  }

  const payload = buildRegistrationPayload(form, uploadedImageIds.value, coordinates)
  await registrationRepository.submit(payload)
}

/**
 * Pressing «Ուղարկել հայտը» validates and then asks for consent. It does NOT
 * send anything — see `onConsentConfirmed`, which is the only path to the API.
 *
 * The order matters: validate first, consent second. Reversed, a driver with a
 * mistyped phone number would read and agree to a page of text only to be told
 * they cannot submit yet, and would then have to consent a second time for what
 * is one act of registering.
 */
function onSubmit(): void {
  if (!validate()) {
    if (import.meta.client) window.scrollTo({ top: 0, behavior: 'smooth' })
    return
  }

  submitError.value = ''
  consentError.value = ''
  isConsentOpen.value = true
}

/**
 * The consent was given. This is the only place the registration is sent.
 *
 * ## Exactly one request per confirmation
 *
 * `isSubmitting` guards re-entry, and the dialog disables both its buttons
 * while it is true — so a double-tap on «Համաձայն եմ և շարունակում եմ» cannot
 * produce two registrations. That matters more here than on an ordinary form:
 * the duplicate-phone check would reject the second one with a confusing
 * "this number is already registered", pointing at the driver's own first
 * submission a second earlier.
 *
 * ## The dialog closes on success, and stays open on failure
 *
 * A failed submit leaves the driver in front of the dialog with the reason
 * rendered in it, one button away from retrying. Closing it would drop them
 * back on the form with an error above the submit button and no indication that
 * their consent had not been recorded either.
 */
async function onConsentConfirmed(): Promise<void> {
  if (isSubmitting.value) return

  // Null is a legitimate outcome: the driver left the box empty, and
  // `validate()` passed anyway. It is only ever null-because-unparseable when
  // validate() already returned false, so reaching here with null means
  // "no coordinates", never "bad coordinates".
  const coordinates = parsedCoordinates.value

  consentError.value = ''

  if (!isApiEnabled()) {
    // No backend configured — demo mode simply confirms the submission
    isConsentOpen.value = false
    trackRegistrationSubmit()
    isSuccessOpen.value = true
    resetForm()
    return
  }

  isSubmitting.value = true
  try {
    await submitToApi(coordinates)
    isConsentOpen.value = false
    trackRegistrationSubmit()
    isSuccessOpen.value = true
    resetForm()
  } catch (error) {
    consentError.value = extractErrorMessage(
      error,
      'Չհաջողվեց ուղարկել հայտը։ Ստուգեք կապը և փորձեք կրկին։',
    )
  } finally {
    isSubmitting.value = false
  }
}

/**
 * Cancelling costs nothing here — the form and every uploaded photo are still
 * exactly where they were, and the driver can submit again whenever they like.
 * Nothing is recorded, which is the point: a dialog that stored a "declined"
 * row would be tracking a decision nobody asked us to keep.
 *
 * This is the whole difference from the dashboard's copy of the same dialog,
 * where cancelling signs the driver out.
 */
function onConsentCancelled(): void {
  consentError.value = ''
}
</script>

<template>
  <div class="container register">
    <h1>Գրանցել էվակուատոր</h1>
    <p class="register__intro">
      Լրացրեք ձեր և մեքենայի տվյալները, և ձեր պրոֆիլը կհայտնվի հարթակում ստուգումից հետո։
    </p>

    <!-- Manipulator and heavy-duty registration is free; every other vehicle
         type (ordinary flatbed/sliding-platform evacuators) is paid. Placed
         before the form because it applies before the driver has even picked
         a vehicle type. -->
    <p class="register__notice">
      <strong>{{ VEHICLE_TYPE_LABELS[VehicleType.Manipulator] }}</strong> և
      <strong>{{ VEHICLE_TYPE_LABELS[VehicleType.HeavyDuty] }}</strong>
      գրանցումն անվճար է, մնացած տեսակների համար՝ վճարովի։ Հարցերի համար զանգահարեք
      <a :href="getPhoneHref(CONTACT_PHONE)">{{ CONTACT_PHONE }}</a>։
    </p>

    <form class="register__form" novalidate @submit.prevent="onSubmit">
      <!-- Every question below is shared, verbatim, with the moderator's copy
           of this form at /admin/registrations/:id — one component so the two
           can never come to ask different things. See the component's own
           header for why that matters. -->
      <RegistrationFormFields v-model="form" :errors="errors" />

      <fieldset class="register__section">
        <legend class="register__legend">Նկարներ</legend>
        <div class="register__grid">
          <div class="register__file">
            <label for="main-image">
              Գլխավոր նկար<span class="register__required" aria-hidden="true"> *</span>
            </label>
            <input
              id="main-image"
              ref="mainImageInput"
              type="file"
              accept="image/*"
              @change="onMainImageChange"
            >
            <span v-if="imageNames.main" class="register__file-name">{{
              imageNames.main
            }}</span>
            <div v-if="mainImagePreview" class="register__image-preview-wrap">
              <img :src="mainImagePreview" alt="" class="register__image-preview" >
              <button
                type="button"
                class="register__image-remove"
                aria-label="Հեռացնել նկարը"
                @click="removeMainImage"
              >
                <AppIcon name="close" :size="14" />
              </button>
            </div>
            <p v-if="errors.mainImage" class="register__error" role="alert">
              {{ errors.mainImage }}
            </p>
          </div>
          <div class="register__file">
            <label for="extra-images">Լրացուցիչ նկարներ (մինչև {{ MAX_EXTRA_IMAGES }})</label>
            <input
              id="extra-images"
              ref="extraImagesInput"
              type="file"
              accept="image/*"
              multiple
              @change="onExtraImagesChange"
            >
            <span v-if="imageNames.extra.length" class="register__file-name">
              {{ imageNames.extra.length }}/{{ MAX_EXTRA_IMAGES }} ֆայլ ընտրված է
            </span>
            <div v-if="extraImagePreviews.length" class="register__image-preview-grid">
              <div
                v-for="(preview, index) in extraImagePreviews"
                :key="index"
                class="register__image-preview-wrap"
              >
                <img :src="preview" alt="" class="register__image-preview" >
                <button
                  type="button"
                  class="register__image-remove"
                  aria-label="Հեռացնել նկարը"
                  @click="removeExtraImage(index)"
                >
                  <AppIcon name="close" :size="14" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </fieldset>

      <p v-if="submitError" class="register__error" role="alert">{{ submitError }}</p>

      <AppButton
        type="submit"
        variant="accent"
        size="lg"
        block
        :disabled="isSubmitting"
        class="register__submit"
      >
        {{ isSubmitting ? 'Ուղարկվում է…' : 'Ուղարկել հայտը' }}
      </AppButton>
    </form>

    <!-- Between the button and the request. Not `mandatory`: cancelling here
         costs nothing — the form and the uploaded photos are untouched — so a
         backdrop click is allowed to close it. The dashboard's copy of this
         same dialog is mandatory, because there cancelling signs the driver
         out. -->
    <PrivacyConsentDialog
      v-model="isConsentOpen"
      :submitting="isSubmitting"
      :error="consentError"
      @confirm="onConsentConfirmed"
      @cancel="onConsentCancelled"
    />

    <AppModal v-model="isSuccessOpen" title="Հայտն ընդունված է">
      <p>
        Շնորհակալություն։ Ձեր հայտը հաջողությամբ ուղարկվել է։ Մեր թիմը կստուգի տվյալները և
        կակտիվացնի ձեր պրոֆիլը։
      </p>
      <AppButton variant="primary" block @click="isSuccessOpen = false">Լավ, հասկանալի է</AppButton>
    </AppModal>
  </div>
</template>

<style scoped lang="scss">
/*
 * Only what is left in this page after the questions moved into
 * RegistrationFormFields.vue: the heading, the photo upload, the submit
 * button. Every rule for a field — the two-column grid inside a fieldset, the
 * phone hint, the checkbox row, the working-hours pair — lives with the markup
 * it styles, in that component, so a layout change cannot land on one of the
 * two forms and not the other.
 */
.register {
  padding-bottom: var(--space-7);
  max-width: 860px;

  &__intro {
    color: var(--color-text-secondary);
    max-width: 640px;
  }

  &__notice {
    max-width: 640px;
    margin-top: var(--space-3);
    padding: var(--space-3) var(--space-4);
    background: rgba(255, 193, 7, 0.12);
    border: 1px solid rgba(255, 193, 7, 0.4);
    border-radius: var(--radius-md);
    font-size: 0.9rem;
    line-height: 1.5;
    color: var(--color-text-secondary);

    a {
      color: var(--color-primary);
      font-weight: 600;
    }
  }

  &__form {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
    margin-top: var(--space-5);
  }

  &__section {
    border: none;
    margin: 0;
    background: var(--color-surface);
    border-radius: var(--radius-lg);
    padding: var(--space-5);
    box-shadow: var(--shadow-sm);
  }

  &__legend {
    font-size: 1.15rem;
    font-weight: 700;
    padding: 0;
    margin-bottom: var(--space-4);
  }

  &__grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: var(--space-4);

    @media (min-width: 640px) {
      grid-template-columns: 1fr 1fr;
    }
  }










  &__required {
    color: var(--color-danger);
  }




  &__file {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);

    label {
      font-size: 0.9rem;
      font-weight: 600;
    }

    input {
      font-size: 0.9rem;
    }
  }

  &__file-name {
    font-size: 0.82rem;
    color: var(--color-text-muted);
  }

  &__image-preview {
    display: block;
    width: 96px;
    height: 96px;
    object-fit: cover;
    border-radius: var(--radius-md, 10px);
    border: 1px solid var(--color-border, rgba(0, 0, 0, 0.08));
  }

  &__image-preview-wrap {
    position: relative;
    width: 96px;
  }

  &__image-remove {
    position: absolute;
    top: -6px;
    right: -6px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    border: 2px solid var(--color-surface);
    border-radius: 50%;
    background: var(--color-danger);
    color: #fff;
    cursor: pointer;
    box-shadow: var(--shadow-sm);
    transition: background var(--transition);

    &:hover {
      background: #c0392b;
    }
  }

  &__image-preview-grid {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
  }


  &__error {
    color: var(--color-danger);
    font-size: 0.9rem;
    margin-bottom: var(--space-3);
  }

  &__submit {
    @media (min-width: 640px) {
      align-self: flex-start;
      width: auto;
    }
  }
}
</style>
