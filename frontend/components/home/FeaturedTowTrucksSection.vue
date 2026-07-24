<script setup lang="ts">
const { data: featured, pending } = useFeaturedTowTrucks(6)
</script>

<template>
  <!--
    Purely editorial (admin marks trucks as "featured" in /admin) — if
    nothing is marked, there is nothing to show, so the whole section
    disappears rather than rendering an empty-state block.
  -->
  <section
    v-if="pending || (featured && featured.length > 0)"
    class="featured section"
    aria-labelledby="featured-title"
  >
    <div class="container">
      <h2 id="featured-title" class="section-title">Լավագույն էվակուատորները</h2>
      <TowTruckList :tow-trucks="featured" :pending="pending" :skeleton-count="3" layout="stack" />
    </div>
  </section>
</template>
