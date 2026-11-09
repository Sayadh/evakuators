<script setup lang="ts">
import { staticCities } from '~/data/cities'
import { staticDistricts } from '~/data/districts'
import { getCityRoute, getDistrictRoute, getRegionRoute, getYerevanRoute } from '~/utils/routeHelpers'

/** Static copy lives in i18n/locales; place names in i18n/placeNames.ts */
const { t, locale } = useI18n()
const plural = usePlural()
const placeName = usePlaceName()

const { data: regions, pending } = useRegions()
// Distinct trucks serving Yerevan (servesYerevan) — NOT a sum of each
// district's own towTruckCount, which double(/12x)-counts a single truck
// that lists many districts as its service area.
//
// Counted from the shared coverage response, not from the Yerevan listing: this
// tile shows a number, so fetching the trucks themselves just to read `.length`
// is exactly what the coverage endpoint exists to avoid.
const { data: yerevanTruckCount } = useYerevanTowTruckCount()

interface AreaCard {
  key: string
  name: string
  to: string
  truckCount: number
  /** Every town of the marz (every district, for Yerevan), each a direct link */
  places: { slug: string; label: string; to: string }[]
}

/**
 * Every card lists ALL of its towns as links, so a visitor reaches their town's
 * drivers in one tap instead of two — and the card is a complete answer to
 * "is my town covered?" without opening it.
 *
 * Ordered by how many towns a card lists, most first, with Yerevan (twelve
 * districts) leading. A card's height follows its list, and grid rows take the
 * height of their tallest card, so neighbours with similar lists are what keeps
 * the rows even — at 2, 3 or 4 columns alike. Ties go to the marz with more
 * drivers, then alphabetically, so the order never depends on API order.
 */
const cards = computed<AreaCard[]>(() => {
  const yerevan: AreaCard = {
    key: 'yerevan',
    name: t('footer.yerevan'),
    to: getYerevanRoute(),
    truckCount: yerevanTruckCount.value,
    places: staticDistricts.map((district) => ({
      slug: district.slug,
      label: placeName('district', district.slug, district.name),
      to: getDistrictRoute(district.slug),
    })),
  }

  const marzes = regions.value
    .map<AreaCard>((region) => ({
      key: region.slug,
      name: placeName('region', region.slug, region.name),
      to: getRegionRoute(region.slug),
      truckCount: region.towTruckCount,
      places: staticCities
        .filter((city) => city.regionId === region.id)
        .map((city) => ({
          slug: city.slug,
          label: placeName('city', city.slug, city.name),
          to: getCityRoute(region.slug, city.slug),
        })),
    }))
    .sort(
      (a, b) =>
        b.places.length - a.places.length ||
        b.truckCount - a.truckCount ||
        a.name.localeCompare(b.name, locale.value),
    )

  return [yerevan, ...marzes]
})
</script>

<template>
  <section id="areas" class="areas section" aria-labelledby="areas-title">
    <div class="container">
      <h2 id="areas-title" class="section-title">{{ t('home.chooseArea') }}</h2>

      <div v-if="pending" class="areas__grid">
        <LoadingSkeleton variant="card" :count="8" />
      </div>
      <ul v-else class="areas__grid">
        <li v-for="card in cards" :key="card.key" class="area-card">
          <h3 class="area-card__name">
            <NuxtLinkLocale :to="card.to" class="area-card__link">{{ card.name }}</NuxtLinkLocale>
          </h3>
          <AppIcon name="arrow-right" :size="18" class="area-card__arrow" />

          <p class="area-card__trucks">
            <AppIcon name="truck" :size="16" />
            {{ plural('card.towTrucks', card.truckCount) }}
          </p>
          <ul class="area-card__towns" :aria-label="card.name">
            <li v-for="place in card.places" :key="place.slug">
              <NuxtLinkLocale :to="place.to" class="area-card__town">{{ place.label }}</NuxtLinkLocale>
            </li>
          </ul>
        </li>
      </ul>
    </div>
  </section>
</template>

<style scoped lang="scss">
// The hero's «Ընտրեք ձեր տարածքը ↓» link lands on the heading, not the
// section: the section's own top padding would otherwise leave the bottom of
// the hero — and the link that was just tapped — still on screen.
//
// No header allowance: the header is `position: sticky` in AppHeader.vue but
// does NOT stick in practice — `overflow-x: hidden` on both html and body makes
// body the scroll container (assets/styles/main.scss). Reserving its 64px here
// is what left the hint visible. If that is ever fixed, add
// `var(--header-height)` back to this value.
#areas-title {
  scroll-margin-top: var(--space-4);
}

// Phones: the hero's own hint already leads into this section, so the full
// `.section` top padding and title gap read as dead space between the two.
@media (max-width: 767px) {
  .areas {
    padding-top: var(--space-4);
  }

  #areas-title {
    margin-bottom: var(--space-4);
  }
}

.areas__grid {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  // One column on a phone: every card lists all its towns, and at two columns
  // a card is ~160px wide — one town per line, cards three times as tall.
  // Full width lets the towns flow in rows instead.
  grid-template-columns: minmax(0, 1fr);
  gap: var(--space-3);

  @media (min-width: 560px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  @media (min-width: 768px) {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--space-4);
  }

  @media (min-width: 1100px) {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

.area-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-4);
  transition:
    box-shadow var(--transition),
    border-color var(--transition),
    transform var(--transition);

  &:hover {
    border-color: var(--color-accent);
    box-shadow: var(--shadow-md);
    transform: translateY(-2px);
  }

  &__name {
    font-size: 1.1rem;
    margin: 0 var(--space-5) var(--space-1) 0;
    line-height: 1.3;
  }

  /* The whole card is the link; the town chips sit above it (z-index) */
  &__link {
    color: var(--color-text);

    &::after {
      content: '';
      position: absolute;
      inset: 0;
      border-radius: inherit;
    }

    &:focus-visible {
      outline: none;

      &::after {
        outline: 2px solid var(--color-primary);
        outline-offset: 2px;
      }
    }
  }

  &__arrow {
    position: absolute;
    top: var(--space-4);
    right: var(--space-4);
    color: var(--color-text-muted);
    transition: color var(--transition), transform var(--transition);
  }

  &:hover &__arrow {
    color: var(--color-accent-dark);
    transform: translateX(2px);
  }

  &__trucks {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin: 0;
    font-weight: 700;
    font-size: 0.95rem;
    color: var(--color-primary);

    svg {
      color: var(--color-accent-dark);
      flex-shrink: 0;
    }
  }


  &__towns {
    list-style: none;
    margin: var(--space-3) 0 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
  }

  &__town {
    position: relative;
    z-index: 1;
    display: inline-block;
    padding: 2px var(--space-2);
    border-radius: var(--radius-full);
    background: var(--color-bg);
    color: var(--color-text-secondary);
    font-size: 0.8rem;
    font-weight: 600;

    &:hover {
      background: var(--color-accent);
      color: var(--color-primary-dark);
    }
  }

  @media (max-width: 479px) {
    padding: var(--space-3);

    &__name {
      font-size: 1rem;
    }

    &__arrow {
      top: var(--space-3);
      right: var(--space-3);
    }

    &__trucks {
      font-size: 0.88rem;
    }
  }
}
</style>
