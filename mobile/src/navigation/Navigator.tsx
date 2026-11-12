/**
 * Navigation without a navigation library: four tabs, each its own stack.
 *
 * The app's screens are few and its flow is decided by SERVER state (an offer
 * takes over the screen, an accepted order opens itself — App.tsx), so a
 * routing dependency would add a native module and a second state machine for
 * little gain. This is the small part that is genuinely local: which tab, and
 * what was pushed on it. Android's back button pops the current stack, then
 * returns to Home, then leaves the app.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { Animated, BackHandler, Easing, Pressable, StyleSheet, Text, View } from 'react-native'
import { Icon, type IconName } from '../ui/Icon'
import { colors, space } from '../ui/theme'
import type { Route, RouteName, RouteParams, TabName } from './routes'

type PushArgs<K extends RouteName> = RouteParams[K] extends undefined ? [name: K] : [name: K, params: RouteParams[K]]

export interface Nav {
  tab: TabName
  push<K extends RouteName>(...args: PushArgs<K>): void
  pop(): void
  popToRoot(): void
  switchTab(tab: TabName, reset?: boolean): void
  /** Back to the tab's first screen without switching to it */
  resetStack(tab: TabName): void
  /** Open a screen on another tab's stack (e.g. the active order from a notification) */
  openOn<K extends RouteName>(tab: TabName, ...args: PushArgs<K>): void
}

const NavContext = createContext<Nav | null>(null)

export function useNav(): Nav {
  const nav = useContext(NavContext)
  if (!nav) throw new Error('useNav outside Navigator')
  return nav
}

const ROOTS: Record<TabName, RouteName> = { home: 'home', orders: 'orders', profile: 'profile', more: 'more' }
let keySeq = 0
const route = (name: RouteName, params?: unknown): Route => ({ name, params, key: `${name}-${++keySeq}` }) as Route

export interface TabSpec {
  name: TabName
  label: string
  icon: IconName
  badge?: boolean
}

export function Navigator({
  tabs,
  render,
  navRef,
}: {
  tabs: TabSpec[]
  render: (route: Route) => React.ReactNode
  /** Lets App.tsx react to server state (open the active order) */
  navRef?: React.MutableRefObject<Nav | null>
}) {
  const [tab, setTab] = useState<TabName>('home')
  const [stacks, setStacks] = useState<Record<TabName, Route[]>>(() => ({
    home: [route('home')],
    orders: [route('orders')],
    profile: [route('profile')],
    more: [route('more')],
  }))
  const stacksRef = useRef(stacks)
  stacksRef.current = stacks
  const tabRef = useRef(tab)
  tabRef.current = tab

  const slide = useRef(new Animated.Value(1)).current
  const animateIn = useCallback(() => {
    slide.setValue(0)
    Animated.timing(slide, { toValue: 1, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start()
  }, [slide])

  const nav = useMemo<Nav>(
    () => ({
      tab,
      push: ((name: RouteName, params?: unknown) => {
        setStacks((s) => ({ ...s, [tabRef.current]: [...s[tabRef.current], route(name, params)] }))
        animateIn()
      }) as Nav['push'],
      pop: () => setStacks((s) => (s[tabRef.current].length > 1 ? { ...s, [tabRef.current]: s[tabRef.current].slice(0, -1) } : s)),
      popToRoot: () => setStacks((s) => ({ ...s, [tabRef.current]: s[tabRef.current].slice(0, 1) })),
      switchTab: (next: TabName, reset = false) => {
        setTab(next)
        if (reset) setStacks((s) => ({ ...s, [next]: [route(ROOTS[next])] }))
      },
      resetStack: (target: TabName) => setStacks((s) => (s[target].length > 1 ? { ...s, [target]: [route(ROOTS[target])] } : s)),
      openOn: ((target: TabName, name: RouteName, params?: unknown) => {
        setTab(target)
        setStacks((s) => {
          const stack = s[target]
          if (stack[stack.length - 1]?.name === name) return s
          return { ...s, [target]: [stack[0], route(name, params)] }
        })
        animateIn()
      }) as Nav['openOn'],
    }),
    [tab, animateIn],
  )

  useEffect(() => {
    if (navRef) navRef.current = nav
  }, [nav, navRef])

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      const current = stacksRef.current[tabRef.current]
      if (current.length > 1) {
        nav.pop()
        return true
      }
      if (tabRef.current !== 'home') {
        setTab('home')
        return true
      }
      return false
    })
    return () => sub.remove()
  }, [nav])

  const translateX = slide.interpolate({ inputRange: [0, 1], outputRange: [24, 0] })

  return (
    <NavContext.Provider value={nav}>
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        {/* Every tab stays mounted (its scroll position, loaded list and form
            survive a tab switch); only the active one is shown and animated. */}
        {(Object.keys(stacks) as TabName[]).map((name) => {
          const stack = stacks[name]
          const top = stack[stack.length - 1]
          const active = name === tab
          return (
            <Animated.View
              key={`${name}:${top.key}`}
              style={active ? { flex: 1, opacity: slide, transform: [{ translateX }] } : { display: 'none' }}
            >
              {render(top)}
            </Animated.View>
          )
        })}
        <View style={styles.tabBar} accessibilityRole="tablist">
          {tabs.map((spec) => {
            const active = spec.name === tab
            return (
              <Pressable
                key={spec.name}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                accessibilityLabel={spec.label}
                onPress={() => (active ? nav.popToRoot() : nav.switchTab(spec.name))}
                style={styles.tab}
              >
                <View>
                  <Icon name={spec.icon} size={24} color={active ? colors.primary : colors.muted} />
                  {spec.badge ? <View style={styles.badge} /> : null}
                </View>
                <Text style={[styles.tabLabel, { color: active ? colors.primary : colors.muted, fontWeight: active ? '700' : '500' }]} numberOfLines={1}>
                  {spec.label}
                </Text>
              </Pressable>
            )
          })}
        </View>
      </View>
    </NavContext.Provider>
  )
}

const styles = StyleSheet.create({
  tabBar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: space.sm,
    paddingBottom: space.sm,
  },
  tab: { flex: 1, alignItems: 'center', gap: 3, paddingVertical: 2 },
  tabLabel: { fontSize: 11 },
  badge: { position: 'absolute', top: -2, right: -4, width: 9, height: 9, borderRadius: 5, backgroundColor: colors.accent, borderWidth: 1.5, borderColor: colors.surface },
})
