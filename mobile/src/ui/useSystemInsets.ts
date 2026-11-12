/**
 * Room to leave for the phone's own bars (2026-11). The Android build draws
 * edge-to-edge, and React Native's SafeAreaView pads nothing on Android, so on
 * a phone with the three navigation buttons (many Xiaomi) the tab bar sat
 * under them. The insets come from the alarm module (offerAlarm.ts
 * `systemInsets`); a build without it falls back to the status bar height and
 * no bottom room, as before.
 *
 * Re-read when the window size changes (rotation, split screen), when the app
 * comes back to the front (the driver may have switched to gestures) and
 * shortly after mount (the window may not be laid out yet).
 */
import { useEffect, useState } from 'react'
import { AppState, Dimensions, Platform, StatusBar } from 'react-native'
import { systemInsets, type SystemInsets } from '../push/offerAlarm'

const FALLBACK: SystemInsets = { top: StatusBar.currentHeight ?? 0, bottom: 0, left: 0, right: 0 }

function read(): SystemInsets {
  return systemInsets() ?? FALLBACK
}

const same = (a: SystemInsets, b: SystemInsets): boolean => a.top === b.top && a.bottom === b.bottom && a.left === b.left && a.right === b.right

/** Android only; iOS keeps SafeAreaView (always zero here) */
export function useSystemInsets(): SystemInsets {
  const [insets, setInsets] = useState<SystemInsets>(() => (Platform.OS === 'android' ? read() : { top: 0, bottom: 0, left: 0, right: 0 }))
  useEffect(() => {
    if (Platform.OS !== 'android') return
    const update = () => {
      const next = read()
      setInsets((current) => (same(current, next) ? current : next))
    }
    const timers = [setTimeout(update, 50), setTimeout(update, 500), setTimeout(update, 1500)]
    const dimensions = Dimensions.addEventListener('change', update)
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') update()
    })
    return () => {
      timers.forEach(clearTimeout)
      dimensions.remove()
      appState.remove()
    }
  }, [])
  return insets
}
