/**
 * Site-wide settings (2026-11-18) — backend site-settings module. `get` is
 * public (every page reads it during SSR); `setDesign` is ADMIN only.
 */
import { apiFetch } from './apiClient'
import { useAdminAuthStore } from '~/stores/adminAuth'
import type { SiteDesign } from '~/composables/useSiteDesign'

export interface PublicSiteSettings {
  design: SiteDesign
}

export const siteSettingsRepository = {
  get() {
    return apiFetch<PublicSiteSettings>('/site-settings')
  },
  setDesign(design: SiteDesign) {
    return apiFetch<PublicSiteSettings>('/admin/site-settings/design', {
      method: 'PUT',
      headers: useAdminAuthStore().authHeader as Record<string, string>,
      body: { design },
    })
  },
}
