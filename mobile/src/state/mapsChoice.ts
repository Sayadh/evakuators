/** The maps app the driver used last for «Նավիգացիա» — shown first next time (kept on the phone) */
import * as SecureStore from 'expo-secure-store'
import { Linking } from 'react-native'
import { isMapsApp, mapsLinks, type MapsApp, type MapsTarget } from '../domain/mapsApps'

const KEY = 'evk.mapsApp'

export async function lastMapsApp(): Promise<MapsApp | null> {
  const saved = await SecureStore.getItemAsync(KEY).catch(() => null)
  return isMapsApp(saved) ? saved : null
}

/**
 * Opens the route in the chosen app; not installed → the same route on that
 * provider's web page. `openURL` is tried directly (no `canOpenURL`, which on
 * Android 11+ answers "no" for apps the manifest does not declare).
 * @returns false only when not even the web page could be opened
 */
export async function openInMaps(app: MapsApp, target: MapsTarget, os: string): Promise<boolean> {
  void SecureStore.setItemAsync(KEY, app).catch(() => undefined)
  const links = mapsLinks(app, target, os)
  try {
    await Linking.openURL(links.app)
    return true
  } catch {
    try {
      await Linking.openURL(links.web)
      return true
    } catch {
      return false
    }
  }
}
