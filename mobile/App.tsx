/**
 * Routing by STATE, not by history: what is on screen is a function of the
 * server snapshot. A live offer always takes over the screen; an active order
 * comes next. (No navigation library: nine screens, one flow.)
 */
import * as Location from 'expo-location'
import { StatusBar } from 'expo-status-bar'
import { useEffect, useState } from 'react'
import { SafeAreaView } from 'react-native'
import { getLanguage } from './src/auth/session'
import { LanguageContext, type Language } from './src/i18n'
import { ActiveOrderScreen } from './src/screens/ActiveOrderScreen'
import { HistoryScreen } from './src/screens/HistoryScreen'
import { HomeScreen } from './src/screens/HomeScreen'
import { LoginScreen } from './src/screens/LoginScreen'
import { OfferScreen } from './src/screens/OfferScreen'
import { PermissionsScreen } from './src/screens/PermissionsScreen'
import { RegisterScreen } from './src/screens/RegisterScreen'
import { RequestScreen } from './src/screens/RequestScreen'
import { SettingsScreen } from './src/screens/SettingsScreen'
import { AppStateProvider, useApp } from './src/state/AppState'
import { colors } from './src/ui/kit'

type Route = 'home' | 'order' | 'cancel' | 'problem' | 'history' | 'settings' | 'permissions'

function Router() {
  const app = useApp()
  const [route, setRoute] = useState<Route>('home')
  const [permissionsDone, setPermissionsDone] = useState(false)
  // «Ոչ հիմա»: the app must stay usable without location (App Store 5.1.2,
  // Play prominent-disclosure rules) — history, settings, account deletion.
  // Orders need it; Home shows a way back here (route 'permissions').
  const [permissionsSkipped, setPermissionsSkipped] = useState(false)
  const [registering, setRegistering] = useState(false)
  // Skip the explanation screen on later launches when everything is already
  // in place; revoked permission (Settings) brings it back.
  useEffect(() => {
    void Location.getForegroundPermissionsAsync().then((p) => setPermissionsDone(p.granted))
    // A new sign-in (or a deleted account / logout) starts from Home with a
    // fresh choice — never on the previous driver's Settings screen.
    setRoute('home')
    setPermissionsSkipped(false)
  }, [app.loggedIn])
  if (!app.ready) return null
  if (!app.loggedIn) {
    return registering ? <RegisterScreen onBack={() => setRegistering(false)} /> : <LoginScreen onRegister={() => setRegistering(true)} />
  }
  const s = app.snapshot
  // The disclosure takes over only the HOME screen: Settings/History stay
  // reachable (withdrawing consent in Settings must not bounce the driver).
  if (route === 'permissions' || (route === 'home' && s && !permissionsSkipped && (!permissionsDone || (s.trackingConsentVersion ?? 0) < 1))) {
    return (
      <PermissionsScreen
        onDone={() => {
          setPermissionsDone(true)
          setRoute('home')
        }}
        onSkip={() => {
          setPermissionsSkipped(true)
          setRoute('home')
        }}
      />
    )
  }
  if (s?.currentOffer && secondsLeftPositive(s.currentOffer.expiresAt, app.clock.offsetMs)) return <OfferScreen offer={s.currentOffer} />
  if ((route === 'cancel' || route === 'problem') && s?.activeOrder) {
    return <RequestScreen orderId={s.activeOrder.id} mode={route === 'cancel' ? 'CANCEL' : 'PROBLEM'} onDone={() => setRoute('order')} />
  }
  if (route === 'order' && s?.activeOrder) {
    return (
      <ActiveOrderScreen order={s.activeOrder} onCancel={() => setRoute('cancel')} onProblem={() => setRoute('problem')} onBack={() => setRoute('home')} />
    )
  }
  if (route === 'history') return <HistoryScreen onBack={() => setRoute('home')} />
  if (route === 'settings') return <SettingsScreen onBack={() => setRoute('home')} onConsentWithdrawn={() => setPermissionsSkipped(true)} />
  return <HomeScreen go={setRoute} />
}

function secondsLeftPositive(expiresAt: string, offsetMs: number): boolean {
  return Date.parse(expiresAt) - (Date.now() + offsetMs) > 0
}

export default function App() {
  const [language, setLanguage] = useState<Language>('hy')
  useEffect(() => {
    void getLanguage().then(setLanguage)
  }, [])
  return (
    <LanguageContext.Provider value={{ language, setLanguage }}>
      <AppStateProvider>
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
          <StatusBar style="dark" />
          <Router />
        </SafeAreaView>
      </AppStateProvider>
    </LanguageContext.Provider>
  )
}
