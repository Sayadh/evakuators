<script setup lang="ts">
import { VEHICLE_TYPE_PAGE_LIST } from '~/constants/vehicleTypePages'
import { localizedVehicleTypePage } from '~/i18n/vehicleTypeCopy'
import { getVehicleTypePageRoute } from '~/utils/routeHelpers'

/**
 * Manipulator and heavy-equipment trucks are listed only on their own pages
 * (docs/taxonomies.md § "Landing-page-only vehicle types") — so none of the
 * region cards above lead to them. Without this block a visitor who needs a
 * crane has no path from the homepage, and the two landing pages lose their
 * most authoritative internal link.
 *
 * Driven by VEHICLE_TYPE_PAGE_LIST, so a third type appears here by itself.
 */
const { t, locale } = useI18n()

const pages = computed(() =>
  VEHICLE_TYPE_PAGE_LIST.map((source) => {
    const page = localizedVehicleTypePage(source, locale.value)
    return {
      slug: page.slug,
      label: page.heading,
      teaser: page.seo.metaTeaser,
      to: getVehicleTypePageRoute(page.slug),
    }
  }),
)
</script>

<template>
  <section class="special" aria-labelledby="special-title">
    <div class="container">
      <h2 id="special-title" class="special__title">{{ t('crossLinks.titleGeneric') }}</h2>
      <ul class="special__list">
        <li v-for="page in pages" :key="page.slug">
          <NuxtLinkLocale :to="page.to" class="special__card">
            <span class="special__icon"><AppIcon name="truck" :size="22" /></span>
            <span class="special__text">
              <span class="special__label">{{ page.label }}</span>
              <span class="special__teaser">{{ page.teaser }}</span>
            </span>
            <span class="special__arrow"><AppIcon name="arrow-right" :size="18" /></span>
          </NuxtLinkLocale>
        </li>
      </ul>
    </div>
  </section>
</template>

<style scoped lang="scss">
.special {
  padding-bottom: var(--space-6);

  @media (min-width: 768px) {
    padding-bottom: var(--space-7);
  }

  &__title {
    text-align: center;
    font-size: 1.25rem;
    margin-bottom: var(--space-4);

    @media (min-width: 768px) {
      font-size: 1.5rem;
      margin-bottom: var(--space-5);
    }
  }

  &__list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: 1fr;
    gap: var(--space-3);

    // Desktop: the full container width, same as the area cards above, so the
    // page reads as one column of content instead of a narrow strip under it.
    @media (min-width: 768px) {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--space-4);
    }
  }

  &__card {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-4);
    background: var(--color-primary);
    color: #fff;
    border-radius: var(--radius-lg);
    font-weight: 700;
    transition:
      background var(--transition),
      box-shadow var(--transition),
      transform var(--transition);

    &:hover {
      color: #fff;
      background: var(--color-primary-light);
      transform: translateY(-2px);
    }

    @media (min-width: 768px) {
      gap: var(--space-4);
      padding: var(--space-5) var(--space-6);
      background: linear-gradient(
        135deg,
        var(--color-primary-dark) 0%,
        var(--color-primary) 55%,
        var(--color-primary-light) 100%
      );
      box-shadow: var(--shadow-md);

      &:hover {
        background: linear-gradient(
          135deg,
          var(--color-primary) 0%,
          var(--color-primary-light) 100%
        );
        box-shadow: var(--shadow-lg);
      }
    }
  }

  &__icon {
    display: inline-flex;
    flex-shrink: 0;
    color: var(--color-accent);

    @media (min-width: 768px) {
      align-items: center;
      justify-content: center;
      width: 52px;
      height: 52px;
      border-radius: var(--radius-md);
      background: rgba(246, 168, 33, 0.15);
    }
  }

  &__text {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  &__label {
    line-height: 1.3;

    @media (min-width: 768px) {
      font-size: 1.1rem;
    }
  }

  // Desktop only: a phone row has no room for a second line, and the heading
  // already says what the page is.
  &__teaser {
    display: none;

    @media (min-width: 768px) {
      display: block;
      font-weight: 400;
      font-size: 0.9rem;
      color: rgba(255, 255, 255, 0.75);
      line-height: 1.4;
    }
  }

  &__arrow {
    display: inline-flex;
    flex-shrink: 0;
    opacity: 0.7;

    @media (min-width: 768px) {
      align-items: center;
      justify-content: center;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      opacity: 1;
      border: 1px solid rgba(255, 255, 255, 0.25);
      transition:
        background var(--transition),
        border-color var(--transition);
    }
  }

  &__card:hover &__arrow {
    @media (min-width: 768px) {
      background: var(--color-accent);
      border-color: var(--color-accent);
      color: var(--color-primary-dark);
    }
  }
}
</style>
