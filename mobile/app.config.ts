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
import { withEntitlementsPlist, type ConfigPlugin } from 'expo/config-plugins'

const LOCATION_ALWAYS =
  'Evakuators-ը օգտագործում է ձեր տեղադրությունը, երբ միացրել եք «Ընդունում եմ պատվերներ», կամ ունեք ակտիվ պատվեր, նաև երբ հավելվածը փակ է՝ մոտակա պատվերներ առաջարկելու և հաճախորդին ձեր ճանապարհը ցույց տալու համար։'
const LOCATION_WHEN_IN_USE = 'Evakuators-ը օգտագործում է ձեր տեղադրությունը՝ մոտակա պատվերներ առաջարկելու համար։'

/**
 * iOS Critical Alerts for the offer ring — rings through silent mode and Do
 * Not Disturb. The entitlement must be APPROVED by Apple first
 * (developer.apple.com/contact/request/notifications-critical-alerts-entitlement);
 * a build that claims it without approval fails code signing. Off until then.
 * The backend's APNS_CRITICAL_ALERTS sends the critical sound.
 */
const IOS_CRITICAL_ALERTS = process.env.IOS_CRITICAL_ALERTS === 'true'

/**
 * A build signable with a FREE Apple ID ("Personal Team"), for trying the app
 * on your own iPhone before the paid Apple Developer account exists. Apple
 * gives personal teams no Push Notifications (nor time-sensitive / critical
 * alerts), so this build has none of those entitlements: everything in the app
 * works and the «Փորձարկել» test alert works (it is local), but offers do NOT
 * arrive on a locked phone — that needs push, i.e. the paid account.
 *   IOS_PERSONAL_TEAM=true npx expo prebuild --clean && npx expo run:ios --device
 * Never for TestFlight / App Store builds.
 */
const IOS_PERSONAL_TEAM = process.env.IOS_PERSONAL_TEAM === 'true'

const withoutPushEntitlements: ConfigPlugin = (cfg) =>
  withEntitlementsPlist(cfg, (mod) => {
    delete mod.modResults['aps-environment']
    delete mod.modResults['com.apple.developer.usernotifications.time-sensitive']
    delete mod.modResults['com.apple.developer.usernotifications.critical-alerts']
    return mod
  })

/** Brand navy — the app icon and splash background (same as the website header) */
const BRAND_NAVY = '#14304f'

/**
 * A store build must talk to production. The local `.env` points at a
 * temporary tunnel (trycloudflare) while developing; a Release/production
 * build that picked it up would ship an app that stops working the moment
 * the tunnel closes. Refused here, at build time (2026-11-12 review).
 */
const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? ''
if (process.env.EAS_BUILD_PROFILE === 'production' && !/^https:\/\/api\.evakuators\.am\//.test(API_BASE_URL)) {
  throw new Error(`Production build with EXPO_PUBLIC_API_BASE_URL=${API_BASE_URL || '(empty)'} — must be https://api.evakuators.am/api/v1`)
}

const CAMERA = 'Evakuators-ը տեսախցիկն օգտագործում է միայն այն ժամանակ, երբ նկարում եք Ձեր էվակուատորը պրոֆիլի համար։'
const PHOTOS = 'Evakuators-ը բացում է Ձեր նկարները միայն, որպեսզի ընտրեք Ձեր էվակուատորի նկարները պրոֆիլի համար։'

/** Photos for the sign-up and profile (2026-11) — needs `npx expo install expo-image-picker` and a new dev build */
const hasImagePickerPackage = (() => {
  try {
    require.resolve('expo-image-picker/package.json')
    return true
  } catch {
    return false
  }
})()

/** The splash plugin is used once `npx expo install expo-splash-screen` has run */
const hasSplashScreenPackage = (() => {
  try {
    require.resolve('expo-splash-screen/package.json')
    return true
  } catch {
    return false
  }
})()

const config: ExpoConfig = {
  name: 'Evakuators Driver',
  slug: 'evakuators-driver',
  scheme: 'evakuators-driver',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  ios: {
    bundleIdentifier: 'am.evakuators.driver',
    supportsTablet: false,
    googleServicesFile: process.env.GOOGLE_SERVICES_PLIST ?? './GoogleService-Info.plist',
    // Offer pushes are `interruption-level: time-sensitive`: they break through Focus modes
    entitlements: {
      'com.apple.developer.usernotifications.time-sensitive': true,
      ...(IOS_CRITICAL_ALERTS ? { 'com.apple.developer.usernotifications.critical-alerts': true } : {}),
    },
    infoPlist: {
      // Only HTTPS/TLS from the OS — no own encryption: answers App Store
      // Connect's export-compliance question once, instead of on every upload
      ITSAppUsesNonExemptEncryption: false,
      UIBackgroundModes: ['location', 'remote-notification'],
      NSLocationWhenInUseUsageDescription: LOCATION_WHEN_IN_USE,
      NSLocationAlwaysAndWhenInUseUsageDescription: LOCATION_ALWAYS,
      NSCameraUsageDescription: CAMERA,
      NSPhotoLibraryUsageDescription: PHOTOS,
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
    adaptiveIcon: { foregroundImage: './assets/adaptive-icon.png', backgroundColor: BRAND_NAVY },
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
    // The offer ring (≤ 30 s, Apple's limit), bundled for iOS and copied to Android res/raw.
    // The selectable new-order rings (src/push/sounds.ts). The file names are
    // the ones backend notify/push.service.ts ALERT_SOUNDS puts in the iOS push.
    [
      'expo-notifications',
      {
        // Android's status-bar / notification small icon: a white silhouette
        // of the logo's truck (Android paints it; a full-colour icon would be
        // a white square). iOS always shows the app icon (assets/icon.png: the site's logo with «Evakuators.am»).
        icon: './assets/notification-icon.png',
        color: BRAND_NAVY,
        sounds: ['alert', 'urgent', 'orchestra', 'siren', 'melody', 'magic', 'reward', 'riff', 'piano', 'marimba', 'sunrise', 'vibes', 'kalimba', 'guitar', 'harp', 'flute', 'chime', 'bells', 'doorbell', 'calm', 'digital'].map((name) => `./assets/sounds/offer_${name}.wav`),
      },
    ],
    // Camera + photo library for the vehicle photos. No microphone: photos only.
    ...(hasImagePickerPackage
      ? [['expo-image-picker', { photosPermission: PHOTOS, cameraPermission: CAMERA, microphonePermission: false }] as [string, unknown]]
      : []),
    ...(hasSplashScreenPackage
      ? [['expo-splash-screen', { image: './assets/splash.png', imageWidth: 240, resizeMode: 'contain', backgroundColor: BRAND_NAVY }] as [string, unknown]]
      : []),
    '@react-native-firebase/app',
    '@react-native-firebase/messaging',
    // React Native Firebase resolves Firebase via SPM on iOS; its Swift Package
    // products are automatic (non-dynamic) libraries, so static pod linkage
    // makes every react-native-firebase pod embed its own copy and collide at
    // link time. Dynamic linkage is the supported combination (rnfirebase.io/ios-spm).
    ['expo-build-properties', { ios: { useFrameworks: 'dynamic' } }],
  ],
  owner: 'sayadh',
  extra: {
    /** EAS project (expo.dev/accounts/sayadh/projects/evakuators-driver) */
    eas: { projectId: '5c8014aa-3e17-432c-93ff-cca756db6f48' },
    iosCriticalAlerts: IOS_CRITICAL_ALERTS,
    apiBaseUrl: API_BASE_URL,
    /** The website: privacy policy and account-deletion pages live there (/driver-app/…) */
    websiteUrl: process.env.EXPO_PUBLIC_WEBSITE_URL ?? 'https://evakuators.am',
  },
}

// Applied around the whole config, so its mod is registered before the
// `plugins` above — mods run last-registered-first, so this one runs LAST and
// removes what expo-notifications / Firebase added (see IOS_PERSONAL_TEAM).
export default IOS_PERSONAL_TEAM ? withoutPushEntitlements(config) : config
