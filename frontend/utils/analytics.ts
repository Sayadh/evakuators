/**
 * Analytics abstraction. Currently logs to console in development only.
 * Later, replace `dispatch` with Google Analytics / Matomo calls
 * without touching any component code.
 */
type AnalyticsPayload = Record<string, string | number | boolean | undefined>

function dispatch(event: string, payload?: AnalyticsPayload): void {
  if (import.meta.dev) {
    console.info(`[analytics] ${event}`, payload ?? {})
  }
}

export const trackPhoneClick = (towTruckSlug: string): void =>
  dispatch('phone_click', { towTruckSlug })

export const trackWhatsAppClick = (towTruckSlug: string): void =>
  dispatch('whatsapp_click', { towTruckSlug })

export const trackTelegramClick = (towTruckSlug: string): void =>
  dispatch('telegram_click', { towTruckSlug })

export const trackEmailClick = (towTruckSlug: string): void =>
  dispatch('email_click', { towTruckSlug })

export const trackTowTruckView = (towTruckSlug: string): void =>
  dispatch('tow_truck_view', { towTruckSlug })

export const trackLocationSearch = (regionSlug: string, citySlug?: string): void =>
  dispatch('location_search', { regionSlug, citySlug })

export const trackFilterApply = (activeFiltersCount: number): void =>
  dispatch('filter_apply', { activeFiltersCount })

export const trackRegistrationSubmit = (): void => dispatch('registration_submit')
