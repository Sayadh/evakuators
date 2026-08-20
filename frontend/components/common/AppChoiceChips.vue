<script setup lang="ts">
import type { SelectOption } from '~/types/common'

/**
 * A single choice, shown as a row of chips instead of a `<select>`.
 *
 * ## When to use this rather than `AppSelect`
 *
 * A dropdown hides its options until you open it, which is the right trade when
 * there are many of them (a marz, a city, a capacity band). It is the wrong one
 * when there are two or three and the choice **changes what the rest of the
 * form asks** — «Ամբողջ Հայաստան» vs «Ընտրված մարզերում» either shows a marz
 * picker or replaces it entirely. A driver who cannot see the alternative
 * without opening a menu does not know the alternative is there, and the
 * section below them appears and disappears for a reason they never saw.
 *
 * So: few options, visible consequence → chips. Many options, or a value that
 * is just a value → `AppSelect`.
 *
 * ## Radios underneath, on purpose
 *
 * The chips are `<label>`s over real `<input type="radio">`s in one named
 * group, not buttons with `aria-*` attributes bolted on. That is what gives
 * arrow-key navigation, the browser's own focus ring, form semantics and screen
 * reader behaviour for free — all of which a div-with-a-click-handler has to
 * reimplement, usually incompletely. The input is visually hidden, never
 * `display: none`, which would take it out of the tab order.
 */

const model = defineModel<string>({ required: true })

withDefaults(
  defineProps<{
    options: SelectOption[]
    /** Rendered as the fieldset's legend — omit when a heading already says it */
    label?: string
    /** A unique radio-group name; two groups on one page must not share one */
    name?: string
  }>(),
  { label: '', name: 'choice-chips' },
)
</script>

<template>
  <fieldset class="chips">
    <legend v-if="label" class="chips__legend">{{ label }}</legend>
    <div class="chips__row">
      <label
        v-for="option in options"
        :key="option.value"
        class="chips__chip"
        :class="{ 'chips__chip--active': model === option.value }"
      >
        <input
          v-model="model"
          type="radio"
          class="chips__input"
          :name="name"
          :value="option.value"
        >
        <span>{{ option.label }}</span>
      </label>
    </div>
  </fieldset>
</template>

<style scoped lang="scss">
.chips {
  border: none;
  padding: 0;
  margin: 0;

  &__legend {
    padding: 0;
    margin-bottom: var(--space-2);
    font-size: 0.9rem;
    font-weight: 600;
  }

  &__row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  &__chip {
    display: inline-flex;
    align-items: center;
    padding: var(--space-2) var(--space-4);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-full);
    background: var(--color-surface);
    color: var(--color-text);
    font-size: 0.9rem;
    font-weight: 600;
    cursor: pointer;
    transition:
      background var(--transition),
      border-color var(--transition),
      color var(--transition);

    &:hover {
      border-color: var(--color-primary);
    }

    &--active {
      background: var(--color-primary);
      border-color: var(--color-primary);
      color: #fff;
    }

    // The focus ring follows the hidden input, so keyboard users still see
    // which chip they are on.
    &:focus-within {
      outline: 2px solid var(--color-primary);
      outline-offset: 2px;
    }
  }

  &__input {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    padding: 0;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
    border: 0;
  }
}
</style>
