import { SITE_NAME } from '~/constants/site'

/**
 * SEO keyword strategy.
 *
 * People search both in Armenian script («էվակուատոր երևան») and in
 * transliterated Latin («evakuator erevan», «evakuator 24 jam», «ejan evakuator»).
 * Every location page therefore carries BOTH variants in its title,
 * description, keywords meta and visible SEO text.
 */

const BASE_KEYWORDS = [
  'էվակուատոր',
  'էժան էվակուատոր',
  'գիշերային էվակուատոր',
  '24/7 էվակուատոր',
  'evakuator',
  'evakuator 24 jam',
  'gisherayin evakuator',
  'ejan evakuator',
  'evakuator hayastan',
]

/** "nor-hachn" → "nor hachn" — matches how people type transliterated queries */
export function translitFromSlug(slug: string): string {
  return slug.replace(/-/g, ' ')
}

export interface LocationSeo {
  title: string
  description: string
  keywords: string
}

/** City / Yerevan district pages — the main SEO landing pages */
export function buildLocationSeo(nameHy: string, slug: string): LocationSeo {
  const translit = translitFromSlug(slug)

  return {
    title: `Էվակուատոր ${nameHy}ում · Evakuator ${translit} · 24/7 | ${SITE_NAME}`,
    description: `Էվակուատոր ${nameHy}ում (evakuator ${translit}) 24/7 ռեժիմով։ Էժան էվակուատոր, գիշերային ծառայություն, վթարված և չաշխատող մեքենաների տեղափոխում։ Իրական նկարներ, գներ, ուղիղ կապ վարորդի հետ։`,
    keywords: [
      ...BASE_KEYWORDS,
      `էվակուատոր ${nameHy}`,
      `evakuator ${translit}`,
      `evakuator ${translit} 24 jam`,
      `ejan evakuator ${translit}`,
    ].join(', '),
  }
}

export function buildRegionSeo(regionNameHy: string, slug: string): LocationSeo {
  const translit = translitFromSlug(slug)

  return {
    title: `Էվակուատոր ${regionNameHy}ի մարզում · Evakuator ${translit} · 24/7 | ${SITE_NAME}`,
    description: `Էվակուատոր ${regionNameHy}ի մարզում (evakuator ${translit}) 24/7 ռեժիմով։ Գտեք մարզի բոլոր էվակուատորները, դիտեք գներն ու նկարները և զանգահարեք վարորդին անմիջապես։`,
    keywords: [
      ...BASE_KEYWORDS,
      `էվակուատոր ${regionNameHy}`,
      `evakuator ${translit}`,
    ].join(', '),
  }
}

export function buildHomeSeo(): LocationSeo {
  return {
    title: `Էվակուատոր · Evakuator 24/7 ամբողջ Հայաստանում | ${SITE_NAME}`,
    description:
      'Էվակուատոր (evakuator) Երևանում և Հայաստանի բոլոր մարզերում՝ 24/7։ Էժան էվակուատոր (ejan evakuator), գիշերային ծառայություն (gisherayin evakuator), վթարված մեքենաների տեղափոխում։ Զանգահարեք վարորդին ուղիղ։',
    keywords: [...BASE_KEYWORDS, 'էվակուատոր երևան', 'evakuator erevan'].join(', '),
  }
}

/**
 * Visible bilingual paragraph for SeoTextSection — lets Google match
 * transliterated queries against real on-page content, without keyword stuffing.
 */
export function buildTranslitParagraph(nameHy: string, slug: string): string {
  const translit = translitFromSlug(slug)
  return `Evakuator ${translit} — էվակուատորի ծառայություն ${nameHy}ում ցանկացած ժամի՝ ներառյալ գիշերային կանչերը (evakuator 24 jam)։ Մատչելի գներ (ejan evakuator), արագ ժամանում և ուղիղ կապ վարորդի հետ՝ առանց միջնորդների։`
}
