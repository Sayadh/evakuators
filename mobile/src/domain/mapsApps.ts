/**
 * «Նավիգացիա» (2026-11-12): the driver picks the app — Google Maps, Yandex
 * Navigator, Yandex Maps, Waze, or Apple Maps on iPhone — and each gets a
 * link in ITS OWN parameter format. Pure (no React Native) so it is tested.
 *
 * Coordinates, the part that went wrong before:
 *  - always LATITUDE first, then LONGITUDE, except where an app names its
 *    parameters (Yandex Navigator `lat_to` / `lon_to`) — never Yandex's
 *    `ll=`/`pt=` parameters, which are LONGITUDE first and swap the point;
 *  - written with a fixed 6 decimals (≈ 10 cm) and a dot, never `toString()`
 *    (no exponent form, no locale comma);
 *  - checked: outside Armenia but valid when swapped → swapped back (an old
 *    order saved as "44.5, 40.1"); invalid either way → no navigation.
 *
 * Opening: the app link first; when the app is not installed the same
 * route opens in that provider's web page (which also offers the app).
 */
import { isWithinArmenia } from './coordinates'

export type MapsApp = 'google' | 'yandexNavi' | 'yandexMaps' | 'waze' | 'apple'

export interface MapsTarget {
  latitude: number
  longitude: number
}

export const ANDROID_APPS: MapsApp[] = ['google', 'yandexNavi', 'yandexMaps', 'waze']
export const IOS_APPS: MapsApp[] = ['apple', 'google', 'yandexNavi', 'yandexMaps', 'waze']

export function appsFor(os: string): MapsApp[] {
  return os === 'ios' ? IOS_APPS : ANDROID_APPS
}

/** A usable point, lat/lng in the right order — or null */
export function cleanTarget(point: { latitude: number | string | null; longitude: number | string | null } | null | undefined): MapsTarget | null {
  if (!point || point.latitude === null || point.longitude === null) return null
  const latitude = Number(point.latitude)
  const longitude = Number(point.longitude)
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null
  if (latitude === 0 && longitude === 0) return null
  if (!isWithinArmenia(latitude, longitude) && isWithinArmenia(longitude, latitude)) return { latitude: longitude, longitude: latitude }
  return { latitude, longitude }
}

const f = (n: number) => n.toFixed(6)

/** The app's own link and the web page for the same driving route */
export function mapsLinks(app: MapsApp, target: MapsTarget, os: string): { app: string; web: string } {
  const lat = f(target.latitude)
  const lng = f(target.longitude)
  const yandexWeb = `https://yandex.com/maps/?rtext=~${lat}%2C${lng}&rtt=auto`
  switch (app) {
    case 'google':
      return {
        app: os === 'ios' ? `comgooglemaps://?daddr=${lat},${lng}&directionsmode=driving` : `google.navigation:q=${lat},${lng}&mode=d`,
        web: `https://www.google.com/maps/dir/?api=1&destination=${lat}%2C${lng}&travelmode=driving`,
      }
    case 'yandexNavi':
      return { app: `yandexnavi://build_route_on_map?lat_to=${lat}&lon_to=${lng}`, web: yandexWeb }
    case 'yandexMaps':
      return { app: `yandexmaps://maps.yandex.com/?rtext=~${lat}%2C${lng}&rtt=auto`, web: yandexWeb }
    case 'waze':
      return { app: `waze://?ll=${lat},${lng}&navigate=yes`, web: `https://waze.com/ul?ll=${lat}%2C${lng}&navigate=yes` }
    case 'apple':
      return { app: `maps://?daddr=${lat},${lng}&dirflg=d`, web: `https://maps.apple.com/?daddr=${lat},${lng}&dirflg=d` }
  }
}

/** The driver's last choice first, the rest in their usual order */
export function orderedApps(os: string, last: MapsApp | null): MapsApp[] {
  const apps = appsFor(os)
  return last && apps.includes(last) ? [last, ...apps.filter((a) => a !== last)] : apps
}

export function isMapsApp(value: unknown): value is MapsApp {
  return typeof value === 'string' && (['google', 'yandexNavi', 'yandexMaps', 'waze', 'apple'] as string[]).includes(value)
}
