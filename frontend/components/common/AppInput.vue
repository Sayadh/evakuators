<script setup lang="ts">
/**
 * The `autocomplete` values this app has a use for, spelled as the HTML spec
 * spells them. A union rather than a bare `string` because every one of these
 * is a token a browser either recognises exactly or ignores entirely — a typo
 * (`current_password`, `newPassword`) is not an error anywhere, it just
 * silently turns the hint off again, which is the bug this prop exists to fix.
 *
 * `off` is included and is the honest value for a field that must never be
 * remembered — but note browsers increasingly ignore `off` on password fields
 * specifically, so it is a request, not a guarantee.
 */
type AutocompleteToken =
  | 'off'
  | 'name'
  | 'given-name'
  | 'family-name'
  | 'organization'
  | 'email'
  | 'tel'
  | 'username'
  | 'current-password'
  | 'new-password'
  | 'one-time-code'

interface Props {
  modelValue: string
  label?: string
  type?: 'text' | 'tel' | 'email' | 'number' | 'password' | 'date' | 'time'
  placeholder?: string
  required?: boolean
  error?: string
  /**
   * Short helper text rendered between the label and the field — for
   * explaining what a field means, not for validation (that's `error`).
   * Wired to the input via `aria-describedby` so screen readers announce it.
   */
  hint?: string
  maxlength?: number
  /**
   * Left undefined by default, which renders no attribute at all and lets the
   * browser guess — right for the many ordinary fields here (a truck's plate
   * number, a price) that no autofill category describes.
   *
   * It is NOT right for a credential field, and that is why this prop exists.
   * Without it a password manager cannot tell a login password from a new one,
   * so it either offers nothing or offers to overwrite a saved entry from the
   * change-password form. Chrome also logs a DOM warning naming the exact
   * token it expected. Every credential field in this app now passes one.
   */
  autocomplete?: AutocompleteToken
}

const props = withDefaults(defineProps<Props>(), {
  label: undefined,
  type: 'text',
  placeholder: '',
  required: false,
  error: undefined,
  hint: undefined,
  maxlength: undefined,
  autocomplete: undefined,
})

const emit = defineEmits<{ 'update:modelValue': [value: string]; blur: [] }>()

const id = useId()
const inputRef = ref<HTMLInputElement | null>(null)

function onInput(event: Event): void {
  emit('update:modelValue', (event.target as HTMLInputElement).value)
}

/**
 * Native <input type="time"/"date"> only pops the browser's picker UI when
 * you click the small calendar/clock glyph — clicking the rest of the field
 * just places a text cursor in a segment, which looks like nothing happened.
 * showPicker() makes a click anywhere in the field behave the same as
 * clicking the icon. Only valid for date/time-like input types (calling it
 * on type="text" etc. throws), and wrapped defensively since Safari only
 * added support fairly recently — worst case it just falls back to the
 * default (icon-only) behavior there.
 */
function onClick(): void {
  if (props.type !== 'time' && props.type !== 'date') return
  try {
    inputRef.value?.showPicker?.()
  } catch {
    // Unsupported in this browser — default icon-click behavior still works.
  }
}

/**
 * Which single characters each restricted field type accepts. Anything not
 * listed here never reaches the input at all.
 *
 * - `tel` — digits and the `+` of the country code.
 * - `number` — digits plus both decimal separators, because an Armenian
 *   keyboard/locale produces `,` where the value needs `.`; callers normalise
 *   it (see `toOptionalFloat`). Note this also blocks `e`, `-` and `+`, which
 *   `<input type="number">` otherwise happily accepts and then reports as an
 *   empty value — the classic "I typed something and the field says it's
 *   empty" bug. Every numeric field in this app is a positive quantity.
 */
const ALLOWED_KEYS: Partial<Record<NonNullable<Props['type']>, RegExp>> = {
  tel: /^[0-9+]$/,
  number: /^[0-9.,]$/,
}

/**
 * Keeps letters (and other junk) out of restricted fields at the keystroke,
 * rather than stripping them afterwards — a value that briefly appears and
 * then vanishes reads as a bug to the person typing.
 *
 * The two guards before the character test are what make this safe rather
 * than a trap, and both were learned the hard way:
 *
 * 1. **IME / soft-keyboard events.** Android's GBoard (and most mobile IMEs)
 *    report every keystroke as `key: 'Unidentified'` with `keyCode: 229`
 *    while composing — the real character only arrives later, in `input`.
 *    An allow-list therefore matches nothing on Android, and preventDefault()
 *    swallows the entire keystroke, making the field impossible to type into
 *    on a phone. This shipped once and broke the driver login on Android.
 * 2. **Named keys.** `key.length > 1` is exactly the set of non-printable
 *    keys — Backspace, Delete, Tab, Enter, Escape, Arrow*, Home, End,
 *    Shift, F1… — so testing the length covers all of them at once and
 *    can't fall out of date the way a hand-written key list does.
 *
 * What's left after those two guards is a single printable character from a
 * physical keyboard, which is the only thing we actually want to filter.
 * Modifier combos are let through so Cmd/Ctrl+A/C/V still work; pasted junk
 * is caught by the field's validator instead.
 */
function onKeydown(event: KeyboardEvent): void {
  const allowed = ALLOWED_KEYS[props.type]
  if (!allowed) return
  if (event.isComposing || event.keyCode === 229) return
  if (event.key.length !== 1) return
  if (event.ctrlKey || event.metaKey || event.altKey) return
  if (allowed.test(event.key)) return
  event.preventDefault()
}
</script>

<template>
  <div class="app-input">
    <label v-if="label" :for="id" class="app-input__label">
      {{ label }}<span v-if="required" class="app-input__required" aria-hidden="true"> *</span>
    </label>
    <p v-if="hint" :id="`${id}-hint`" class="app-input__hint">{{ hint }}</p>
    <input
      :id="id"
      ref="inputRef"
      class="app-input__field"
      :class="{ 'app-input__field--error': error }"
      :type="type"
      :value="modelValue"
      :placeholder="placeholder"
      :required="required"
      :maxlength="maxlength"
      :autocomplete="autocomplete"
      :aria-invalid="Boolean(error)"
      :aria-describedby="hint ? `${id}-hint` : undefined"
      @input="onInput"
      @blur="emit('blur')"
      @click="onClick"
      @keydown="onKeydown"
    >
    <p v-if="error" class="app-input__error" role="alert">{{ error }}</p>
  </div>
</template>

<style scoped lang="scss">
.app-input {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);

  &__label {
    font-size: 0.9rem;
    font-weight: 600;
  }

  &__required {
    color: var(--color-danger);
  }

  &__hint {
    margin: 0;
    font-size: 0.82rem;
    color: var(--color-text-muted);
  }

  &__field {
    width: 100%;
    padding: var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    font-size: 1rem;
    font-family: inherit;
    color: var(--color-text);
    background: var(--color-surface);
    transition: border-color var(--transition);

    &:hover,
    &:focus {
      border-color: var(--color-primary);
    }

    &--error {
      border-color: var(--color-danger);
    }

    // Remove native number spinner arrows everywhere this component is used.
    &[type='number'] {
      -moz-appearance: textfield;

      &::-webkit-inner-spin-button,
      &::-webkit-outer-spin-button {
        -webkit-appearance: none;
        margin: 0;
      }
    }
  }

  &__error {
    margin: 0;
    font-size: 0.82rem;
    color: var(--color-danger);
  }
}
</style>
