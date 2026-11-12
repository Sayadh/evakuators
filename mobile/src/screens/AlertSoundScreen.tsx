/**
 * «Զանգի ձայն» — the driver picks the ring of a new order and can hear each
 * one first. The choice is saved on the phone at once and sent to the server
 * (iOS plays the file the push names); see push/sounds.ts.
 */
import { useEffect, useState } from 'react'
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import { useT } from '../i18n'
import { useNav } from '../navigation/Navigator'
import { chooseAlertSound, previewAlertSound, stopAlertSoundPreview } from '../push/alertSoundChoice'
import { ALERT_SOUND_IDS, getAlertSound, type AlertSoundId } from '../push/sounds'
import { Icon } from '../ui/Icon'
import { Banner, Card, Header, Loading, Note, Screen } from '../ui/kit'
import { colors, radius, space, type } from '../ui/theme'

/** How long a preview is shown as playing (the sounds are longer; Android stops at 7 s) */
const PREVIEW_MS = 7_000

export function AlertSoundScreen() {
  const t = useT()
  const nav = useNav()
  const [selected, setSelected] = useState<AlertSoundId | null>(null)
  const [playing, setPlaying] = useState<AlertSoundId | null>(null)
  const [notice, setNotice] = useState<{ tone: 'success' | 'warn'; text: string } | null>(null)

  useEffect(() => {
    void getAlertSound().then(setSelected)
    return () => void stopAlertSoundPreview()
  }, [])

  useEffect(() => {
    if (!playing) return
    const timer = setTimeout(() => setPlaying(null), PREVIEW_MS)
    return () => clearTimeout(timer)
  }, [playing])

  if (!selected) return <Loading />

  async function play(id: AlertSoundId) {
    if (playing === id) {
      setPlaying(null)
      await stopAlertSoundPreview()
      return
    }
    setPlaying(id)
    await previewAlertSound(id, `${t('sound.previewTitle')} · ${t(`sound.names.${id}`)}`)
  }

  async function choose(id: AlertSoundId) {
    setSelected(id)
    setNotice(null)
    void play(id)
    const { serverUpdated } = await chooseAlertSound(id)
    setNotice(serverUpdated ? { tone: 'success', text: t('sound.saved') } : { tone: 'warn', text: t('sound.offlineSaved') })
  }

  return (
    <Screen header={<Header title={t('sound.title')} onBack={nav.pop} />}>
      <Note>{t('sound.hint')}</Note>
      {notice ? <Banner tone={notice.tone}>{notice.text}</Banner> : null}
      <Card style={{ padding: 0, gap: 0, overflow: 'hidden' }}>
        {ALERT_SOUND_IDS.map((id, index) => {
          const isSelected = id === selected
          const isPlaying = id === playing
          return (
            <View key={id} style={[styles.row, index < ALERT_SOUND_IDS.length - 1 && styles.rowBorder, isSelected && { backgroundColor: colors.primarySoft }]}>
              <Pressable
                style={styles.choice}
                accessibilityRole="radio"
                accessibilityState={{ selected: isSelected }}
                onPress={() => void choose(id)}
              >
                <View style={[styles.radio, isSelected && { borderColor: colors.primary }]}>{isSelected ? <View style={styles.radioDot} /> : null}</View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[type.bodyStrong, { color: colors.text }]}>{t(`sound.names.${id}`)}</Text>
                  <Text style={[type.small, { color: colors.textSecondary }]}>{isSelected ? `${t('sound.current')} · ` : ''}{t(`sound.hints.${id}`)}</Text>
                </View>
              </Pressable>
              <Pressable
                onPress={() => void play(id)}
                accessibilityRole="button"
                accessibilityLabel={`${isPlaying ? t('sound.stop') : t('sound.play')} · ${t(`sound.names.${id}`)}`}
                hitSlop={8}
                style={({ pressed }) => [styles.play, isPlaying && { backgroundColor: colors.primary }, pressed && { opacity: 0.7 }]}
              >
                <Icon name={isPlaying ? 'stop' : 'play'} size={18} color={isPlaying ? '#fff' : colors.primary} />
              </Pressable>
            </View>
          )
        })}
      </Card>
      {Platform.OS === 'ios' ? <Note>{t('sound.iosSilent')}</Note> : null}
    </Screen>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingRight: space.md },
  rowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  choice: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, paddingLeft: space.lg },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 11, height: 11, borderRadius: 6, backgroundColor: colors.primary },
  play: { width: 40, height: 40, borderRadius: radius.full, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
})
