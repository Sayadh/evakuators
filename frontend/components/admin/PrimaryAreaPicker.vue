<script setup lang="ts">
import {
  basePlaceCandidates,
  composeLocationName,
  primaryPlaceOptions,
  primaryRegionOptions,
  regionOfCandidate,
  type PrimaryAreaCandidate,
} from '~/utils/primaryArea'

/**
 * Picks a tow truck's **base**: marz → settlement, plus an optional village.
 *
 * Shared by the two admin surfaces that set it — the approval modal and the
 * per-truck editor — for the same reason `ServiceAreaPicker` is shared between
 * registration and the dashboard: two copies of this would be two places for
 * the label composition and the corridor exclusion to drift, and the label is
 * the one thing the backend can never rebuild.
 *
 * ## Only the driver's own areas are offered
 *
 * `candidates` is the truck's served-areas list, not the country. A base the
 * driver does not serve would rank them FIRST on a town's page (city listings
 * put locally-based drivers above everyone else) while being the one driver who
 * never agreed to go there. The backend rejects it too; this is what stops it
 * being offered in the first place.
 *
 * The marz select is therefore built from those areas as well, so it can never
 * offer a marz whose settlement select would then be empty.
 */
const props = defineProps<{
  /** The truck's served areas — corridors are filtered out internally */
  candidates: PrimaryAreaCandidate[]
  /** Chosen settlement slug, '' when nothing is picked yet */
  slug: string
  /** Optional village free text */
  settlement: string
  error?: string
}>()

const emit = defineEmits<{
  'update:slug': [value: string]
  'update:settlement': [value: string]
}>()

const places = computed(() => basePlaceCandidates(props.candidates))
const regionOptions = computed(() => primaryRegionOptions(props.candidates))

/**
 * Derived from the chosen slug rather than held as its own ref: the marz is a
 * *view* of the settlement, so storing it separately means two sources for one
 * fact and a state where they disagree (marz Lori, settlement Abovyan).
 *
 * The local ref only carries the case the slug cannot express — an admin who
 * has picked a marz but not yet a settlement.
 */
const pendingRegion = ref('')

const regionSlug = computed({
  get: () => {
    const chosen = places.value.find((area) => area.slug === props.slug)
    return chosen ? (regionOfCandidate(chosen) ?? '') : pendingRegion.value
  },
  set: (value: string) => {
    pendingRegion.value = value
    // Clearing the settlement is what makes the pair impossible to desync: the
    // old settlement belongs to the old marz, so keeping it would leave the two
    // selects describing different places until the admin noticed.
    if (props.slug) emit('update:slug', '')
  },
})

const placeOptions = computed(() =>
  regionSlug.value ? primaryPlaceOptions(props.candidates, regionSlug.value) : [],
)

const chosenName = computed(
  () => places.value.find((area) => area.slug === props.slug)?.name ?? '',
)

/**
 * Exactly what will be stored and shown on every card. Rendered because the
 * composition is not obvious from two selects and a text box — an admin
 * typing «Շատվան» should see «Վարդենիս, գյուղ Շատվան» before they save, not
 * after.
 */
const preview = computed(() =>
  chosenName.value ? composeLocationName(chosenName.value, props.settlement) : '',
)

/**
 * A driver whose entire coverage is road corridors has no possible base. Said
 * out loud rather than rendered as two empty selects, which would read as a
 * loading bug.
 */
const hasNoCandidates = computed(() => places.value.length === 0)
</script>

<template>
  <div class="primary-area">
    <p v-if="hasNoCandidates" class="primary-area__empty">
      Այս վարորդի սպասարկվող տարածքները միայն ուղղություններ են, ուստի հիմնական
      բնակավայր հնարավոր չէ նշել։ Նախ ավելացրեք քաղաք կամ շրջան։
    </p>

    <template v-else>
      <AppSelect
        v-model="regionSlug"
        label="Մարզ"
        placeholder="Ընտրել մարզը"
        :options="regionOptions"
      />

      <AppSelect
        :model-value="slug"
        label="Հիմնական քաղաք / շրջան"
        :placeholder="regionSlug ? 'Ընտրել բնակավայրը' : 'Նախ ընտրեք մարզը'"
        :options="placeOptions"
        :disabled="!regionSlug"
        :error="error"
        @update:model-value="emit('update:slug', $event)"
      />

      <AppInput
        :model-value="settlement"
        label="Գյուղ (ոչ պարտադիր)"
        placeholder="Օր.՝ Շատվան — եթե վարորդը կանգնում է գյուղում"
        :maxlength="40"
        @update:model-value="emit('update:settlement', $event)"
      />

      <p v-if="preview" class="primary-area__preview">
        Քարտի վրա կերևա՝ <strong>{{ preview }}</strong>
      </p>
    </template>
  </div>
</template>

<style scoped lang="scss">
.primary-area {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);

  &__empty {
    margin: 0;
    font-size: 0.85rem;
    color: var(--color-danger);
  }

  &__preview {
    margin: 0;
    font-size: 0.85rem;
    color: var(--color-text-secondary);
  }
}
</style>
