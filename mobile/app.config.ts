/**
 * Expo DEVELOPMENT BUILD (not Expo Go): background location needs an Android
 * foreground service and iOS `UIBackgroundModes: location`, and push needs
 * FCM/APNs native config — none of which Expo Go supports (docs.expo.dev,
 * Location → "Background location"). Native projects are generated from this
 * file by `expo prebuild` (CNG), so they are not committed.
 *
 * Secrets are NOT here. The Firebase files are downloaded per environment and
 * referenced by path; the API base URL is public by nature.
 */
import type { ExpoConfig } from 'expo/config'

const LOCATION_ALWAYS =
  'Evakuators-ը օգտագործում է ձեր տեղադրությունը, երբ միացրել եք «Ընդունում եմ պատվերներ», կամ ունեք ակտիվ պատվեր, նաև երբ հավելվածը փակ է՝ մոտակա պատվերներ առաջարկելու և հաճախորդին ձեր ճանապարհը ցույց տալու համար։'
const LOCATION_WHEN_IN_USE = 'Evakuators-ը օգտագործում է ձեր տեղադրությունը՝ մոտակա պատվերներ առաջարկելու համար։'

const config: ExpoConfig = {
  name: 'Evakuators Driver',
  slug: 'evakuators-driver',
  scheme: 'evakuators-driver',
  version: '1.0.0',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  ios: {
    bundleIdentifier: 'am.evakuators.driver',
    supportsTablet: false,
    googleServicesFile: process.env.GOOGLE_SERVICES_PLIST ?? './GoogleService-Info.plist',
    infoPlist: {
      UIBackgroundModes: ['location', 'remote-notification'],
      NSLocationWhenInUseUsageDescription: LOCATION_WHEN_IN_USE,
      NSLocationAlwaysAndWhenInUseUsageDescription: LOCATION_ALWAYS,
    },
  },
  android: {
    package: 'am.evakuators.driver',
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? './google-services.json',
    permissions: [
      'android.permission.ACCESS_COARSE_LOCATION',
      'android.permission.ACCESS_FINE_LOCATION',
      'android.permission.ACCESS_BACKGROUND_LOCATION',
      'android.permission.FOREGROUND_SERVICE',
      'android.permission.FOREGROUND_SERVICE_LOCATION',
      'android.permission.POST_NOTIFICATIONS',
    ],
  },
  plugins: [
    [
      'expo-location',
      {
        locationAlwaysAndWhenInUsePermission: LOCATION_ALWAYS,
        isAndroidBackgroundLocationEnabled: true,
        isAndroidForegroundServiceEnabled: true,
        isIosBackgroundLocationEnabled: true,
      },
    ],
    'expo-secure-store',
    ['expo-notifications', { color: '#14304f' }],
    '@react-native-firebase/app',
    '@react-native-firebase/messaging',
    // React Native Firebase on iOS requires static frameworks.
    ['expo-build-properties', { ios: { useFrameworks: 'static' } }],
  ],
  extra: {
    apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL ?? '',
  },
}

export default config
