<script setup lang="ts">
import { SITE_NAME } from '~/constants/site'
import { getRegisterRoute, getRegionsRoute } from '~/utils/routeHelpers'

useSeoMetaData({
  title: `Մեր մասին | ${SITE_NAME}`,
  description:
    'Evakuators.am-ը Հայաստանի էվակուատորների որոնման հարթակ է. գտեք ձեր տարածքում աշխատող էվակուատոր և զանգահարեք վարորդին անմիջապես։',
  path: '/about',
})
</script>

<template>
  <div class="container static-page">
    <h1>Մեր մասին</h1>
    <div class="static-page__content">
      <p>
        Evakuators.am-ը հարթակ է, որտեղ մեկ տեղում հավաքված են Հայաստանի բոլոր մարզերում և Երևանի
        վարչական շրջաններում աշխատող էվակուատորները։ Մեր նպատակն է, որ մեքենայի խնդիր ունեցող
        ցանկացած մարդ կարողանա 1-2 րոպեում գտնել իր տարածքում հասանելի էվակուատոր և զանգահարել
        վարորդին ուղիղ՝ առանց միջնորդների։
      </p>
      <p>
        Հարթակում կտեսնեք մեքենաների իրական նկարները, ծառայությունների տեսակները և մեկնարկային
        գները։
      </p>
      <p>
        Եթե էվակուատորի վարորդ եք, կարող եք անվճար գրանցվել և ստանալ պատվերներ ձեր տարածքից։
      </p>
      <div class="static-page__actions">
        <AppButton :to="getRegionsRoute()" variant="primary">Գտնել էվակուատոր</AppButton>
        <AppButton :to="getRegisterRoute()" variant="accent">Գրանցել էվակուատոր</AppButton>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.static-page {
  padding-bottom: var(--space-7);
  max-width: 760px;

  &__content {
    background: var(--color-surface);
    border-radius: var(--radius-lg);
    padding: var(--space-5);
    box-shadow: var(--shadow-sm);
    color: var(--color-text-secondary);
    line-height: 1.7;
  }

  &__actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
    margin-top: var(--space-4);
  }
}
</style>
