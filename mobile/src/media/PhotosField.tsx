/**
 * The photo set of a profile — main photo first, up to six, as on the website
 * (register.vue / dashboard.vue). Add from the camera or the library, remove,
 * or make any photo the main one. Rules in gallery.ts; picking in imagePicker.ts.
 */
import { mediaUrl } from '../api/client'
import { useState } from 'react'
import { Image, Pressable, StyleSheet, Text, View } from 'react-native'
import { useLanguage, useT } from '../i18n'
import { siteT } from '../shared/site'
import { Icon } from '../ui/Icon'
import { Banner, Button, Note, Sheet } from '../ui/kit'
import { colors, radius, space, type } from '../ui/theme'
import { addPhotos, makeMain, MAX_PHOTOS, previewUri, removePhoto, type GalleryPhoto } from './gallery'
import { isPickerAvailable, pickPhotos } from './imagePicker'

export function PhotosField({ gallery, onChange, error }: { gallery: GalleryPhoto[]; onChange: (gallery: GalleryPhoto[]) => void; error?: string }) {
  const t = useT()
  const language = useLanguage()
  const [chooser, setChooser] = useState(false)
  const [selected, setSelected] = useState<GalleryPhoto | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const room = MAX_PHOTOS - gallery.length

  async function add(source: 'camera' | 'library') {
    setChooser(false)
    setProblem(null)
    const outcome = await pickPhotos(source, room)
    if (outcome.ok) onChange(addPhotos(gallery, outcome.photos))
    else if (outcome.reason === 'denied') setProblem(t(source === 'camera' ? 'photos.cameraDenied' : 'photos.libraryDenied'))
    else if (outcome.reason === 'unavailable') setProblem(t('photos.unavailable'))
  }

  return (
    <View style={{ gap: space.md }}>
      <Note>{t('photos.intro')}</Note>
      {!isPickerAvailable() ? <Banner tone="warn">{t('photos.unavailable')}</Banner> : null}
      <View style={styles.grid}>
        {gallery.map((photo, index) => (
          <Pressable key={photo.key} onPress={() => setSelected(photo)} accessibilityRole="imagebutton" accessibilityLabel={index === 0 ? siteT(language, 'registerPage.mainImageLabel') : t('photos.photo')} style={styles.tile}>
            <Image source={{ uri: mediaUrl(previewUri(photo)) }} style={styles.image} />
            {index === 0 ? (
              <View style={styles.mainTag}>
                <Icon name="star" size={12} color={colors.primaryDark} />
                <Text style={[type.caption, { color: colors.primaryDark }]}>{t('photos.main')}</Text>
              </View>
            ) : null}
          </Pressable>
        ))}
        {room > 0 ? (
          <Pressable onPress={() => setChooser(true)} accessibilityRole="button" accessibilityLabel={t('photos.add')} style={[styles.tile, styles.add, error ? { borderColor: colors.danger } : null]}>
            <Icon name="camera" size={28} color={colors.primary} />
            <Text style={[type.caption, { color: colors.primary }]}>{gallery.length === 0 ? siteT(language, 'registerPage.mainImageLabel') : t('photos.add')}</Text>
          </Pressable>
        ) : null}
      </View>
      <Text style={[type.small, { color: colors.textSecondary }]}>{t('photos.count', { n: gallery.length, max: MAX_PHOTOS })}</Text>
      {error ? <Note tone="danger">{error}</Note> : null}
      {problem ? <Note tone="warn">{problem}</Note> : null}

      <Sheet visible={chooser} onClose={() => setChooser(false)} title={t('photos.add')}>
        <Button icon="camera" label={t('photos.fromCamera')} onPress={() => void add('camera')} />
        <Button icon="image" variant="outline" label={t('photos.fromLibrary')} onPress={() => void add('library')} />
      </Sheet>

      <Sheet visible={selected !== null} onClose={() => setSelected(null)} title={t('photos.photo')}>
        {selected ? <Image source={{ uri: mediaUrl(previewUri(selected)) }} style={{ width: '100%', aspectRatio: 4 / 3, borderRadius: radius.md }} resizeMode="cover" /> : null}
        {selected && gallery[0]?.key !== selected.key ? (
          <Button
            icon="star"
            variant="outline"
            label={t('photos.makeMain')}
            onPress={() => {
              onChange(makeMain(gallery, selected.key))
              setSelected(null)
            }}
          />
        ) : null}
        <Button
          icon="trash"
          variant="danger"
          label={t('photos.remove')}
          onPress={() => {
            if (selected) onChange(removePhoto(gallery, selected.key))
            setSelected(null)
          }}
        />
      </Sheet>
    </View>
  )
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  tile: { width: '31.5%', aspectRatio: 1, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.border },
  image: { width: '100%', height: '100%' },
  add: { backgroundColor: colors.primarySoft, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center', gap: 4, padding: 6 },
  mainTag: { position: 'absolute', left: 6, top: 6, flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: colors.accent, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
})
