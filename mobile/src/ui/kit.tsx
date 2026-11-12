/**
 * The app's component kit — every screen is built from these, so spacing,
 * type and colour stay consistent (tokens in theme.ts). No UI dependency:
 * plain React Native, which keeps the dev build's native surface unchanged.
 */
import React, { useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native'
import { Icon, type IconName } from './Icon'
import { colors, radius, shadow, space, type } from './theme'

export { colors }

// ─── Layout ────────────────────────────────────────────────────────────────

export function Screen({
  children,
  title,
  subtitle,
  header,
  footer,
  refreshing,
  onRefresh,
  contentStyle,
}: {
  children: React.ReactNode
  title?: string
  subtitle?: string
  /** A fixed bar above the scrolling content (see `Header`) */
  header?: React.ReactNode
  /** A fixed bar below it — the primary action of a form */
  footer?: React.ReactNode
  refreshing?: boolean
  onRefresh?: () => void
  contentStyle?: StyleProp<ViewStyle>
}) {
  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {header}
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[styles.content, contentStyle]}
        keyboardShouldPersistTaps="handled"
        refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.primary} /> : undefined}
      >
        {title ? (
          <View style={{ gap: 2, marginBottom: space.xs }}>
            <Text style={styles.title} accessibilityRole="header">{title}</Text>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          </View>
        ) : null}
        {children}
      </ScrollView>
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </KeyboardAvoidingView>
  )
}

/** The bar of a pushed screen: back, title, an optional action on the right */
export function Header({ title, onBack, right }: { title: string; onBack?: () => void; right?: React.ReactNode }) {
  return (
    <View style={styles.header}>
      {onBack ? (
        <Pressable onPress={onBack} hitSlop={12} accessibilityRole="button" accessibilityLabel="back" style={styles.headerButton}>
          <Icon name="chevron-left" size={26} color={colors.primary} />
        </Pressable>
      ) : (
        <View style={styles.headerButton} />
      )}
      <Text style={styles.headerTitle} numberOfLines={1} accessibilityRole="header">
        {title}
      </Text>
      <View style={[styles.headerButton, { alignItems: 'flex-end' }]}>{right}</View>
    </View>
  )
}

export function Card({ children, style, onPress, tone }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; tone?: 'accent' | 'primary' }) {
  const toneStyle = tone === 'accent' ? { borderColor: colors.accent, borderWidth: 2 } : tone === 'primary' ? { backgroundColor: colors.primary, borderColor: colors.primary } : null
  if (!onPress) return <View style={[styles.card, toneStyle, style]}>{children}</View>
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [styles.card, toneStyle, style, pressed && { opacity: 0.85 }]}>
      {children}
    </Pressable>
  )
}

export function Section({ title, action, children, hint }: { title?: string; hint?: string; action?: { label: string; onPress: () => void }; children: React.ReactNode }) {
  return (
    <View style={{ gap: space.sm }}>
      {title || action ? (
        <View style={styles.sectionHead}>
          {title ? <Text style={styles.sectionTitle}>{title}</Text> : <View />}
          {action ? (
            <Pressable onPress={action.onPress} hitSlop={8} accessibilityRole="button">
              <Text style={styles.sectionAction}>{action.label}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      {children}
    </View>
  )
}

export function Divider() {
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />
}

// ─── Actions ───────────────────────────────────────────────────────────────

type ButtonVariant = 'primary' | 'accent' | 'success' | 'danger' | 'outline' | 'ghost'

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  busy,
  icon,
  size = 'md',
  style,
}: {
  label: string
  onPress: () => void
  variant?: ButtonVariant
  disabled?: boolean
  busy?: boolean
  icon?: IconName
  size?: 'md' | 'sm'
  style?: StyleProp<ViewStyle>
}) {
  const filled = variant !== 'outline' && variant !== 'ghost'
  const background = filled ? { primary: colors.primary, accent: colors.accent, success: colors.success, danger: colors.danger }[variant as 'primary'] : 'transparent'
  const foreground = filled ? (variant === 'accent' ? colors.primaryDark : '#fff') : variant === 'ghost' ? colors.primary : colors.primary
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || busy, busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        size === 'sm' && styles.buttonSmall,
        { backgroundColor: background, opacity: disabled ? 0.45 : pressed ? 0.82 : 1 },
        variant === 'outline' && { borderWidth: 1.5, borderColor: colors.borderStrong, backgroundColor: colors.surface },
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={foreground} />
      ) : (
        <View style={styles.buttonInner}>
          {icon ? <Icon name={icon} size={size === 'sm' ? 18 : 20} color={foreground} /> : null}
          <Text style={[styles.buttonText, size === 'sm' && { fontSize: 15 }, { color: foreground }]}>{label}</Text>
        </View>
      )}
    </Pressable>
  )
}

/** One tappable line of a grouped list — settings, profile sections, menus */
export function ListItem({
  icon,
  title,
  subtitle,
  value,
  onPress,
  danger,
  right,
  last,
}: {
  icon?: IconName
  title: string
  subtitle?: string
  value?: string
  onPress?: () => void
  danger?: boolean
  right?: React.ReactNode
  last?: boolean
}) {
  const body = (
    <View style={[styles.listItem, !last && styles.listItemBorder]}>
      {icon ? (
        <View style={[styles.listIcon, danger && { backgroundColor: colors.dangerSoft }]}>
          <Icon name={icon} size={20} color={danger ? colors.danger : colors.primary} />
        </View>
      ) : null}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[styles.listTitle, danger && { color: colors.danger }]}>{title}</Text>
        {subtitle ? <Text style={styles.listSubtitle}>{subtitle}</Text> : null}
      </View>
      {value ? <Text style={styles.listValue} numberOfLines={1}>{value}</Text> : null}
      {right}
      {onPress && !right ? <Icon name="chevron-right" size={18} color={colors.muted} /> : null}
    </View>
  )
  if (!onPress) return body
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => pressed && { backgroundColor: colors.bg }}>
      {body}
    </Pressable>
  )
}

export function ListGroup({ children }: { children: React.ReactNode }) {
  return <View style={[styles.card, { padding: 0, gap: 0, overflow: 'hidden' }]}>{children}</View>
}

// ─── Information ───────────────────────────────────────────────────────────

export function Row({ label, value, tone }: { label: string; value: string; tone?: 'ok' | 'warn' | 'bad' }) {
  const color = tone === 'ok' ? colors.success : tone === 'bad' ? colors.danger : tone === 'warn' ? colors.warning : colors.text
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, { color }]}>{value}</Text>
    </View>
  )
}

export function Note({ children, tone = 'muted' }: { children: React.ReactNode; tone?: 'muted' | 'danger' | 'warn' | 'success' }) {
  const color = tone === 'danger' ? colors.danger : tone === 'warn' ? colors.warning : tone === 'success' ? colors.success : colors.textSecondary
  return <Text style={[styles.note, { color }]}>{children}</Text>
}

const BANNER = {
  info: { bg: colors.primarySoft, fg: colors.primary, icon: 'info' as IconName },
  success: { bg: colors.successSoft, fg: colors.success, icon: 'check' as IconName },
  warn: { bg: colors.warningSoft, fg: colors.warning, icon: 'alert' as IconName },
  danger: { bg: colors.dangerSoft, fg: colors.danger, icon: 'alert' as IconName },
}

export function Banner({ tone = 'info', title, children, action }: { tone?: keyof typeof BANNER; title?: string; children?: React.ReactNode; action?: { label: string; onPress: () => void } }) {
  const t = BANNER[tone]
  return (
    <View style={[styles.banner, { backgroundColor: t.bg }]} accessibilityRole="alert">
      <Icon name={t.icon} size={20} color={t.fg} style={{ marginTop: 1 }} />
      <View style={{ flex: 1, gap: 4 }}>
        {title ? <Text style={[type.bodyStrong, { color: t.fg }]}>{title}</Text> : null}
        {children ? <Text style={[type.small, { color: colors.text }]}>{children}</Text> : null}
        {action ? (
          <Pressable onPress={action.onPress} hitSlop={8} accessibilityRole="button">
            <Text style={[type.label, { color: t.fg, marginTop: 2 }]}>{action.label}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  )
}

const BADGE = {
  neutral: { bg: colors.bg, fg: colors.textSecondary },
  primary: { bg: colors.primarySoft, fg: colors.primary },
  success: { bg: colors.successSoft, fg: colors.success },
  warn: { bg: colors.warningSoft, fg: colors.warning },
  danger: { bg: colors.dangerSoft, fg: colors.danger },
  accent: { bg: colors.accentSoft, fg: colors.accentDark },
}
export type BadgeTone = keyof typeof BADGE

export function Badge({ label, tone = 'neutral', dot }: { label: string; tone?: BadgeTone; dot?: boolean }) {
  const t = BADGE[tone]
  return (
    <View style={[styles.badge, { backgroundColor: t.bg }]}>
      {dot ? <View style={[styles.dot, { backgroundColor: t.fg }]} /> : null}
      <Text style={[type.caption, { color: t.fg }]}>{label}</Text>
    </View>
  )
}

export function EmptyState({ icon, title, text, action }: { icon: IconName; title: string; text?: string; action?: { label: string; onPress: () => void } }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Icon name={icon} size={30} color={colors.primary} />
      </View>
      <Text style={[type.heading, { color: colors.text, textAlign: 'center' }]}>{title}</Text>
      {text ? <Text style={[type.small, { color: colors.textSecondary, textAlign: 'center' }]}>{text}</Text> : null}
      {action ? <Button variant="outline" size="sm" label={action.label} onPress={action.onPress} /> : null}
    </View>
  )
}

export function Loading({ label }: { label?: string }) {
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={colors.primary} size="large" />
      {label ? <Text style={[type.small, { color: colors.textSecondary }]}>{label}</Text> : null}
    </View>
  )
}

/** "Step 2 of 7" as a bar the driver can read at a glance */
export function Steps({ current, total, label }: { current: number; total: number; label: string }) {
  return (
    <View style={{ gap: space.sm }}>
      <View style={{ flexDirection: 'row', gap: 4 }}>
        {Array.from({ length: total }, (_, i) => (
          <View key={i} style={[styles.step, { backgroundColor: i <= current ? colors.accent : colors.border }]} />
        ))}
      </View>
      <Text style={[type.caption, { color: colors.textSecondary }]}>{label}</Text>
    </View>
  )
}

// ─── Inputs ────────────────────────────────────────────────────────────────

export function Field({
  label,
  error,
  hint,
  prefix,
  suffix,
  secure,
  style,
  ...input
}: TextInputProps & { label?: string; error?: string; hint?: string; prefix?: string; suffix?: string; secure?: boolean }) {
  const [hidden, setHidden] = useState(true)
  const [focused, setFocused] = useState(false)
  return (
    <View style={{ gap: 6 }}>
      {label ? <Text style={styles.fieldLabel}>{label}</Text> : null}
      <View style={[styles.inputBox, focused && { borderColor: colors.primary }, error ? { borderColor: colors.danger } : null, input.editable === false && { backgroundColor: colors.bg }]}>
        {prefix ? <Text style={styles.affix}>{prefix}</Text> : null}
        <TextInput
          placeholderTextColor={colors.muted}
          {...input}
          secureTextEntry={secure ? hidden : input.secureTextEntry}
          onFocus={(e) => {
            setFocused(true)
            input.onFocus?.(e)
          }}
          onBlur={(e) => {
            setFocused(false)
            input.onBlur?.(e)
          }}
          accessibilityLabel={input.accessibilityLabel ?? label}
          style={[styles.input, input.multiline && { minHeight: 96, textAlignVertical: 'top', paddingTop: 12 }, style]}
        />
        {suffix ? <Text style={styles.affix}>{suffix}</Text> : null}
        {secure ? (
          <Pressable onPress={() => setHidden((h) => !h)} hitSlop={10} accessibilityRole="button" style={{ paddingHorizontal: 12 }}>
            <Icon name={hidden ? 'eye' : 'eye-off'} size={20} color={colors.muted} />
          </Pressable>
        ) : null}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  )
}

export function Checkbox({ label, value, onChange, disabled, hint }: { label: string; value: boolean; onChange: (value: boolean) => void; disabled?: boolean; hint?: string }) {
  return (
    <Pressable
      onPress={() => !disabled && onChange(!value)}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: value, disabled }}
      style={({ pressed }) => [styles.checkRow, pressed && !disabled && { opacity: 0.7 }, disabled && { opacity: 0.55 }]}
    >
      <View style={[styles.checkbox, value && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
        {value ? <Icon name="check" size={16} color="#fff" /> : null}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[type.body, { color: colors.text }]}>{label}</Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>
    </Pressable>
  )
}

export interface Choice<T extends string = string> {
  value: T
  label: string
  hint?: string
}

/** Pick one — large rows a driver can hit with a thumb */
export function ChoiceList<T extends string>({ options, value, onChange, error }: { options: Choice<T>[]; value: T | '' | null; onChange: (value: T) => void; error?: string }) {
  return (
    <View style={{ gap: space.sm }}>
      {options.map((option) => {
        const selected = option.value === value
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            style={[styles.choice, selected && styles.choiceSelected]}
          >
            <View style={[styles.radio, selected && { borderColor: colors.primary }]}>{selected ? <View style={styles.radioDot} /> : null}</View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[type.bodyStrong, { color: colors.text }]}>{option.label}</Text>
              {option.hint ? <Text style={styles.hint}>{option.hint}</Text> : null}
            </View>
          </Pressable>
        )
      })}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  )
}

/** Pick many — compact chips that wrap */
export function Chips({ options, selected, onToggle, isDisabled }: { options: Choice[]; selected: readonly string[]; onToggle: (value: string) => void; isDisabled?: (value: string) => boolean }) {
  return (
    <View style={styles.chips}>
      {options.map((option) => {
        const on = selected.includes(option.value)
        const disabled = !on && !!isDisabled?.(option.value)
        return (
          <Pressable
            key={option.value}
            onPress={() => !disabled && onToggle(option.value)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on, disabled }}
            style={[styles.chip, on && styles.chipOn, disabled && { opacity: 0.4 }]}
          >
            {on ? <Icon name="check" size={14} color="#fff" /> : null}
            <Text style={[type.label, { color: on ? '#fff' : colors.text, fontWeight: on ? '700' : '500' }]}>{option.label}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}

export function SwitchRow({ label, hint, value, onChange, disabled }: { label: string; hint?: string; value: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
  return (
    <View style={styles.switchRow}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[type.bodyStrong, { color: colors.text }]}>{label}</Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>
      <Switch
        value={value}
        disabled={disabled}
        onValueChange={onChange}
        accessibilityLabel={label}
        trackColor={{ true: colors.success, false: colors.borderStrong }}
        thumbColor="#fff"
        ios_backgroundColor={colors.borderStrong}
      />
    </View>
  )
}

// ─── Overlays ──────────────────────────────────────────────────────────────

/** A bottom sheet: explanations, consent, confirmations */
export function Sheet({ visible, onClose, title, children, footer }: { visible: boolean; onClose: () => void; title: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.sheetBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="close" />
        <View style={styles.sheet}>
          <View style={styles.sheetGrip} />
          <View style={styles.sheetHead}>
            <Text style={[type.heading, { color: colors.text, flex: 1 }]} accessibilityRole="header">{title}</Text>
            <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="close">
              <Icon name="close" size={22} color={colors.muted} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ gap: space.md, paddingBottom: space.lg }}>{children}</ScrollView>
          {footer ? <View style={{ gap: space.sm, paddingTop: space.sm }}>{footer}</View> : null}
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.lg, gap: space.lg, paddingBottom: space.xxxl },
  title: { ...type.title, color: colors.text },
  subtitle: { ...type.body, color: colors.textSecondary },
  footer: { padding: space.lg, paddingTop: space.md, backgroundColor: colors.surface, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, gap: space.sm },
  header: { height: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.sm, backgroundColor: colors.surface, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  headerButton: { width: 56, height: 44, justifyContent: 'center', paddingHorizontal: space.sm },
  headerTitle: { flex: 1, textAlign: 'center', ...type.heading, color: colors.text },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: space.lg, borderWidth: 1, borderColor: colors.border, gap: space.sm, ...shadow.card },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 2 },
  sectionTitle: { ...type.caption, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.6 },
  sectionAction: { ...type.label, color: colors.primaryLight },
  button: { minHeight: 52, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.lg },
  buttonSmall: { minHeight: 40, paddingHorizontal: space.md },
  buttonInner: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  buttonText: { fontSize: 17, fontWeight: '700' },
  listItem: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: 14, minHeight: 56 },
  listItemBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  listIcon: { width: 36, height: 36, borderRadius: radius.sm, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  listTitle: { ...type.bodyStrong, color: colors.text },
  listSubtitle: { ...type.small, color: colors.textSecondary },
  listValue: { ...type.small, color: colors.textSecondary, maxWidth: '45%' },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: space.md },
  rowLabel: { ...type.small, color: colors.textSecondary, fontSize: 15 },
  rowValue: { fontSize: 15, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  note: { fontSize: 14, lineHeight: 20 },
  banner: { flexDirection: 'row', gap: space.md, padding: space.md, borderRadius: radius.md },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.full, alignSelf: 'flex-start' },
  dot: { width: 7, height: 7, borderRadius: 4 },
  empty: { alignItems: 'center', gap: space.sm, paddingVertical: space.xxl, paddingHorizontal: space.xl },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', marginBottom: space.xs },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md, padding: space.xxl, backgroundColor: colors.bg },
  step: { flex: 1, height: 4, borderRadius: 2 },
  fieldLabel: { ...type.label, color: colors.text },
  inputBox: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface },
  input: { flex: 1, paddingHorizontal: 14, paddingVertical: Platform.OS === 'ios' ? 14 : 10, fontSize: 17, color: colors.text },
  affix: { paddingHorizontal: 12, fontSize: 16, color: colors.textSecondary, fontWeight: '600' },
  error: { ...type.small, color: colors.danger },
  hint: { ...type.small, color: colors.textSecondary },
  checkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md, paddingVertical: 6 },
  checkbox: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  choice: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surface },
  choiceSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 11, height: 11, borderRadius: 6, backgroundColor: colors.primary },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: radius.full, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surface },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 4 },
  sheetBackdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: space.lg, paddingBottom: space.xxl, maxHeight: '88%', gap: space.sm },
  sheetGrip: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: colors.border, marginBottom: space.xs },
  sheetHead: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.xs },
})
