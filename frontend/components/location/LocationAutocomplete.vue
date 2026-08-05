<script setup lang="ts">
import {
  needsRegionLabel,
  searchLocations,
  type LocationSearchResult,
} from '~/utils/locationSearch'

/**
 * Free-text location search over cities, Yerevan districts, road corridors and
 * settlements.
 *
 * ## Why this exists next to the region → area cascade
 *
 * The cascade answers "show me everything in Kotayk". It cannot answer «Պտղնի»,
 * because a village is not an option in either select — and a visitor whose car
 * broke down in Պտղնի types the village name, not the name of the nearest town
 * they may not know. This gives them one box that reaches all four datasets,
 * including the aliases already in the data (`ptxni`, `ejmiatsin`, `masiv`).
 *
 * ## Cost
 *
 * `searchLocations()` reads a module-scope index built once at import — no work
 * per keystroke beyond a scan of ~800 short strings, and no request at all,
 * since every location is static frontend data. The debounce below is therefore
 * not about protecting a backend; it exists so a fast typist does not re-render
 * the list on every character.
 */

const SEARCH_DEBOUNCE_MS = 180
const MIN_QUERY_LENGTH = 2

const router = useRouter()

const query = ref('')
const results = shallowRef<LocationSearchResult[]>([])
const isOpen = ref(false)
/** Index into `results`; -1 means "nothing highlighted, Enter does nothing" */
const activeIndex = ref(-1)

const listboxId = useId()
const optionId = (index: number): string => `${listboxId}-option-${index}`

let debounceTimer: ReturnType<typeof setTimeout> | undefined

function runSearch(): void {
  results.value = searchLocations(query.value)
  activeIndex.value = results.value.length > 0 ? 0 : -1
  isOpen.value = results.value.length > 0
}

watch(query, (value) => {
  clearTimeout(debounceTimer)
  if (value.trim().length < MIN_QUERY_LENGTH) {
    results.value = []
    isOpen.value = false
    activeIndex.value = -1
    return
  }
  debounceTimer = setTimeout(runSearch, SEARCH_DEBOUNCE_MS)
})

onBeforeUnmount(() => clearTimeout(debounceTimer))

function go(result: LocationSearchResult): void {
  isOpen.value = false
  query.value = ''
  results.value = []
  router.push(result.route)
}

function move(delta: number): void {
  if (results.value.length === 0) return
  isOpen.value = true
  const next = activeIndex.value + delta
  // Wraps, so ArrowUp from the first option lands on the last — the behaviour
  // a keyboard user expects from a listbox.
  activeIndex.value = (next + results.value.length) % results.value.length
}

function onEnter(): void {
  const result = results.value[activeIndex.value]
  if (result) go(result)
}

function close(): void {
  isOpen.value = false
  activeIndex.value = -1
}

/**
 * Closing on plain blur would fire before a click on an option registers, so
 * the list would vanish under the cursor. `relatedTarget` says where focus
 * went: still inside the widget means keep it open.
 */
function onFocusOut(event: FocusEvent): void {
  const root = event.currentTarget as HTMLElement | null
  if (!root?.contains(event.relatedTarget as Node | null)) close()
}

/** Only shown when it disambiguates — «Ակունք» exists in two marzes */
function subtitle(result: LocationSearchResult): string {
  const kind =
    result.type === 'zone'
      ? 'ուղղություն'
      : result.type === 'settlement'
        ? 'բնակավայր'
        : result.type === 'district'
          ? 'վարչական շրջան'
          : 'քաղաք'

  return needsRegionLabel(results.value, result) ? `${kind} · ${result.regionName}` : kind
}
</script>

<template>
  <div class="location-autocomplete" @focusout="onFocusOut">
    <label class="location-autocomplete__label" :for="`${listboxId}-input`">
      Որոնել բնակավայր
    </label>
    <div class="location-autocomplete__field">
      <AppIcon name="search" :size="18" class="location-autocomplete__icon" />
      <input
        :id="`${listboxId}-input`"
        v-model="query"
        type="text"
        class="location-autocomplete__input"
        placeholder="Օր.՝ Պտղնի, Աբովյան, Գառնի"
        autocomplete="off"
        role="combobox"
        aria-autocomplete="list"
        :aria-expanded="isOpen"
        :aria-controls="listboxId"
        :aria-activedescendant="activeIndex >= 0 ? optionId(activeIndex) : undefined"
        @keydown.down.prevent="move(1)"
        @keydown.up.prevent="move(-1)"
        @keydown.enter.prevent="onEnter"
        @keydown.esc="close"
      >
    </div>

    <ul
      v-if="isOpen"
      :id="listboxId"
      class="location-autocomplete__list"
      role="listbox"
      aria-label="Որոնման արդյունքներ"
    >
      <li
        v-for="(result, index) in results"
        :id="optionId(index)"
        :key="result.key"
        role="option"
        :aria-selected="index === activeIndex"
        class="location-autocomplete__option"
        :class="{ 'location-autocomplete__option--active': index === activeIndex }"
        @mouseenter="activeIndex = index"
        @mousedown.prevent="go(result)"
      >
        <span class="location-autocomplete__name">{{ result.name }}</span>
        <span class="location-autocomplete__meta">{{ subtitle(result) }}</span>
      </li>
    </ul>
  </div>
</template>

<style scoped lang="scss">
.location-autocomplete {
  position: relative;

  &__label {
    display: block;
    font-size: 0.9rem;
    font-weight: 600;
    margin-bottom: var(--space-2);
  }

  &__field {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: 0 var(--space-3);
    background: #fff;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
  }

  &__icon {
    color: var(--color-text-muted);
    flex-shrink: 0;
  }

  &__input {
    flex: 1;
    min-width: 0;
    border: none;
    outline: none;
    background: transparent;
    padding: var(--space-3) 0;
    font-size: 1rem;
    font-family: inherit;
  }

  &__list {
    position: absolute;
    z-index: 20;
    top: calc(100% + var(--space-1));
    left: 0;
    right: 0;
    max-height: 320px;
    overflow-y: auto;
    list-style: none;
    margin: 0;
    padding: var(--space-1);
    background: #fff;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-md);
  }

  &__option {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-sm);
    cursor: pointer;

    &--active {
      background: var(--color-bg);
    }
  }

  &__name {
    font-weight: 600;
    font-size: 0.95rem;
  }

  &__meta {
    font-size: 0.8rem;
    color: var(--color-text-muted);
  }
}
</style>
