/**
 * The console rings when a DRIVER does something to an order (2026-11-16):
 * asks to cancel, reports a problem, or withdraws (auto re-dispatch) — the
 * `DRIVER_INCIDENT_ALERTS` kinds of the backend's OrderAlert rows. A short
 * sound plus a browser notification (seen from another tab or with the
 * window minimised); clicking it opens the order.
 *
 * One poller for the whole console, whichever /admin/orders page is open:
 * state lives at module level, so moving between the console's pages does
 * not reset it or ring again for alerts already seen. Alerts that existed
 * when the console opened never ring — only new ones.
 *
 * Browsers allow sound only after the operator interacted with the page, and
 * notifications only after he allowed them: `enable()` (the bell button in
 * OpsNav) does both. The choice is remembered in this browser.
 */
import { opsDispatchRepository } from '~/repositories/opsDispatch.repository'
import { alertLabel } from '~/utils/opsDispatchLabels'
import { DRIVER_INCIDENT_ALERTS } from '~/utils/orderIncidents'

const POLL_MS = 10_000
const STORAGE_KEY = 'evk-ops-incident-alarm'

const enabled = ref(false)
const permission = ref<NotificationPermission | 'unsupported'>('default')
const known = new Set<number>()
let baselined = false
let timer: ReturnType<typeof setInterval> | null = null
let users = 0
let audio: AudioContext | null = null

function readEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function writeEnabled(value: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, value ? '1' : '0')
  } catch {
    // private mode: only this visit
  }
}

/** Three short rising tones — distinct from any system sound, no file to load */
function beep(): void {
  try {
    audio ??= new AudioContext()
    if (audio.state === 'suspended') void audio.resume()
    const start = audio.currentTime
    ;[660, 880, 1100].forEach((frequency, i) => {
      const osc = audio!.createOscillator()
      const gain = audio!.createGain()
      osc.frequency.value = frequency
      osc.type = 'sine'
      const t = start + i * 0.22
      gain.gain.setValueAtTime(0.0001, t)
      gain.gain.exponentialRampToValueAtTime(0.35, t + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.2)
      osc.connect(gain).connect(audio!.destination)
      osc.start(t)
      osc.stop(t + 0.21)
    })
  } catch {
    // no audio: the notification and the banner still tell
  }
}

function notify(orderId: number, kind: string, title: string): void {
  if (permission.value !== 'granted') return
  try {
    const n = new Notification(title || 'Պատվերի խնդիր', {
      body: `Պատվեր #${orderId} · սեղմեք՝ բացելու համար`,
      tag: `evk-order-${orderId}-${kind}`,
      requireInteraction: true,
    })
    n.onclick = () => {
      window.focus()
      void navigateTo(`/admin/orders/${orderId}`)
      n.close()
    }
  } catch {
    // some browsers allow notifications only from a service worker
  }
}

async function poll(): Promise<void> {
  const alerts = await opsDispatchRepository.alerts().catch(() => null)
  if (!alerts) return
  const fresh = alerts.filter((a) => !known.has(a.id))
  for (const a of alerts) known.add(a.id)
  if (!baselined) {
    baselined = true
    return
  }
  const driverIncidents = fresh.filter((a) => (DRIVER_INCIDENT_ALERTS as readonly string[]).includes(a.kind))
  if (driverIncidents.length === 0 || !enabled.value) return
  beep()
  for (const a of driverIncidents) notify(a.orderId, a.kind, alertLabel(a))
}

export function useIncidentAlarm() {
  onMounted(() => {
    enabled.value = readEnabled()
    permission.value = typeof Notification === 'undefined' ? 'unsupported' : Notification.permission
    users++
    if (!timer) {
      void poll()
      timer = setInterval(() => void poll(), POLL_MS)
    }
  })
  onUnmounted(() => {
    users--
    // Leaving the console altogether: stop. Moving between its pages
    // unmounts one nav and mounts the next within the same tick of navigation.
    setTimeout(() => {
      if (users === 0 && timer) {
        clearInterval(timer)
        timer = null
      }
    }, 1000)
  })

  /** The bell button: a user gesture, so sound is unlocked and the permission can be asked */
  async function enable(): Promise<void> {
    enabled.value = true
    writeEnabled(true)
    beep()
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      permission.value = await Notification.requestPermission().catch(() => 'denied' as const)
    }
  }

  function disable(): void {
    enabled.value = false
    writeEnabled(false)
  }

  return { enabled: readonly(enabled), permission: readonly(permission), enable, disable }
}
