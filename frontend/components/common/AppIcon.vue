<script setup lang="ts">
export type IconName =
  | 'phone'
  | 'whatsapp'
  | 'telegram'
  | 'check'
  | 'clock'
  | 'map-pin'
  | 'truck'
  | 'menu'
  | 'close'
  | 'chevron-down'
  | 'chevron-right'
  | 'filter'
  | 'search'
  | 'arrow-right'
  | 'image'
  | 'alert'
  | 'info'
  | 'map'
  | 'mail'
  | 'user'
  | 'weight'
  | 'star'
  | 'star-filled'

interface IconDefinition {
  paths: string[]
  filled?: boolean
}

const ICONS: Record<IconName, IconDefinition> = {
  phone: {
    paths: [
      'M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z',
    ],
  },
  whatsapp: {
    paths: [
      'M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z',
      'M9.5 9.5c.5 2.5 2.5 4.5 5 5l1-1.5 2 1c-.5 1.5-1.5 2-3 1.5-2.8-.9-5.1-3.2-6-6-.5-1.5 0-2.5 1.5-3l1 2-1.5 1z',
    ],
  },
  telegram: {
    paths: ['m22 2-7 20-4-9-9-4Z', 'M22 2 11 13'],
  },
  check: { paths: ['M20 6 9 17l-5-5'] },
  clock: { paths: ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z', 'M12 6v6l4 2'] },
  'map-pin': {
    paths: ['M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z', 'M12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'],
  },
  truck: {
    paths: [
      'M1 3h15v13H1z',
      'M16 8h4l3 3v5h-7V8z',
      'M5.5 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
      'M18.5 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
    ],
  },
  menu: { paths: ['M3 12h18', 'M3 6h18', 'M3 18h18'] },
  close: { paths: ['M18 6 6 18', 'm6 6 12 12'] },
  'chevron-down': { paths: ['m6 9 6 6 6-6'] },
  'chevron-right': { paths: ['m9 18 6-6-6-6'] },
  filter: {
    paths: ['M4 21v-7', 'M4 10V3', 'M12 21v-9', 'M12 8V3', 'M20 21v-5', 'M20 12V3', 'M1 14h6', 'M9 8h6', 'M17 16h6'],
  },
  search: { paths: ['M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z', 'm21 21-4.35-4.35'] },
  'arrow-right': { paths: ['M5 12h14', 'm12 5 7 7-7 7'] },
  image: {
    paths: [
      'M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5z',
      'M9 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
      'm21 15-5-5L5 21',
    ],
  },
  alert: { paths: ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z', 'M12 8v4', 'M12 16h.01'] },
  info: { paths: ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z', 'M12 16v-4', 'M12 8h.01'] },
  map: {
    paths: ['m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6z', 'M9 3v15', 'M15 6v15'],
  },
  mail: {
    paths: ['M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z', 'm22 6-10 7L2 6'],
  },
  user: {
    paths: ['M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2', 'M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z'],
  },
  weight: {
    paths: ['M6 7h12l3 14H3L6 7z', 'M9 7a3 3 0 1 1 6 0'],
  },
  star: {
    paths: ['M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.77 5.82 21 7 14.14 2 9.27l6.91-1.01L12 2z'],
  },
  'star-filled': {
    paths: ['M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.77 5.82 21 7 14.14 2 9.27l6.91-1.01L12 2z'],
    filled: true,
  },
}

interface Props {
  name: IconName
  size?: number
}

const props = withDefaults(defineProps<Props>(), { size: 20 })

const icon = computed(() => ICONS[props.name])
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    :fill="icon.filled ? 'currentColor' : 'none'"
    :stroke="icon.filled ? 'none' : 'currentColor'"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path v-for="(path, index) in icon.paths" :key="index" :d="path" />
  </svg>
</template>
