<script setup lang="ts">
import { parseCoordinates, type Coordinates } from '~/utils/coordinates'

/**
 * The edit-coordinates dialog, shared by the driver's dashboard and the admin
 * panel.
 *
 * ## Why one dialog for two audiences
 *
 * A driver correcting their own marker and an admin correcting it for them are
 * the same interaction with a different subject line. Two implementations would
 * be two places for the validation, the reset-on-open and the
 * don't-submit-twice rules to drift — and the admin copy is the one that gets
 * used least and noticed last. Same reasoning as `AnalyticsDashboard` serving
 * both `/dashboard` and `/admin` (see docs/analytics.md).
 *
 * ## Where the work happens
 *
 * This component owns the *input*: what is typed, whether it parses, and
 * whether the box is showing a stale value from last time it was open. The
 * parent owns the *request*: it receives `save` with two finished numbers,
 * calls its own repository, and reports back through `saving` and `error`.
 *
 * That split is what lets the driver page hit `PATCH /my/tow-truck/coordinates`
 * and the admin page hit `PATCH /admin/tow-trucks/:id/coordinates` without this
 * file knowing either endpoint exists.
 */
interface Props {
  modelValue: boolean
  title: string
  /**
   * Who this pair belongs to — the driver's name, shown only in the admin's
   * copy. An admin has a list of drivers open and needs the dialog to say which
   * one it is about; a driver editing their own profile does not.
   */
  subject?: string
  /**
   * The currently stored pair, already formatted (`formatCoordinates`). Empty
   * string when the truck has none yet.
   *
   * Read on open rather than bound with v-model: the dialog is a draft, and a
   * draft that writes back to its source as you type would mean cancelling
   * changed the value anyway.
   */
  initialValue?: string
  /** True while the parent's request is in flight — drives the button state */
  saving?: boolean
  /** Message from the parent's failed request; shown under the field like a validation error */
  error?: string
  /** Passed through to CoordinatesInput — see its `showGuidance` prop */
  showGuidance?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  subject: undefined,
  initialValue: '',
  saving: false,
  error: '',
  showGuidance: true,
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  save: [coordinates: Coordinates]
}>()

const value = ref(props.initialValue)
const localError = ref('')

/**
 * Reset on every open, not on close.
 *
 * Resetting on close would leave the box holding last time's text for as long
 * as the dialog is shut, and the moment a parent renders the dialog eagerly
 * (or a transition delays the unmount) that stale value is what the driver
 * sees for a frame. Seeding on open also means a save that succeeded is
 * reflected the next time it is opened, because `initialValue` has changed by
 * then.
 */
watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
    value.value = props.initialValue
    localError.value = ''
  },
)

/**
 * The parent's error is cleared by the parent; ours is cleared by typing. Both
 * render in the same slot under the field, because from the driver's side
 * "this isn't two numbers" and "the server refused this" are the same event:
 * the value did not get saved, and here is why.
 */
const shownError = computed(() => localError.value || props.error)

function onInput(next: string): void {
  value.value = next
  // Clearing as they type, rather than only on the next submit — an error
  // message that outlives the thing it described reads as the field being
  // permanently broken.
  if (localError.value) localError.value = ''
}

function cancel(): void {
  emit('update:modelValue', false)
}

/**
 * Parses first and emits only on success, so the parent never receives a
 * request it would have to reject — and so closing or cancelling can never
 * send anything, because nothing is sent until this runs.
 */
function save(): void {
  // Guard as well as `:disabled`: a double tap on a phone can land two clicks
  // before the disabled state paints, and the second one would be a second
  // identical PATCH.
  if (props.saving) return

  const parsed = parseCoordinates(value.value)
  if (!parsed.ok) {
    localError.value = parsed.error
    return
  }

  localError.value = ''
  emit('save', { latitude: parsed.latitude, longitude: parsed.longitude })
}
</script>

<template>
  <AppModal :model-value="modelValue" :title="title" @update:model-value="$emit('update:modelValue', $event)">
    <p v-if="subject" class="coordinates-dialog__subject">{{ subject }}</p>

    <CoordinatesInput
      :model-value="value"
      :show-guidance="showGuidance"
      :error="shownError"
      @update:model-value="onInput"
    />

    <div class="coordinates-dialog__actions">
      <AppButton variant="outline" :disabled="saving" @click="cancel">Չեղարկել</AppButton>
      <AppButton variant="success" :disabled="saving" @click="save">
        {{ saving ? 'Պահպանվում է…' : 'Պահպանել' }}
      </AppButton>
    </div>
  </AppModal>
</template>

<style scoped lang="scss">
.coordinates-dialog {
  &__subject {
    margin: 0 0 var(--space-3);
    font-weight: 600;
  }

  &__actions {
    display: flex;
    gap: var(--space-3);
    margin-top: var(--space-5);

    // Stacked and full-width below 480px, side by side above it. Two half-width
    // buttons on a narrow phone put "Չեղարկել" and "Պահպանել" a thumb's width
    // apart, which is the wrong distance for a destructive/constructive pair.
    flex-direction: column;

    @media (min-width: 480px) {
      flex-direction: row;
      justify-content: flex-end;
    }
  }
}
</style>
