/**
 * Loads the site design (2026-11-18, composables/useSiteDesign.ts) once per
 * request during SSR; the value travels to the browser in the payload. Pages
 * rendered only in the browser (/admin, ssr: false) load it there.
 *
 * Never blocks the page on a failure: no API (mock mode) or an error → design 1.
 */
import { isApiEnabled } from '~/repositories'
import { siteSettingsRepository } from '~/repositories/siteSettings.repository'

export default defineNuxtPlugin(async (nuxtApp) => {
  if (!isApiEnabled()) return
  const state = useSiteDesignState()
  const loaded = useState<boolean>('site-design-loaded', () => false)
  // Hydrating a server-rendered page: the server already loaded it
  if (import.meta.client && nuxtApp.isHydrating && loaded.value) return
  try {
    const settings = await siteSettingsRepository.get()
    state.value = settings.design === 2 ? 2 : 1
    loaded.value = true
  } catch {
    state.value = 1
  }
})
