<script setup lang="ts">
import type { SelectOption } from '~/types/common'
import { buildCityOptions, buildRegionOptions, YEREVAN_REGION_SLUG } from '~/utils/geography'

/**
 * "Which marzes, and which of their cities/districts" — the coverage picker,
 * shared by the registration form and the driver's dashboard.
 *
 * It exists as a component rather than a composable because the markup is the
 * hard part: a max-2 region grid, then one clearly-labelled city group per
 * chosen region, each with its own "whole region" shortcut. Registration and
 * self-service have to offer *identical* choices — a driver who can pick
 * something at sign-up but not change it later, or vice versa, is exactly the
 * gap this whole feature set to closes.
 *
 * Not `useLocationPicker()`: that one is a single-region cascade for the Free
 * Routes start/end fields. This is a multi-select over up to two regions with
 * a many-to-many city selection underneath. Same static geography source
 * (`utils/geography.ts`), different shape — see docs/taxonomies.md.
 */

interface Props {
  /** Selected marz slugs, at most MAX_REGIONS */
  regions: string[]
  /** Selected city/district slugs across all chosen regions */
  cities: string[]
  regionsError?: string
  citiesError?: string
}

const props = withDefaults(defineProps<Props>(), {
  regionsError: '',
  citiesError: '',
})

const emit = defineEmits<{
  'update:regions': [value: string[]]
  'update:cities': [value: string[]]
}>()

/** A driver can cover at most this many marzes — e.g. Yerevan + Kotayk, or Lori + Armavir */
const MAX_REGIONS = 2

const regionOptions = computed<SelectOption[]>(() => buildRegionOptions())

interface CityGroup {
  regionSlug: string
  regionLabel: string
  /** Yerevan is a pseudo-region whose "cities" are its districts (see CLAUDE.md) */
  isYerevan: boolean
  options: SelectOption[]
}

/**
 * One checkbox group per selected marz, so a driver who picked e.g. Yerevan +
 * Kotayk sees two clearly-labeled lists instead of one merged, ambiguous one.
 * Labels only, derived from static geography — no request.
 */
const cityGroups = computed<CityGroup[]>(() =>
  props.regions.map((regionSlug) => ({
    regionSlug,
    regionLabel:
      regionOptions.value.find((option) => option.value === regionSlug)?.label ?? regionSlug,
    isYerevan: regionSlug === YEREVAN_REGION_SLUG,
    options: buildCityOptions(regionSlug),
  })),
)

function isRegionDisabled(slug: string): boolean {
  return !props.regions.includes(slug) && props.regions.length >= MAX_REGIONS
}

function toggleRegion(slug: string): void {
  if (props.regions.includes(slug)) {
    emit(
      'update:regions',
      props.regions.filter((item) => item !== slug),
    )
    // Drop only this region's own cities/districts — the other selected
    // region's picks (if any) must survive untouched.
    const dropped = new Set(buildCityOptions(slug).map((option) => option.value))
    emit(
      'update:cities',
      props.cities.filter((item) => !dropped.has(item)),
    )
    return
  }
  if (props.regions.length >= MAX_REGIONS) return
  emit('update:regions', [...props.regions, slug])
}

function toggleCity(slug: string): void {
  emit(
    'update:cities',
    props.cities.includes(slug)
      ? props.cities.filter((item) => item !== slug)
      : [...props.cities, slug],
  )
}

function isAllSelected(group: CityGroup): boolean {
  return (
    group.options.length > 0 &&
    group.options.every((option) => props.cities.includes(option.value))
  )
}

function toggleAll(group: CityGroup): void {
  const groupSlugs = group.options.map((option) => option.value)
  const without = props.cities.filter((item) => !groupSlugs.includes(item))
  emit('update:cities', isAllSelected(group) ? without : [...without, ...groupSlugs])
}
</script>

<template>
  <div class="area-picker">
    <p class="area-picker__label">
      Ընտրեք 1-2 մարզ<span class="area-picker__required" aria-hidden="true"> *</span>
    </p>
    <p v-if="regionsError" class="area-picker__error" role="alert">{{ regionsError }}</p>
    <div class="area-picker__grid">
      <AppCheckbox
        v-for="option in regionOptions"
        :key="option.value"
        :model-value="regions.includes(option.value)"
        :label="option.label"
        :disabled="isRegionDisabled(option.value)"
        @update:model-value="toggleRegion(option.value)"
      />
    </div>

    <div v-for="group in cityGroups" :key="group.regionSlug" class="area-picker__group">
      <p class="area-picker__label">
        {{ group.regionLabel }} —
        {{ group.isYerevan ? 'Սպասարկվող շրջաններ' : 'Սպասարկվող քաղաքներ'
        }}<span class="area-picker__required" aria-hidden="true"> *</span>
      </p>
      <AppCheckbox
        :model-value="isAllSelected(group)"
        :label="group.isYerevan ? 'Ամբողջ Երևանը' : 'Ամբողջ մարզը'"
        class="area-picker__all"
        @update:model-value="toggleAll(group)"
      />
      <div class="area-picker__grid">
        <AppCheckbox
          v-for="option in group.options"
          :key="option.value"
          :model-value="cities.includes(option.value)"
          :label="option.label"
          @update:model-value="toggleCity(option.value)"
        />
      </div>
    </div>

    <p v-if="cityGroups.length > 0 && citiesError" class="area-picker__error" role="alert">
      {{ citiesError }}
    </p>
  </div>
</template>

<style scoped lang="scss">
.area-picker {
  &__label {
    font-size: 0.9rem;
    font-weight: 600;
    margin-bottom: var(--space-2);
  }

  &__required {
    color: var(--color-danger);
  }

  &__error {
    margin: 0 0 var(--space-2);
    font-size: 0.85rem;
    color: var(--color-danger);
  }

  &__group {
    margin-top: var(--space-4);
  }

  &__all {
    padding-bottom: var(--space-2);
    margin-bottom: var(--space-2);
    border-bottom: 1px solid var(--color-border);
    font-weight: 700;
  }

  &__grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: var(--space-1);

    @media (min-width: 640px) {
      grid-template-columns: repeat(2, 1fr);
    }

    @media (min-width: 1024px) {
      grid-template-columns: repeat(3, 1fr);
    }
  }
}
</style>
