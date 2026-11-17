/**
 * Admin-panel errors → the in-house tracker (2026-11-17): Vue errors, uncaught
 * exceptions and unhandled promise rejections on /admin pages only. The public
 * site is not reported (extensions and old browsers would bury our own bugs).
 * Filtering lives in utils/errorReport.ts.
 */
import { errorTrackingRepository } from '~/repositories/errorTracking.repository'
import { MAX_REPORTS_PER_PAGE, toReport } from '~/utils/errorReport'

export default defineNuxtPlugin((nuxtApp) => {
  let sent = 0
  const report = (error: unknown) => {
    if (sent >= MAX_REPORTS_PER_PAGE) return
    const path = window.location.pathname
    const body = toReport(error, path)
    if (!body) return
    sent++
    errorTrackingRepository.report({ ...body, where: path })
  }
  const previous = nuxtApp.vueApp.config.errorHandler
  nuxtApp.vueApp.config.errorHandler = (error, instance, info) => {
    report(error)
    if (previous) previous(error, instance, info)
    else console.error(error)
  }
  window.addEventListener('error', (event) => report(event.error ?? event.message))
  window.addEventListener('unhandledrejection', (event) => report(event.reason))
})
