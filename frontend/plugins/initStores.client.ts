import { useRecentlyViewedStore } from '~/stores/recentlyViewed'

/** Hydrates localStorage-backed stores on the client */
export default defineNuxtPlugin(() => {
  useRecentlyViewedStore().init()
})
