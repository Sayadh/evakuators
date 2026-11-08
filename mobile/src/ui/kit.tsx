import React from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, type ViewStyle } from 'react-native'

export const colors = {
  primary: '#14304f',
  accent: '#f6a821',
  success: '#1d9e55',
  danger: '#d64545',
  bg: '#f4f6f9',
  surface: '#ffffff',
  border: '#e3e8ef',
  text: '#1c2733',
  muted: '#8494a7',
}

export function Screen({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {title ? <Text style={styles.title} accessibilityRole="header">{title}</Text> : null}
      {children}
    </ScrollView>
  )
}

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  busy,
}: {
  label: string
  onPress: () => void
  variant?: 'primary' | 'accent' | 'success' | 'danger' | 'outline'
  disabled?: boolean
  busy?: boolean
}) {
  const background = variant === 'outline' ? 'transparent' : colors[variant === 'primary' ? 'primary' : variant]
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: background, opacity: disabled ? 0.45 : pressed ? 0.8 : 1 },
        variant === 'outline' && { borderWidth: 1, borderColor: colors.primary },
      ]}
    >
      {busy ? <ActivityIndicator color={variant === 'outline' ? colors.primary : '#fff'} /> : <Text style={[styles.buttonText, variant === 'outline' && { color: colors.primary }]}>{label}</Text>}
    </Pressable>
  )
}

export function Row({ label, value, tone }: { label: string; value: string; tone?: 'ok' | 'warn' | 'bad' }) {
  const color = tone === 'ok' ? colors.success : tone === 'bad' ? colors.danger : tone === 'warn' ? colors.accent : colors.text
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, { color }]}>{value}</Text>
    </View>
  )
}

export function Note({ children, tone = 'muted' }: { children: React.ReactNode; tone?: 'muted' | 'danger' | 'warn' }) {
  const color = tone === 'danger' ? colors.danger : tone === 'warn' ? '#a86a00' : colors.muted
  return <Text style={[styles.note, { color }]}>{children}</Text>
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 12, paddingBottom: 48 },
  title: { fontSize: 22, fontWeight: '700', color: colors.text, marginBottom: 4 },
  card: { backgroundColor: colors.surface, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: colors.border, gap: 8 },
  button: { minHeight: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  rowLabel: { color: colors.muted, fontSize: 15 },
  rowValue: { fontSize: 15, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  note: { fontSize: 14, lineHeight: 20 },
})
