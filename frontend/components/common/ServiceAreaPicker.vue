<script setup lang="ts">
import type { SelectOption } from '~/types/common'
import {
  countLimitedAreas,
  MAX_REGIONS,
  maxAreasFor,
} from '~/constants/serviceAreaLimits'
import { LocationType } from '~/types/enums'
import {
  buildRegionOptions,
  getRegionCities,
  getRegionServiceZones,
  getStaticDistricts,
  resolveAreaType,
  YEREVAN_REGION_SLUG,
} from '~/utils/geography'

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

const regionOptions = computed<SelectOption[]>(() => buildRegionOptions())

/**
 * The budget and how much of it is spent.
 *
 * Yerevan's districts are exempt — see `constants/serviceAreaLimits.ts` for the
 * rule and why a road corridor costs the same as a city. Counted from resolved
 * types rather than by asking which region a slug belongs to, so the counter
 * and the validator can never disagree about a given tick.
 */
const maxAreas = computed(() => maxAreasFor(props.regions))

const usedAreas = computed(() => countLimitedAreas(props.cities.map(resolveAreaType)))

const limitReached = computed(() => usedAreas.value >= maxAreas.value)

const isYerevanChosen = computed(() => props.regions.includes(YEREVAN_REGION_SLUG))

const isOverLimit = computed(() => usedAreas.value > maxAreas.value)

/** So the pages can block their own submit with the same rule the picker draws */
defineExpose({ isOverLimit })

/**
 * A slug that is already ticked is never disabled, whatever the count says —
 * otherwise reaching the cap would trap a driver with no way to change their
 * mind, which is the one thing a cap must not do.
 */
function isAreaDisabled(slug: string): boolean {
  if (props.cities.includes(slug)) return false
  if (resolveAreaType(slug) === LocationType.District) return false
  return limitReached.value
}

interface CityGroup {
  regionSlug: string
  regionLabel: string
  /** Yerevan is a pseudo-region whose "cities" are its districts (see CLAUDE.md) */
  isYerevan: boolean
  /** Cities, or Yerevan's districts — actual settlements */
  options: SelectOption[]
  /**
   * Road corridors of the same marz, kept apart from `options` rather than
   * appended to it. They are a different kind of answer: «Գառնի–Գեղարդ» is a
   * road, matched on its own slug and implying nothing about the places along
   * it, so a driver has to be able to see which of their ticks is which. Empty
   * for Yerevan.
   */
  zones: SelectOption[]
}

/**
 * One checkbox group per selected marz, so a driver who picked e.g. Yerevan +
 * Kotayk sees two clearly-labeled lists instead of one merged, ambiguous one.
 * Labels only, derived from static geography — no request.
 */
const cityGroups = computed<CityGroup[]>(() =>
  props.regions.map((regionSlug) => {
    const isYerevan = regionSlug === YEREVAN_REGION_SLUG
    return {
      regionSlug,
      regionLabel:
        regionOptions.value.find((option) => option.value === regionSlug)?.label ?? regionSlug,
      isYerevan,
      // Built from the data helpers rather than `buildCityOptions()`, which
      // returns one flat list with the corridors suffixed — right for a plain
      // `<select>`, wrong here where the two are rendered as separate groups.
      options: isYerevan
        ? getStaticDistricts().map((district) => ({ value: district.slug, label: district.name }))
        : getRegionCities(regionSlug).map((city) => ({ value: city.slug, label: city.name })),
      zones: isYerevan
        ? []
        : getRegionServiceZones(regionSlug).map((zone) => ({
            value: zone.slug,
            label: zone.name,
          })),
    }
  }),
)

/** Everything selectable under one marz — both sub-groups, for the "all" toggle */
function groupSlugs(group: CityGroup): string[] {
  return [...group.options, ...group.zones].map((option) => option.value)
}

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
    const dropped = new Set([
      ...(slug === YEREVAN_REGION_SLUG
        ? getStaticDistricts().map((district) => district.slug)
        : getRegionCities(slug).map((city) => city.slug)),
      ...getRegionServiceZones(slug).map((zone) => zone.slug),
    ])
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
  if (props.cities.includes(slug)) {
    emit(
      'update:cities',
      props.cities.filter((item) => item !== slug),
    )
    return
  }
  // Guard the emit as well as the checkbox. `disabled` is markup; this is the
  // rule. A keyboard event or a programmatic call must not be able to spend
  // budget the driver does not have.
  if (isAreaDisabled(slug)) return
  emit('update:cities', [...props.cities, slug])
}

function isAllSelected(group: CityGroup): boolean {
  const slugs = groupSlugs(group)
  return slugs.length > 0 && slugs.every((slug) => props.cities.includes(slug))
}

/**
 * "Whole region" survives only for Yerevan.
 *
 * For a marz it used to tick every city at once, which is now the one thing the
 * budget forbids — a shortcut that can only ever produce an invalid selection
 * is worse than no shortcut, because the driver has to undo it before they can
 * save. Yerevan keeps it because its districts are exempt, so "all of Yerevan"
 * is both meaningful and always valid.
 */
function toggleAll(group: CityGroup): void {
  if (!group.isYerevan) return
  const slugs = groupSlugs(group)
  const without = props.cities.filter((item) => !slugs.includes(item))
  emit('update:cities', isAllSelected(group) ? without : [...without, ...slugs])
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

    <!-- The budget, stated before the lists rather than after them: a driver
         who reads it first understands why options grey out, instead of
         discovering it by clicking a checkbox that does nothing. Yerevan's own
         districts are exempt, which the hint says plainly so an all-Yerevan
         driver does not go looking for the counter to move. -->
    <p
      v-if="cityGroups.length > 0"
      class="area-picker__counter"
      :class="{ 'area-picker__counter--over': isOverLimit }"
      aria-live="polite"
    >
      Ընտրված է {{ usedAreas }}-ը՝ հասանելի {{ maxAreas }}-ից
      <span v-if="isYerevanChosen" class="area-picker__hint">
        — Երևանի շրջանները չեն հաշվվում
      </span>
      <!-- Reachable without cheating: pick two marzes and five cities, drop one
           marz, then add Yerevan — the budget falls to 2 while the ticks
           survive. Nothing is removed automatically; a driver's own choices are
           not ours to delete silently. The counter turns red, saving is blocked
           with the same message, and they decide which ticks to keep. -->
      <span v-if="isOverLimit" class="area-picker__over">
        — հեռացրեք {{ usedAreas - maxAreas }}-ը շարունակելու համար
      </span>
    </p>

    <div v-for="group in cityGroups" :key="group.regionSlug" class="area-picker__group">
      <p class="area-picker__label">
        {{ group.regionLabel }} — Սպասարկվող տարածքներ<span
          class="area-picker__required"
          aria-hidden="true"
        >
          *</span
        >
      </p>
      <AppCheckbox
        v-if="group.isYerevan"
        :model-value="isAllSelected(group)"
        label="Ամբողջ Երևանը"
        class="area-picker__all"
        @update:model-value="toggleAll(group)"
      />
      <div class="area-picker__grid">
        <AppCheckbox
          v-for="option in group.options"
          :key="option.value"
          :model-value="cities.includes(option.value)"
          :label="option.label"
          :disabled="isAreaDisabled(option.value)"
          @update:model-value="toggleCity(option.value)"
        />
      </div>

      <!-- Road corridors, in their own labelled block. A driver ticking
           «Գառնի–Գեղարդ» is answering a different question than one ticking
           «Աբովյան», and the hint says so plainly: this is the road, not the
           settlements on it. -->
      <template v-if="group.zones.length > 0">
        <p class="area-picker__sublabel">
          Հավելյալ սպասարկման ուղղություններ
          <span class="area-picker__hint">
            — այս ուղղություններն օգնում են հաճախորդներին ավելի հեշտ գտնել տվյալ տարածքին մոտ գտնվող
            էվակուատորներին։ Եթե սպասարկում եք նշված ուղղություններից որևէ մեկը, խնդրում ենք ընտրել
            այն։
          </span>
        </p>
        <div class="area-picker__grid">
          <AppCheckbox
            v-for="zone in group.zones"
            :key="zone.value"
            :model-value="cities.includes(zone.value)"
            :label="zone.label"
            :disabled="isAreaDisabled(zone.value)"
            @update:model-value="toggleCity(zone.value)"
          />
        </div>
      </template>
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

  &__sublabel {
    font-size: 0.85rem;
    font-weight: 600;
    margin: var(--space-3) 0 var(--space-2);
  }

  &__hint {
    font-weight: 400;
    color: var(--color-text-muted);
  }

  &__counter {
    margin: var(--space-3) 0 0;
    font-size: 0.85rem;
    font-weight: 600;

    &--over {
      color: var(--color-danger);
    }
  }

  &__over {
    font-weight: 400;
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
