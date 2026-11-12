/**
 * Every pushed screen and its parameters — one table, so a `push` with the
 * wrong params is a type error rather than a blank screen.
 */
import type { HistoryItem } from '../api/types'
import type { ProfileSection } from '../profile/sections'

export type TabName = 'home' | 'orders' | 'profile' | 'more'

export interface RouteParams {
  home: undefined
  order: undefined
  orderCancel: undefined
  orderProblem: undefined
  permissions: undefined
  alertsSetup: undefined
  alertSound: undefined
  orders: undefined
  orderDetail: { item: HistoryItem }
  missedOffers: undefined
  wallet: undefined
  profile: undefined
  profileEdit: { section: ProfileSection }
  changePassword: undefined
  more: undefined
  privacyPolicy: undefined
  privacySettings: undefined
}

export type RouteName = keyof RouteParams

export type Route = { [K in RouteName]: { name: K; params: RouteParams[K]; key: string } }[RouteName]
