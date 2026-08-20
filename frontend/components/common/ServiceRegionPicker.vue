<script setup lang="ts">
import { buildRegionOptions } from '~/utils/geography'

/**
 * «Ընտրված մարզերում» — marz-level coverage, with no budget and no city list.
 *
 * ## Why this is not a mode inside `ServiceAreaPicker`
 *
 * That component is the coverage cap made visible: a max-2 region grid, one
 * city group per chosen marz, a counter, and checkboxes that grey out when the
 * budget runs down. Every one of those behaviours is the *opposite* of what an
 * uncapped driver needs, so folding this in would mean a component whose two
 * halves disagree about its central rule — and the rule is the thing that must
 * not blur (`constants/serviceAreaLimits.ts`).
 *
 * Keeping them separate also keeps the cap honest. `ServiceAreaPicker` still
 * has exactly one meaning, is still shared by registration and the dashboard
 * unchanged, and its tests still describe one behaviour.
 *
 * ## Marzes, not cities
 *
 * A crane truck covering Syunik covers Syunik — asking it to tick every
 * settlement would be asking for a list nobody maintains and the driver would
 * get wrong. The selection is stored as `serviceAreas` entries of
 * `type: 'region'`, which the two specialist listings match literally
 * (`TowTrucksRepository.buildWhere`) and no general listing does.
 *
 * The base location is unaffected and still required: this says where the truck
 * will GO, `citySlug`/`locationName`/the coordinates say where it IS, and the
 * nearest-driver search only ever answers the second.
 */

const model = defineModel<string[]>({ required: true })

withDefaults(defineProps<{ error?: string }>(), { error: '' })

const regionOptions = computed(() => buildRegionOptions())

function toggle(slug: string): void {
  model.value = model.value.includes(slug)
    ? model.value.filter((item) => item !== slug)
    : [...model.value, slug]
}
</script>

<template>
  <div class="region-picker">
    <p class="region-picker__label">
      Ընտրեք մարզերը, որտեղ սպասարկում եք<span class="region-picker__required" aria-hidden="true">
        *</span
      >
    </p>
    <p class="region-picker__hint">
      Քաղաքների քանակի սահմանափակում չկա — նշեք բոլոր մարզերը, որտեղ պատրաստ եք աշխատել։
    </p>
    <p v-if="error" class="region-picker__error" role="alert">{{ error }}</p>
    <div class="region-picker__grid">
      <AppCheckbox
        v-for="option in regionOptions"
        :key="option.value"
        :model-value="model.includes(option.value)"
        :label="option.label"
        @update:model-value="toggle(option.value)"
      />
    </div>
  </div>
</template>

<style scoped lang="scss">
.region-picker {
  &__label {
    font-size: 0.9rem;
    font-weight: 600;
    margin-bottom: var(--space-2);
  }

  &__required {
    color: var(--color-danger);
  }

  &__hint {
    margin: calc(-1 * var(--space-1)) 0 var(--space-2);
    font-size: 0.85rem;
    color: var(--color-text-muted);
  }

  &__error {
    margin: 0 0 var(--space-2);
    font-size: 0.85rem;
    color: var(--color-danger);
  }

  &__grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: var(--space-1);

    @media (min-width: 640px) {
      grid-template-columns: 1fr 1fr;
    }

    @media (min-width: 900px) {
      grid-template-columns: repeat(3, 1fr);
    }
  }
}
</style>
