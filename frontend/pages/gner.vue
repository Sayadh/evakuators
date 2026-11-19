<script setup lang="ts">
import { findCityLocation } from '~/utils/geography'
import { getCityRoute, getRegionsRoute, getYerevanRoute } from '~/utils/routeHelpers'
import { buildBreadcrumbSchema } from '~/utils/schemaOrg'
import { buildPriceGuide } from '~/utils/priceGuideContent'

const { t, locale } = useI18n()
const { forPriceGuide } = useBreadcrumbs()

const content = computed(() => buildPriceGuide(locale.value))
const breadcrumbs = forPriceGuide()
const placeName = usePlaceName()

/**
 * The towns people search for most (Search Console, Nov 2026), linked from the
 * one page every area's FAQ points to — internal links to the listings that
 * already earn clicks, in the visitor's own language.
 */
const POPULAR_CITY_SLUGS = ['gyumri', 'vanadzor', 'abovyan', 'ashtarak', 'artashat', 'masis', 'sevan', 'dilijan']
const popularCities = computed(() =>
  POPULAR_CITY_SLUGS.flatMap((slug) => {
    const city = findCityLocation(slug)
    return city
      ? [{ slug, name: placeName('city', slug, city.name), to: getCityRoute(city.regionSlug, slug) }]
      : []
  }),
)

useSeoMetaData({
  title: content.value.title,
  description: content.value.description,
  keywords: content.value.keywords,
  path: '/gner',
})

useJsonLd([buildBreadcrumbSchema(breadcrumbs)])
</script>

<template>
  <div class="container price-guide">
    <AppBreadcrumbs :items="breadcrumbs" />

    <header class="price-guide__header">
      <h1>{{ content.h1 }}</h1>
      <p class="price-guide__lead">{{ content.lead }}</p>
      <p class="price-guide__updated">{{ content.updated }}</p>
    </header>

    <dl class="price-guide__highlights">
      <div v-for="item in content.highlights" :key="item.label" class="price-guide__highlight">
        <dt>{{ item.label }}</dt>
        <dd>{{ item.value }}</dd>
      </div>
    </dl>

    <section class="price-guide__section" aria-labelledby="price-table-title">
      <h2 id="price-table-title">{{ content.tableTitle }}</h2>
      <div class="price-table">
        <table>
          <thead>
            <tr>
              <th scope="col">{{ content.columns.service }}</th>
              <th scope="col">{{ content.columns.range }}</th>
              <th scope="col">{{ content.columns.median }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in content.rows" :key="row.key">
              <th scope="row">
                <span class="price-table__service">{{ row.label }}</span>
                <span class="price-table__note">{{ row.note }} · {{ row.drivers }}</span>
              </th>
              <td :data-label="content.columns.range" class="price-table__range">{{ row.range }}</td>
              <td :data-label="content.columns.median">{{ row.median }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="price-guide__section" aria-labelledby="price-factors-title">
      <h2 id="price-factors-title">{{ content.factorsTitle }}</h2>
      <ul class="price-guide__factors">
        <li v-for="factor in content.factors" :key="factor.title">
          <h3>{{ factor.title }}</h3>
          <p>{{ factor.text }}</p>
        </li>
      </ul>
    </section>

    <section class="price-guide__section" aria-labelledby="price-examples-title">
      <h2 id="price-examples-title">{{ content.examplesTitle }}</h2>
      <ul class="price-guide__examples">
        <li v-for="example in content.examples" :key="example.title">
          <h3>{{ example.title }}</h3>
          <p>{{ example.calculation }}</p>
          <strong>{{ example.result }}</strong>
        </li>
      </ul>
      <p class="price-guide__note">{{ content.examplesNote }}</p>
    </section>

    <section class="price-guide__section" aria-labelledby="price-checklist-title">
      <h2 id="price-checklist-title">{{ content.checklistTitle }}</h2>
      <ul class="price-guide__checklist">
        <li v-for="item in content.checklist" :key="item">
          <AppIcon name="check" :size="18" />
          <span>{{ item }}</span>
        </li>
      </ul>
    </section>

    <section class="price-guide__cta" aria-labelledby="price-cta-title">
      <h2 id="price-cta-title">{{ content.ctaTitle }}</h2>
      <NearestTowTrucksCta />
      <nav class="price-guide__links" :aria-label="content.ctaTitle">
        <NuxtLinkLocale :to="getYerevanRoute()">{{ t('footer.yerevan') }}</NuxtLinkLocale>
        <NuxtLinkLocale v-for="city in popularCities" :key="city.slug" :to="city.to">
          {{ city.name }}
        </NuxtLinkLocale>
        <NuxtLinkLocale :to="getRegionsRoute()">{{ t('footer.regions') }}</NuxtLinkLocale>
      </nav>
    </section>

    <FaqSection :items="content.faq" class="price-guide__section" />

    <section class="price-guide__section price-guide__method" aria-labelledby="price-method-title">
      <h2 id="price-method-title">{{ content.methodTitle }}</h2>
      <p>{{ content.method }}</p>
    </section>
  </div>
</template>

<style scoped lang="scss">
.price-guide {
  max-width: 960px;
  padding-bottom: var(--space-8);

  &__header {
    max-width: 760px;
    margin-bottom: var(--space-5);
  }

  &__lead {
    color: var(--color-text-secondary);
    font-size: 1.05rem;
    line-height: 1.65;
    margin-bottom: var(--space-2);
  }

  &__updated {
    color: var(--color-text-muted);
    font-size: 0.875rem;
    margin: 0;
  }

  &__highlights {
    display: grid;
    grid-template-columns: 1fr;
    gap: var(--space-3);
    margin: 0;

    @media (min-width: 720px) {
      grid-template-columns: repeat(3, 1fr);
    }
  }

  &__highlight {
    background: var(--color-primary);
    border-radius: var(--radius-md);
    color: #fff;
    padding: var(--space-4);

    dt {
      color: rgba(255, 255, 255, 0.78);
      font-size: 0.875rem;
      margin-bottom: var(--space-1);
    }

    dd {
      font-size: 1.25rem;
      font-weight: 700;
      margin: 0;
    }
  }

  &__section {
    margin-top: var(--space-7);

    h2 {
      margin-bottom: var(--space-4);
    }
  }

  &__factors,
  &__examples {
    display: grid;
    grid-template-columns: 1fr;
    gap: var(--space-3);
    list-style: none;
    margin: 0;
    padding: 0;

    li {
      background: var(--color-surface);
      border-radius: var(--radius-md);
      box-shadow: var(--shadow-sm);
      padding: var(--space-4);
    }

    h3 {
      font-size: 1rem;
      margin-bottom: var(--space-1);
    }

    p {
      color: var(--color-text-secondary);
      line-height: 1.55;
      margin: 0;
    }
  }

  &__factors {
    @media (min-width: 720px) {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  &__examples {
    @media (min-width: 720px) {
      grid-template-columns: repeat(3, 1fr);
    }

    li {
      display: flex;
      flex-direction: column;
    }

    strong {
      color: var(--color-primary);
      font-size: 1.15rem;
      margin-top: auto;
      padding-top: var(--space-3);
    }
  }

  &__note {
    color: var(--color-text-secondary);
    font-size: 0.9rem;
    line-height: 1.55;
    margin: var(--space-3) 0 0;
  }

  &__checklist {
    background: var(--color-surface);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-sm);
    display: grid;
    gap: var(--space-3);
    list-style: none;
    margin: 0;
    padding: var(--space-4);

    li {
      display: flex;
      gap: var(--space-2);
      line-height: 1.5;
    }

    svg {
      color: var(--color-success);
      flex-shrink: 0;
      margin-top: 3px;
    }
  }

  &__cta {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    margin-top: var(--space-7);
    padding: var(--space-5);
    text-align: center;

    h2 {
      font-size: 1.25rem;
      margin-bottom: var(--space-4);
    }
  }

  &__links {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-4);
    justify-content: center;
    margin-top: var(--space-4);
  }

  &__method {
    border-top: 1px solid var(--color-border);
    padding-top: var(--space-5);

    h2 {
      font-size: 1.1rem;
      margin-bottom: var(--space-2);
    }

    p {
      color: var(--color-text-secondary);
      font-size: 0.925rem;
      line-height: 1.6;
      margin: 0;
    }
  }
}

.price-table {
  background: var(--color-surface);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  overflow: hidden;

  table {
    border-collapse: collapse;
    width: 100%;
  }

  th,
  td {
    border-bottom: 1px solid var(--color-border);
    padding: var(--space-3) var(--space-4);
    text-align: left;
    vertical-align: top;
  }

  tbody tr:last-child > * {
    border-bottom: 0;
  }

  thead th {
    background: var(--color-bg);
    color: var(--color-text-secondary);
    font-size: 0.85rem;
    font-weight: 600;
  }

  tbody th {
    font-weight: 400;
  }

  td {
    white-space: nowrap;
  }

  &__service {
    display: block;
    font-weight: 600;
  }

  &__note {
    color: var(--color-text-muted);
    display: block;
    font-size: 0.82rem;
    margin-top: 2px;
  }

  &__range {
    color: var(--color-primary);
    font-weight: 700;
  }

  // A phone: each service becomes its own block, so no column is squeezed or
  // hidden behind a horizontal scroll.
  @media (max-width: 639px) {
    thead {
      display: none;
    }

    table,
    tbody,
    tr,
    tbody th,
    td {
      display: block;
    }

    tr {
      border-bottom: 1px solid var(--color-border);
      padding: var(--space-3) var(--space-4);
    }

    tbody tr:last-child {
      border-bottom: 0;
    }

    tbody th,
    td {
      border: 0;
      padding: 0;
    }

    tbody th {
      margin-bottom: var(--space-2);
    }

    td {
      display: flex;
      gap: var(--space-3);
      justify-content: space-between;
      padding-top: 2px;
      white-space: normal;

      &::before {
        color: var(--color-text-secondary);
        content: attr(data-label);
        font-weight: 400;
      }
    }
  }
}
</style>
