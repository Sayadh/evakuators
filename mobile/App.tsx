/**
 * The app's frame.
 *
 * Signed out: sign-in, the sign-up wizard and the privacy policy.
 * Signed in: four tabs (Home · Orders · Profile · More), each with its own
 * stack (src/navigation). Two things still route by SERVER STATE rather than by
 * taps, as before: a live offer takes over the whole screen, and a NEW active
 * order opens itself on Home. The location disclosure takes over Home only
 * (never Orders/Profile/More — withdrawing consent must not bounce the driver).
 */
import * as Location from 'expo-location'
import { StatusBar } from 'expo-status-bar'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Platform, SafeAreaView, StyleSheet, View } from 'react-native'
import { useSystemInsets } from './src/ui/useSystemInsets'
import { getLanguage } from './src/auth/session'
import { LanguageContext, useT, type Language } from './src/i18n'
import { Navigator, type Nav } from './src/navigation/Navigator'
import type { Route } from './src/navigation/routes'
import { ActiveOrderScreen } from './src/screens/ActiveOrderScreen'
import { AlertsSetupScreen } from './src/screens/AlertsSetupScreen'
import { AlertSoundScreen } from './src/screens/AlertSoundScreen'
import { ChangePasswordScreen } from './src/screens/ChangePasswordScreen'
import { HomeScreen } from './src/screens/HomeScreen'
import { LoginScreen } from './src/screens/LoginScreen'
import { MoreScreen } from './src/screens/MoreScreen'
import { OfferScreen } from './src/screens/OfferScreen'
import { OrderDetailScreen } from './src/screens/OrderDetailScreen'
import { OrdersScreen } from './src/screens/OrdersScreen'
import { PermissionsScreen } from './src/screens/PermissionsScreen'
import { PrivacyPolicyScreen } from './src/screens/PrivacyPolicyScreen'
import { PrivacySettingsScreen } from './src/screens/PrivacySettingsScreen'
import { ProfileEditScreen } from './src/screens/ProfileEditScreen'
import { ProfileScreen } from './src/screens/ProfileScreen'
import { RegisterScreen } from './src/screens/RegisterScreen'
import { RequestScreen } from './src/screens/RequestScreen'
import { AppStateProvider, useApp } from './src/state/AppState'
import { ProfileProvider, useProfile } from './src/state/ProfileState'
import { MissedOffersProvider, useMissedOffers } from './src/state/missedOffers'
import { MissedOffersScreen } from './src/screens/MissedOffersScreen'
import { WalletScreen } from './src/screens/WalletScreen'
import { Loading } from './src/ui/kit'
import { colors } from './src/ui/theme'

function SignedOut() {
  const [screen, setScreen] = useState<'login' | 'register' | 'privacy'>('login')
  const [returnTo, setReturnTo] = useState<'login' | 'register'>('login')
  const openPrivacy = (from: 'login' | 'register') => {
    setReturnTo(from)
    setScreen('privacy')
  }
  if (screen === 'privacy') return <PrivacyPolicyScreen onBack={() => setScreen(returnTo)} />
  // The wizard stays mounted while the policy is open, so nothing typed is lost
  return (
    <>
      {screen === 'register' ? (
        <RegisterScreen onBack={() => setScreen('login')} onOpenPrivacy={() => openPrivacy('register')} />
      ) : (
        <LoginScreen onRegister={() => setScreen('register')} onOpenPrivacy={() => openPrivacy('login')} />
      )}
    </>
  )
}

function SignedIn() {
  const t = useT()
  const app = useApp()
  const { profile } = useProfile()
  const missed = useMissedOffers()
  const navRef = useRef<Nav | null>(null)
  const [permissionsDone, setPermissionsDone] = useState(false)
  // «Ոչ հիմա»: the app must stay usable without location (App Store 5.1.2,
  // Play prominent-disclosure rules). Orders need it; Home offers the way back.
  const [permissionsSkipped, setPermissionsSkipped] = useState(false)
  useEffect(() => {
    void Location.getForegroundPermissionsAsync().then((p) => setPermissionsDone(p.granted))
  }, [])

  // A NEW active order (just accepted, or assigned by an operator) opens at
  // once — keyed on the id, so going back is not undone by the next refresh.
  const activeOrderId = app.snapshot?.activeOrder?.id ?? null
  const lastOrderId = useRef<number | null>(null)
  useEffect(() => {
    if (activeOrderId !== null && activeOrderId !== lastOrderId.current) navRef.current?.openOn('home', 'order')
    // The job is over (completed, cancelled, released): its screens close.
    if (activeOrderId === null && lastOrderId.current !== null) navRef.current?.resetStack('home')
    lastOrderId.current = activeOrderId
  }, [activeOrderId])

  const s = app.snapshot
  // A live offer covers everything — but over the tabs, not instead of them,
  // so whatever the driver had open is still there after answering.
  const offer = s?.currentOffer && Date.parse(s.currentOffer.expiresAt) - (Date.now() + app.clock.offsetMs) > 0 ? s.currentOffer : null

  const needsDisclosure = !!s && !permissionsSkipped && (!permissionsDone || (s.trackingConsentVersion ?? 0) < 1)
  const pending = profile?.kind === 'SITE_LINKED' && profile.change.pending !== null

  const render = (route: Route) => {
    const nav = navRef.current
    const pop = () => nav?.pop()
    switch (route.name) {
      case 'home':
        return needsDisclosure ? (
          <PermissionsScreen onDone={() => setPermissionsDone(true)} onSkip={() => setPermissionsSkipped(true)} />
        ) : (
          <HomeScreen />
        )
      case 'permissions':
        return (
          <PermissionsScreen
            onBack={pop}
            onDone={() => {
              setPermissionsDone(true)
              pop()
            }}
            onSkip={() => {
              setPermissionsSkipped(true)
              pop()
            }}
          />
        )
      case 'alertsSetup':
        return <AlertsSetupScreen />
      case 'alertSound':
        return <AlertSoundScreen />
      case 'order':
        return s?.activeOrder ? (
          <ActiveOrderScreen order={s.activeOrder} onCancel={() => nav?.push('orderCancel')} onProblem={() => nav?.push('orderProblem')} onBack={pop} />
        ) : (
          <HomeScreen />
        )
      case 'orderCancel':
      case 'orderProblem':
        return s?.activeOrder ? <RequestScreen orderId={s.activeOrder.id} mode={route.name === 'orderCancel' ? 'CANCEL' : 'PROBLEM'} onDone={pop} /> : <HomeScreen />
      case 'orders':
        return <OrdersScreen />
      case 'missedOffers':
        return <MissedOffersScreen />
      case 'wallet':
        return <WalletScreen />
      case 'orderDetail':
        return <OrderDetailScreen item={route.params.item} />
      case 'profile':
        return <ProfileScreen />
      case 'profileEdit':
        return <ProfileEditScreen section={route.params.section} />
      case 'changePassword':
        return <ChangePasswordScreen />
      case 'more':
        return <MoreScreen />
      case 'privacyPolicy':
        return <PrivacyPolicyScreen onBack={pop} />
      case 'privacySettings':
        return <PrivacySettingsScreen onConsentWithdrawn={() => setPermissionsSkipped(true)} />
    }
  }

  return (
    <View style={{ flex: 1 }}>
    <Navigator
      navRef={navRef}
      render={render}
      tabs={[
        { name: 'home', label: t('tabs.home'), icon: 'home', badge: !!s?.activeOrder },
        { name: 'orders', label: t('tabs.orders'), icon: 'orders', badge: missed.unseen > 0 },
        { name: 'profile', label: t('tabs.profile'), icon: 'user', badge: pending },
        { name: 'more', label: t('tabs.more'), icon: 'menu' },
      ]}
    />
      {offer ? (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg }]}>
          <OfferScreen offer={offer} />
        </View>
      ) : null}
    </View>
  )
}

function Root() {
  const app = useApp()
  if (!app.ready) return <Loading />
  if (!app.loggedIn) return <SignedOut />
  // Keyed on the session: a new sign-in starts from a fresh Home and profile,
  // never on the previous driver's screens.
  return (
    <ProfileProvider>
      <MissedOffersProvider>
        <SignedIn />
      </MissedOffersProvider>
    </ProfileProvider>
  )
}

/**
 * Keeps the app out from under the phone's bars. Android draws edge-to-edge
 * and SafeAreaView pads nothing there, so the status bar and the navigation
 * buttons / gesture strip are padded by hand (useSystemInsets).
 */
function Screen({ children }: { children: ReactNode }) {
  const insets = useSystemInsets()
  if (Platform.OS !== 'android') return <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }}>{children}</SafeAreaView>
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top, paddingBottom: insets.bottom, paddingLeft: insets.left, paddingRight: insets.right }}>
      {children}
    </View>
  )
}

export default function App() {
  const [language, setLanguage] = useState<Language>('hy')
  useEffect(() => {
    void getLanguage().then(setLanguage)
  }, [])
  return (
    <LanguageContext.Provider value={{ language, setLanguage }}>
      <AppStateProvider>
        <Screen>
          <StatusBar style="dark" />
          <Root />
        </Screen>
      </AppStateProvider>
    </LanguageContext.Provider>
  )
}
