/**
 * Line icons (assets/ui/icons, drawn for this app, white on transparent so
 * `tintColor` paints them in any brand colour). @2x/@3x are picked by Metro.
 */
import { Image, type ImageStyle, type StyleProp } from 'react-native'
import { colors } from './theme'

const SOURCES = {
  alert: require('../../assets/ui/icons/alert.png'),
  bell: require('../../assets/ui/icons/bell.png'),
  calendar: require('../../assets/ui/icons/calendar.png'),
  camera: require('../../assets/ui/icons/camera.png'),
  check: require('../../assets/ui/icons/check.png'),
  'chevron-down': require('../../assets/ui/icons/chevron-down.png'),
  'chevron-left': require('../../assets/ui/icons/chevron-left.png'),
  'chevron-right': require('../../assets/ui/icons/chevron-right.png'),
  clock: require('../../assets/ui/icons/clock.png'),
  close: require('../../assets/ui/icons/close.png'),
  document: require('../../assets/ui/icons/document.png'),
  edit: require('../../assets/ui/icons/edit.png'),
  eye: require('../../assets/ui/icons/eye.png'),
  'eye-off': require('../../assets/ui/icons/eye-off.png'),
  globe: require('../../assets/ui/icons/globe.png'),
  home: require('../../assets/ui/icons/home.png'),
  image: require('../../assets/ui/icons/image.png'),
  info: require('../../assets/ui/icons/info.png'),
  language: require('../../assets/ui/icons/language.png'),
  lock: require('../../assets/ui/icons/lock.png'),
  logout: require('../../assets/ui/icons/logout.png'),
  menu: require('../../assets/ui/icons/menu.png'),
  navigation: require('../../assets/ui/icons/navigation.png'),
  orders: require('../../assets/ui/icons/orders.png'),
  phone: require('../../assets/ui/icons/phone.png'),
  pin: require('../../assets/ui/icons/pin.png'),
  plus: require('../../assets/ui/icons/plus.png'),
  play: require('../../assets/ui/icons/play.png'),
  power: require('../../assets/ui/icons/power.png'),
  refresh: require('../../assets/ui/icons/refresh.png'),
  route: require('../../assets/ui/icons/route.png'),
  shield: require('../../assets/ui/icons/shield.png'),
  sliders: require('../../assets/ui/icons/sliders.png'),
  stop: require('../../assets/ui/icons/stop.png'),
  star: require('../../assets/ui/icons/star.png'),
  tag: require('../../assets/ui/icons/tag.png'),
  trash: require('../../assets/ui/icons/trash.png'),
  truck: require('../../assets/ui/icons/truck.png'),
  user: require('../../assets/ui/icons/user.png'),
  wallet: require('../../assets/ui/icons/wallet.png'),
} as const

export type IconName = keyof typeof SOURCES

export function Icon({ name, size = 22, color = colors.text, style }: { name: IconName; size?: number; color?: string; style?: StyleProp<ImageStyle> }) {
  return <Image source={SOURCES[name]} style={[{ width: size, height: size, tintColor: color }, style]} resizeMode="contain" accessibilityIgnoresInvertColors />
}
