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
    /**
     * Apple privacy manifest (required since 2024). React Native and Expo
     * modules use these "required reason" APIs; the codes are Apple's
     * documented reasons for app-internal use. No tracking, no tracking
     * domains. What data is collected is declared separately in App Store
     * Connect (App Privacy) — see docs/live-dispatch/12-store-submission.md.
     * Apple emails the exact missing entries after a TestFlight upload, if any.
     */
    privacyManifests: {
      NSPrivacyTracking: false,
      NSPrivacyTrackingDomains: [],
      NSPrivacyAccessedAPITypes: [
        { NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryUserDefaults', NSPrivacyAccessedAPITypeReasons: ['CA92.1'] },
        { NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryFileTimestamp', NSPrivacyAccessedAPITypeReasons: ['C617.1', '0A2A.1', '3B52.1'] },
        { NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategorySystemBootTime', NSPrivacyAccessedAPITypeReasons: ['35F9.1'] },
        { NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryDiskSpace', NSPrivacyAccessedAPITypeReasons: ['E174.1', '85F4.1'] },
      ],
    },
  },
  /** iOS permission texts in other languages (Armenian is the base, above). App Review reads English. */
  locales: {
    en: './locales/en.json',
    ru: './locales/ru.json',
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
    /**
     * Added by templates/libraries, unused by this app — and SYSTEM_ALERT_WINDOW
     * is a sensitive permission Play reviewers ask about. Data minimisation:
     * request only what the app uses (Play & App Store policy).
     */
    blockedPermissions: [
      'android.permission.SYSTEM_ALERT_WINDOW',
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
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
    // React Native Firebase resolves Firebase via SPM on iOS; its Swift Package
    // products are automatic (non-dynamic) libraries, so static pod linkage
    // makes every react-native-firebase pod embed its own copy and collide at
    // link time. Dynamic linkage is the supported combination (rnfirebase.io/ios-spm).
    ['expo-build-properties', { ios: { useFrameworks: 'dynamic' } }],
  ],
  extra: {
    apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL ?? '',
    /** The website: privacy policy and account-deletion pages live there (/driver-app/…) */
    websiteUrl: process.env.EXPO_PUBLIC_WEBSITE_URL ?? 'https://evakuators.am',
  },
}

export default config
