<script setup lang="ts">
const { data: featured, pending } = useFeaturedTowTrucks(6)
</script>

<template>
  <section class="featured section" aria-labelledby="featured-title">
    <div class="container">
      <h2 id="featured-title" class="section-title">Լավագույն էվակուատորները</h2>
      <TowTruckList :tow-trucks="featured" :pending="pending" :skeleton-count="6" />
    </div>
  </section>
</template>
