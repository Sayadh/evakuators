<script setup lang="ts">
import { HEAVY_DUTY_PAGE, findVehicleTypeGeo } from '~/constants/vehicleTypePages'

/**
 * `/tsanr-tehnika/yerevan`, `/tsanr-tehnika/kotayk` — one area of the landing page.
 *
 * The 404 is the point of this file. `[geo]` matches any string, so without an
 * explicit lookup `/tsanr-tehnika/anything` would render a heading with
 * «undefined» in it and a listing of the whole country — a soft 404 that
 * returns 200, which is the shape search engines punish and the shape a
 * crawler will find by following a stale link. `findVehicleTypeGeo` accepts the
 * eleven areas and nothing else.
 */
const route = useRoute()
const geo = findVehicleTypeGeo(route.params.geo as string)

if (!geo) {
  throw createError({ statusCode: 404, statusMessage: 'Տարածքը չի գտնվել', fatal: true })
}
</script>

<template>
  <VehicleTypeListing :page="HEAVY_DUTY_PAGE" :geo="geo" />
</template>
