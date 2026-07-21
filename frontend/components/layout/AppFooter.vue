<script setup lang="ts">
import { FOOTER_PAGES } from '~/constants/navigation'
import { CONTACT_PHONE, CONTACT_TELEGRAM, SITE_DESCRIPTION } from '~/constants/site'
import { getDistrictRoute, getRegionRoute } from '~/utils/routeHelpers'
import { getPhoneHref, getTelegramUrl } from '~/utils/formatPhone'

const { data: regions } = useRegions()
const { data: districts } = useDistricts()

const currentYear = new Date().getFullYear()
</script>

<template>
  <footer class="footer">
    <div class="container">
      <div class="footer__grid">
        <div class="footer__about">
          <NuxtLink to="/" class="footer__logo">
            <AppIcon name="truck" :size="24" />
            <span>Evakuators.am</span>
          </NuxtLink>
          <p class="footer__description">{{ SITE_DESCRIPTION }}</p>
          <p class="footer__contacts">
            <a :href="getPhoneHref(CONTACT_PHONE)" class="footer__contact-link">
              <AppIcon name="phone" :size="16" /> {{ CONTACT_PHONE }}
            </a>
            <a
              :href="getTelegramUrl(CONTACT_TELEGRAM)"
              target="_blank"
              rel="noopener"
              class="footer__contact-link"
            >
              <AppIcon name="telegram" :size="16" /> @{{ CONTACT_TELEGRAM }}
            </a>
          </p>
        </div>

        <nav class="footer__col" aria-label="Մարզեր">
          <h3 class="footer__heading">Մարզեր</h3>
          <ul class="footer__list">
            <li v-for="region in regions" :key="region.slug">
              <NuxtLink :to="getRegionRoute(region.slug)">{{ region.name }}</NuxtLink>
            </li>
          </ul>
        </nav>

        <nav class="footer__col" aria-label="Երևանի շրջաններ">
          <h3 class="footer__heading">Երևան</h3>
          <ul class="footer__list">
            <li v-for="district in districts" :key="district.slug">
              <NuxtLink :to="getDistrictRoute(district.slug)">{{ district.name }}</NuxtLink>
            </li>
          </ul>
        </nav>

        <nav class="footer__col" aria-label="Կայքի էջեր">
          <h3 class="footer__heading">Կայք</h3>
          <ul class="footer__list">
            <li v-for="page in FOOTER_PAGES" :key="page.to">
              <NuxtLink :to="page.to">{{ page.label }}</NuxtLink>
            </li>
          </ul>
        </nav>
      </div>

      <div class="footer__bottom">
        <p>© {{ currentYear }} Evakuators.am</p>
      </div>
    </div>
  </footer>
</template>

<style scoped lang="scss">
.footer {
  background: var(--color-primary-dark);
  color: rgba(255, 255, 255, 0.85);
  padding: var(--space-7) 0 var(--space-5);
  margin-top: var(--space-7);

  &__grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: var(--space-6);

    @media (min-width: 640px) {
      grid-template-columns: repeat(2, 1fr);
    }

    @media (min-width: 1024px) {
      grid-template-columns: 2fr 1fr 1fr 1fr;
    }
  }

  &__logo {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    font-size: 1.15rem;
    font-weight: 800;
    color: #fff;
    margin-bottom: var(--space-3);

    svg {
      color: var(--color-accent);
    }
  }

  &__description {
    font-size: 0.9rem;
    line-height: 1.6;
    color: rgba(255, 255, 255, 0.7);
    max-width: 380px;
  }

  &__contacts {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin-top: var(--space-3);
  }

  &__contact-link {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    color: #fff;
    font-weight: 600;

    &:hover {
      color: var(--color-accent);
    }
  }

  &__heading {
    color: #fff;
    font-size: 1rem;
    margin-bottom: var(--space-3);
  }

  &__list {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);

    a {
      color: rgba(255, 255, 255, 0.7);
      font-size: 0.9rem;

      &:hover {
        color: var(--color-accent);
      }
    }
  }

  &__bottom {
    margin-top: var(--space-6);
    padding-top: var(--space-4);
    border-top: 1px solid rgba(255, 255, 255, 0.12);
    font-size: 0.85rem;
    color: rgba(255, 255, 255, 0.6);

    p {
      margin: 0;
    }
  }
}
</style>
