<script setup lang="ts">
import { MANIPULATOR_PAGE } from '~/constants/vehicleTypePages'

/**
 * Thin on purpose. Both vehicle-type pages are the same page with different
 * words, so all of it — data, SEO, schema, copy — lives in
 * `VehicleTypeListing`, driven by the config. This file exists because Nuxt
 * routes by filename and the two slugs are unrelated words; a single dynamic
 * route would have to sit at the root and would swallow every other top-level
 * URL on the site.
 *
 * A directory rather than `manipulator.vue`, so `[geo].vue` next to it can
 * serve `/manipulator/yerevan` — see that file.
 */
</script>

<template>
  <VehicleTypeListing :page="MANIPULATOR_PAGE" />
</template>
