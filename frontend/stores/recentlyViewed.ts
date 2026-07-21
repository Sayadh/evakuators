import { defineStore } from 'pinia'

const STORAGE_KEY = 'evakuators:recently-viewed'
const MAX_ITEMS = 8

export const useRecentlyViewedStore = defineStore('recentlyViewed', {
  state: () => ({
    slugs: [] as string[],
    initialized: false,
  }),

  actions: {
    init() {
      if (!import.meta.client || this.initialized) return
      try {
        const raw = localStorage.getItem(STORAGE_KEY)
        this.slugs = raw ? (JSON.parse(raw) as string[]) : []
      } catch {
        this.slugs = []
      }
      this.initialized = true
    },
    add(slug: string) {
      this.slugs = [slug, ...this.slugs.filter((item) => item !== slug)].slice(0, MAX_ITEMS)
      if (import.meta.client) localStorage.setItem(STORAGE_KEY, JSON.stringify(this.slugs))
    },
  },
})
