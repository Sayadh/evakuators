<script setup lang="ts">
import {
  PRIVACY_CONSENT_CANCEL_LABEL,
  PRIVACY_CONSENT_CHECKBOX_LABEL,
  PRIVACY_CONSENT_CONFIRM_LABEL,
  PRIVACY_CONSENT_PARAGRAPHS,
  PRIVACY_CONSENT_POLICY_LINK_LABEL,
  PRIVACY_CONSENT_POLICY_SENTENCE_AFTER,
  PRIVACY_CONSENT_POLICY_SENTENCE_BEFORE,
  PRIVACY_CONSENT_TITLE,
} from '~/constants/privacyConsent'

/**
 * The one consent dialog, used by both flows.
 *
 * `/register` opens it when the driver submits and sends the request only once
 * it is confirmed; the dashboard opens it as a block an existing driver cannot
 * get past. They differ in what happens on cancel and in nothing else — which
 * is why this is one component with a `mandatory` prop rather than two
 * components that would drift apart the first time the wording changed.
 *
 * ## Why it is not built on AppModal
 *
 * `AppModal` has no focus trap, no Escape handling and a close button in the
 * corner. All three are wrong here:
 *
 * - A dialog whose whole purpose is an informed decision must not let Tab wander
 *   into the page behind it, where the driver would be reading and tabbing
 *   through a form they have not yet consented to submit.
 * - Escape and the corner ✕ are *dismissals* — they mean "never mind", which is
 *   a perfectly good answer to a photo lightbox and a meaningless one here. This
 *   dialog has exactly two answers and both are buttons; there is no third
 *   "closed it" state for a caller to interpret.
 *
 * Escape is therefore mapped to Cancel rather than swallowed: refusing to
 * respond to it at all traps a keyboard user, and silently closing would be a
 * dismissal by another name. Mapping it to the explicit refusal is the only
 * option that is both escapable and unambiguous.
 */
interface Props {
  modelValue: boolean
  /**
   * Dashboard mode. The overlay stops responding to backdrop clicks and the
   * cancel button says so more plainly — an existing driver who cancels is
   * signed out (see the dashboard), so a stray click on the backdrop must not
   * be able to do that to them.
   */
  mandatory?: boolean
  /** Disables both buttons while the caller's request is in flight */
  submitting?: boolean
  /** Shown above the buttons — the caller's API error, if any */
  error?: string
}

const props = withDefaults(defineProps<Props>(), {
  mandatory: false,
  submitting: false,
  error: '',
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  confirm: []
  cancel: []
}>()

/**
 * Starts unticked on every open, and is reset on close rather than only on
 * open. A dialog reopened after a failed submit must not come back with the box
 * already ticked from last time: the driver would then be one click from
 * consenting again without having re-read anything, and — worse — a dialog that
 * remembers a tick looks like consent that was never withdrawn.
 */
const accepted = ref(false)

const panel = ref<HTMLElement | null>(null)
const checkbox = ref<HTMLInputElement | null>(null)

/** Everything focusable inside the panel, in DOM order */
function focusables(): HTMLElement[] {
  if (!panel.value) return []
  return Array.from(
    panel.value.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  )
}

/**
 * The focus trap, on the panel's own keydown rather than on `document`.
 *
 * A document-level listener would have to work out whether the event came from
 * inside this dialog, and would fight with any other trap on the page. Scoping
 * it to the panel means the question never arises: if the event reached this
 * handler, focus was already inside, and the only job left is to stop Tab from
 * leaving at either end.
 */
function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    // Mapped to Cancel, not to a silent close — see the component comment.
    event.preventDefault()
    cancel()
    return
  }

  if (event.key !== 'Tab') return

  const items = focusables()
  if (items.length === 0) return

  const first = items[0]!
  const last = items[items.length - 1]!
  const active = document.activeElement

  // Wrap at both ends. Without the `shift` branch, Shift+Tab from the first
  // element escapes backwards into the page — a trap that only holds in one
  // direction is not a trap.
  if (event.shiftKey && active === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && active === last) {
    event.preventDefault()
    first.focus()
  }
}

/**
 * The element focus returns to when the dialog closes.
 *
 * Captured on open, because by the time it closes the button that opened it may
 * have been re-rendered or disabled. Without this, focus falls back to
 * `<body>` and a keyboard user lands at the very top of the page, having lost
 * their place in a form they were most of the way through.
 */
const previouslyFocused = ref<HTMLElement | null>(null)

watch(
  () => props.modelValue,
  async (open) => {
    if (!import.meta.client) return

    if (open) {
      previouslyFocused.value = document.activeElement as HTMLElement | null
      accepted.value = false
      // Same body-scroll lock AppModal applies, and for the same reason it
      // documents: without it a swipe over the dialog's own scrollable body
      // scrolls the page behind a `position: fixed` overlay.
      document.body.style.overflow = 'hidden'

      // After the panel exists. Focus goes to the CHECKBOX rather than to the
      // panel or to the confirm button: it is the control the dialog is about,
      // a screen reader announces the label the driver is agreeing to, and the
      // confirm button is disabled anyway until it is ticked.
      await nextTick()
      checkbox.value?.focus()
    } else {
      document.body.style.overflow = ''
      accepted.value = false
      previouslyFocused.value?.focus()
    }
  },
)

onUnmounted(() => {
  if (import.meta.client) document.body.style.overflow = ''
})

function confirm(): void {
  // Guarded even though the button is `:disabled`, because a disabled button is
  // a rendering decision and this is the actual rule. Cheap, and it means the
  // component cannot emit `confirm` without the box being ticked no matter how
  // the handler is reached.
  if (!accepted.value || props.submitting) return
  emit('confirm')
}

function cancel(): void {
  if (props.submitting) return
  emit('cancel')
  emit('update:modelValue', false)
}

/**
 * Backdrop clicks close the dialog only in the registration flow, where
 * cancelling costs nothing — the form is still there. In `mandatory` mode a
 * cancel signs the driver out, and doing that because of a mistimed click
 * beside the panel would be indefensible; that flow requires the button.
 */
function onOverlayClick(): void {
  if (props.mandatory) return
  cancel()
}
</script>

<template>
  <Teleport to="body">
    <Transition name="consent-fade">
      <div v-if="modelValue" class="consent__overlay" @click.self="onOverlayClick">
        <div
          ref="panel"
          class="consent__panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby="privacy-consent-title"
          aria-describedby="privacy-consent-body"
          @keydown="onKeydown"
        >
          <h2 id="privacy-consent-title" class="consent__title">{{ PRIVACY_CONSENT_TITLE }}</h2>

          <!-- The scrollable region, and the ONLY scrollable region. The
               buttons live outside it so they are reachable on a short phone
               without scrolling to the bottom of the text first — which is
               what turns a consent dialog into a scroll-hunt. -->
          <div id="privacy-consent-body" class="consent__body">
            <p v-for="paragraph in PRIVACY_CONSENT_PARAGRAPHS" :key="paragraph">
              {{ paragraph }}
            </p>

            <p>
              {{ PRIVACY_CONSENT_POLICY_SENTENCE_BEFORE
              }}<!-- `target="_blank"` is load-bearing, not a style choice: a
                   driver who has filled in a 40-field registration form and
                   follows a same-tab link loses all of it. `rel="noopener"`
                   because every new-tab link on this site carries it. -->
              <NuxtLink to="/privacy" target="_blank" rel="noopener" class="consent__link">
                {{ PRIVACY_CONSENT_POLICY_LINK_LABEL }}
              </NuxtLink>{{ PRIVACY_CONSENT_POLICY_SENTENCE_AFTER }}
            </p>
          </div>

          <label class="consent__check">
            <input
              ref="checkbox"
              v-model="accepted"
              type="checkbox"
              class="consent__check-input"
              :disabled="submitting"
            >
            <span class="consent__check-label">{{ PRIVACY_CONSENT_CHECKBOX_LABEL }}</span>
          </label>

          <p v-if="error" class="consent__error" role="alert">{{ error }}</p>

          <div class="consent__actions">
            <!-- Disabled until the box is ticked. The backend enforces the same
                 rule (`@Equals(true)` on the DTO) — this is the courtesy, that
                 is the boundary. -->
            <AppButton
              variant="accent"
              :disabled="!accepted || submitting"
              class="consent__confirm"
              @click="confirm"
            >
              {{ submitting ? 'Ուղարկվում է…' : PRIVACY_CONSENT_CONFIRM_LABEL }}
            </AppButton>
            <AppButton variant="outline" :disabled="submitting" @click="cancel">
              {{ PRIVACY_CONSENT_CANCEL_LABEL }}
            </AppButton>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped lang="scss">
.consent {
  &__overlay {
    position: fixed;
    inset: 0;
    background: rgba(13, 33, 54, 0.55);
    /* Above AppModal's 110: on the dashboard this may sit over other dialogs,
       and the one a driver must answer has to be the one on top. */
    z-index: 120;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-4);

    /* Full-bleed on a phone. A centred card with page padding wastes ~32px of
       a 360px screen on a dialog that is mostly text. */
    @media (max-width: 599px) {
      padding: 0;
      align-items: flex-end;
    }
  }

  &__panel {
    position: relative;
    display: flex;
    flex-direction: column;
    background: var(--color-surface);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
    padding: var(--space-5);
    max-width: 560px;
    width: 100%;
    /* The PANEL is capped, and its body scrolls inside it — so the checkbox and
       the buttons stay on screen however long the text gets. `dvh` rather than
       `vh` because mobile browser chrome makes `vh` taller than the visible
       viewport, which would push the buttons under the address bar. */
    max-height: 90dvh;

    @media (max-width: 599px) {
      padding: var(--space-4) var(--space-3) var(--space-3);
      border-radius: var(--radius-lg) var(--radius-lg) 0 0;
      max-height: 92dvh;
    }
  }

  &__title {
    font-size: 1.1rem;
    line-height: 1.4;
    margin-bottom: var(--space-3);
    padding-right: 0;
  }

  &__body {
    overflow-y: auto;
    /* Keeps the flex child from refusing to shrink below its content height,
       which is what makes `overflow-y` do nothing inside a flex column. */
    min-height: 0;
    color: var(--color-text-secondary);
    font-size: 0.92rem;
    line-height: 1.65;
    padding-right: var(--space-2);

    p {
      margin-bottom: var(--space-3);

      &:last-child {
        margin-bottom: 0;
      }
    }
  }

  &__link {
    color: var(--color-primary);
    text-decoration: underline;
    font-weight: 600;
  }

  &__check {
    display: flex;
    align-items: flex-start;
    gap: var(--space-2);
    margin-top: var(--space-4);
    padding: var(--space-3);
    background: var(--color-bg);
    border-radius: var(--radius-md);
    cursor: pointer;
    /* The label wraps to 3-4 lines on a phone; without this the text and the
       box drift apart as the block grows. */
    line-height: 1.5;
  }

  &__check-input {
    /* 20px, not the browser default ~13px: this is the single most important
       tap target in the flow and it must clear the 24px minimum comfortably
       once its padding is counted. */
    width: 20px;
    height: 20px;
    flex-shrink: 0;
    margin-top: 1px;
    accent-color: var(--color-primary);
    cursor: pointer;
  }

  &__check-label {
    font-size: 0.9rem;
    color: var(--color-text);
    font-weight: 500;
  }

  &__error {
    margin-top: var(--space-3);
    color: var(--color-danger, #c0392b);
    font-size: 0.9rem;
  }

  &__actions {
    display: flex;
    gap: var(--space-2);
    margin-top: var(--space-4);

    /* Stacked on a phone, confirm on top — the primary action should not be the
       one your thumb has to travel past the other to reach. */
    @media (max-width: 479px) {
      flex-direction: column;
    }
  }

  &__confirm {
    flex: 1;
  }
}

.consent-fade-enter-active,
.consent-fade-leave-active {
  transition: opacity 0.2s ease;
}

.consent-fade-enter-from,
.consent-fade-leave-to {
  opacity: 0;
}
</style>
