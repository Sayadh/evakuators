/**
 * Is live dispatch switched on (`LIVE_DISPATCH_ENABLED`)? Read once per page
 * from `/ops/dispatch/health` (2026-11-18). Pre-orders are refused by the
 * backend while it is off — the pages use this to say so up front and grey
 * out the buttons instead of failing on press.
 *
 * `null` while unknown (still loading, or the read failed): the buttons stay
 * enabled then, and the server remains the one that refuses.
 */
import { onMounted, ref } from 'vue'
import { opsDispatchRepository } from '~/repositories/opsDispatch.repository'

export function useDispatchEnabled() {
  const enabled = ref<boolean | null>(null)
  onMounted(async () => {
    try {
      enabled.value = (await opsDispatchRepository.health()).flags.dispatch
    } catch {
      enabled.value = null
    }
  })
  return enabled
}
