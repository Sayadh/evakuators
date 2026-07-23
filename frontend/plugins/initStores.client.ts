import { useAdminAuthStore } from '~/stores/adminAuth'
import { useDriverAuthStore } from '~/stores/driverAuth'
import { useRecentlyViewedStore } from '~/stores/recentlyViewed'

/** Hydrates localStorage-backed stores on the client */
export default defineNuxtPlugin(() => {
  useRecentlyViewedStore().init()
  useDriverAuthStore().init()
  useAdminAuthStore().init()
})
