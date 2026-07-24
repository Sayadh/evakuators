<script setup lang="ts">
import { useRecentlyViewedStore } from '~/stores/recentlyViewed'
import { SITE_NAME } from '~/constants/site'
import { trackTowTruckView } from '~/utils/analytics'
import { getPhoneHref } from '~/utils/formatPhone'
import { getTowTruckRoute } from '~/utils/routeHelpers'
import { buildTowTruckBusinessSchema } from '~/utils/schemaOrg'
import { buildLocationSeo } from '~/utils/seoContent'

const route = useRoute()
const slug = route.params.slug as string

const { data: towTruck } = await useTowTruck(slug)

if (!towTruck.value) {
  throw createError({ statusCode: 404, statusMessage: 'Էվակուատորը չի գտնվել', fatal: true })
}

const truck = towTruck.value

const { data: region } = await useRegion(truck.location.regionSlug ?? '')
const { data: reviews, pending: reviewsPending } = await useTowTruckReviews(truck.id)

const { forTowTruck } = useBreadcrumbs()
const breadcrumbs = forTowTruck(truck, region.value?.name)

const displayName = truck.companyName ?? truck.driverName

const locationSlug = truck.location.districtSlug ?? truck.location.citySlug

// Only append a real, driver-confirmed hours sentence — never a placeholder.
const hoursSentence = truck.workingHours ? ` ${truck.workingHours}։` : ''

useSeoMetaData({
  title: `${displayName} — էվակուատոր ${truck.location.name}ում | ${SITE_NAME}`,
  description: `${displayName}. ${truck.vehicle.brand} ${truck.vehicle.model}, մինչև ${truck.vehicle.capacityTons} տ։${hoursSentence} Զանգահարեք հիմա՝ ${truck.phone}։`,
  keywords: locationSlug
    ? buildLocationSeo(truck.location.name, locationSlug).keywords
    : undefined,
  path: getTowTruckRoute(truck.slug),
  image: truck.images[0],
})

useJsonLd([buildTowTruckBusinessSchema(truck, reviews.value)])

onMounted(() => {
  useRecentlyViewedStore().add(truck.slug)
  trackTowTruckView(truck.slug)
})
</script>

<template>
  <div v-if="towTruck" class="container profile">
    <AppBreadcrumbs :items="breadcrumbs" />

    <div class="profile__layout">
      <div class="profile__main">
        <TowTruckGallery
          :images="towTruck.images"
          :alt="`${displayName} — ${towTruck.vehicle.brand} ${towTruck.vehicle.model} էվակուատոր`"
        />

        <section class="profile__card profile__head">
          <div class="profile__head-top">
            <h1 class="profile__name">{{ displayName }}</h1>
            <AppBadge v-if="towTruck.works24Hours" variant="accent">24/7</AppBadge>
          </div>
          <p v-if="towTruck.companyName" class="profile__driver">
            Վարորդ՝ {{ towTruck.driverName }}
          </p>
          <p v-if="towTruck.workingHours" class="profile__hours">
            <AppIcon name="clock" :size="18" />
            <span>{{ towTruck.workingHours }}</span>
          </p>
          <p class="profile__description">{{ towTruck.description }}</p>
        </section>

        <TowTruckInfo :vehicle="towTruck.vehicle" class="profile__card" />
        <TowTruckServices :services="towTruck.services" class="profile__card" />
        <TowTruckServiceAreas :areas="towTruck.serviceAreas" class="profile__card" />
        <TowTruckPricing :pricing="towTruck.pricing" class="profile__card" />
        <TowTruckReviews :reviews="reviews" :pending="reviewsPending" class="profile__card" />
        <ReviewForm :tow-truck-id="towTruck.id" class="profile__card" />
      </div>

      <aside class="profile__aside">
        <div class="profile__contact-card">
          <p class="profile__contact-label">Կապ վարորդի հետ</p>
          <p class="profile__phone">{{ towTruck.phone }}</p>
          <a
            v-if="towTruck.secondaryPhone"
            :href="getPhoneHref(towTruck.secondaryPhone)"
            class="profile__secondary-phone"
          >
            <AppIcon name="phone" :size="14" />
            Երկրորդ համար՝ {{ towTruck.secondaryPhone }}
          </a>
          <TowTruckContactActions :tow-truck="towTruck" />
          <p class="profile__contact-note">
            Ասեք, որ համարը գտել եք Evakuators.am-ում։
          </p>
        </div>
      </aside>
    </div>

    <SimilarTowTrucks :tow-truck="towTruck" class="profile__similar" />

    <div class="profile__sticky-bar">
      <TowTruckContactActions :tow-truck="towTruck" compact />
    </div>
  </div>
</template>

<style scoped lang="scss">
.profile {
  padding-bottom: calc(var(--space-8) + var(--space-6));

  @media (min-width: 1024px) {
    padding-bottom: var(--space-6);
  }

  &__layout {
    display: grid;
    grid-template-columns: 1fr;
    gap: var(--space-5);

    @media (min-width: 1024px) {
      grid-template-columns: 1fr 340px;
      align-items: start;
    }
  }

  &__main {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    min-width: 0;
  }

  &__card {
    background: var(--color-surface);
    border-radius: var(--radius-lg);
    padding: var(--space-5);
    box-shadow: var(--shadow-sm);
  }

  &__head-top {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
  }

  &__name {
    margin: 0;
  }

  &__driver {
    margin: var(--space-2) 0 0;
    color: var(--color-text-secondary);
  }

  &__hours {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin: var(--space-3) 0;
    color: var(--color-text-secondary);

    svg {
      color: var(--color-text-muted);
    }
  }

  &__description {
    margin: 0;
    color: var(--color-text-secondary);
  }

  &__aside {
    @media (min-width: 1024px) {
      position: sticky;
      top: calc(var(--header-height) + var(--space-4));
    }
  }

  &__contact-card {
    background: var(--color-surface);
    border-radius: var(--radius-lg);
    padding: var(--space-5);
    box-shadow: var(--shadow-md);
  }

  &__contact-label {
    margin: 0 0 var(--space-1);
    font-size: 0.88rem;
    color: var(--color-text-muted);
  }

  &__phone {
    margin: 0 0 var(--space-2);
    font-size: 1.5rem;
    font-weight: 800;
    color: var(--color-text);
  }

  &__secondary-phone {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    margin-bottom: var(--space-4);
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--color-text-secondary);

    svg {
      color: var(--color-text-muted);
    }

    &:hover {
      color: var(--color-primary);
    }
  }

  &__contact-note {
    margin: var(--space-3) 0 0;
    font-size: 0.85rem;
    color: var(--color-text-muted);
  }

  &__similar {
    margin-top: var(--space-6);
  }

  /* Mobile sticky call bar */
  &__sticky-bar {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    z-index: 60;
    padding: var(--space-3) var(--space-4);
    padding-bottom: calc(var(--space-3) + env(safe-area-inset-bottom));
    background: var(--color-surface);
    box-shadow: 0 -4px 16px rgba(16, 30, 46, 0.12);

    @media (min-width: 1024px) {
      display: none;
    }
  }
}
</style>
