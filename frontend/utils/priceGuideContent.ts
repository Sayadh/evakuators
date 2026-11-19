import {
  PRICE_GUIDE as P,
  PRICE_GUIDE_EXAMPLE_KM as KM,
  PRICE_GUIDE_UPDATED,
  type PriceGuideFigure,
} from '~/constants/priceGuide'
import { SITE_NAME } from '~/constants/site'
import type { FaqItem } from '~/types/common'
import { formatPrice, formatPriceRange } from '~/utils/formatPrice'

export interface PriceGuideRow {
  key: keyof typeof P
  label: string
  note: string
  range: string
  median: string
  drivers: string
}

export interface PriceGuideContent {
  title: string
  description: string
  keywords: string
  h1: string
  lead: string
  updated: string
  highlights: { label: string; value: string }[]
  tableTitle: string
  columns: { service: string; range: string; median: string }
  rows: PriceGuideRow[]
  factorsTitle: string
  factors: { title: string; text: string }[]
  examplesTitle: string
  examples: { title: string; calculation: string; result: string }[]
  examplesNote: string
  checklistTitle: string
  checklist: string[]
  methodTitle: string
  method: string
  ctaTitle: string
  faq: FaqItem[]
}

const range = (figure: PriceGuideFigure): string => formatPriceRange(figure.low, figure.high)
const percentRange = (figure: PriceGuideFigure): string => `${figure.low} – ${figure.high}%`

const nightExampleBase = 6000
const nightExampleTotal = Math.round(
  nightExampleBase * (1 + P.nightSurchargePercent.median / 100),
)

const city = range(P.cityCallout)
const perKm = range(P.perKm)
const night = percentRange(P.nightSurchargePercent)
const waiting = range(P.waitingPerHour)
const loading = range(P.extraLoading)
const heavy = range(P.heavyDuty)
const crane = range(P.manipulator)
const intercityExample = formatPriceRange(P.perKm.low * KM, P.perKm.high * KM)

function buildArmenian(): PriceGuideContent {
  const row = (
    key: keyof typeof P,
    label: string,
    note: string,
    value: string,
    median: string,
  ): PriceGuideRow => ({
    key,
    label,
    note,
    range: value,
    median,
    drivers: `${P[key].drivers} վարորդի տվյալներով`,
  })

  return {
    title: `Էվակուատորի գները Հայաստանում · Evakuator gin | ${SITE_NAME}`,
    description: `Ինչքա՞ն արժե էվակուատորը Հայաստանում։ Քաղաքում՝ ${city}, միջքաղաքային՝ ${perKm}/կմ։ Իրական գներ, հաշվարկի օրինակներ և ինչ ճշտել վարորդից։`,
    keywords:
      'էվակուատորի գին, էվակուատոր գին, ինչքան արժե էվակուատորը, evakuator gin, evakuatori gin, էվակուատոր 1 կմ գին',
    h1: 'Էվակուատորի գները Հայաստանում',
    lead: `Քաղաքի ներսում էվակուատորի կանչը սովորաբար արժե ${city}, իսկ միջքաղաքային տեղափոխումը՝ ${perKm} մեկ կիլոմետրի համար։ Վերջնական գինը կախված է մեքենայից, հեռավորությունից, ժամից և բեռնման բարդությունից։`,
    updated: `Տվյալները թարմացվել են՝ ${PRICE_GUIDE_UPDATED.year} թ. նոյեմբեր`,
    highlights: [
      { label: 'Կանչ քաղաքում', value: city },
      { label: 'Մեկ կիլոմետր', value: `${perKm}/կմ` },
      { label: 'Գիշերային հավելավճար', value: night },
    ],
    tableTitle: 'Բնորոշ գներն ըստ ծառայության',
    columns: { service: 'Ծառայություն', range: 'Բնորոշ գին', median: 'Միջին' },
    rows: [
      row('cityCallout', 'Կանչ քաղաքի ներսում', 'Մեկնարկային գին', city, formatPrice(P.cityCallout.median)),
      row(
        'largerTruckCallout',
        'Կանչ 3.5 տոննայից մեծ էվակուատորով',
        'Մեկնարկային գին',
        range(P.largerTruckCallout),
        formatPrice(P.largerTruckCallout.median),
      ),
      row('perKm', 'Միջքաղաքային տեղափոխում', 'Մեկ կիլոմետրի համար', `${perKm}/կմ`, `${formatPrice(P.perKm.median)}/կմ`),
      row('nightSurchargePercent', 'Գիշերային հավելավճար', 'Ավելանում է հիմնական գնին', night, `${P.nightSurchargePercent.median}%`),
      row('waitingPerHour', 'Սպասում', 'Մեկ ժամի համար', `${waiting}/ժամ`, `${formatPrice(P.waitingPerHour.median)}/ժամ`),
      row('extraLoading', 'Բարդ բեռնում', 'Լրացուցիչ վճար', loading, formatPrice(P.extraLoading.median)),
      row('heavyDuty', 'Ծանր տեխնիկայի էվակուատոր', 'Մեկնարկային գին', heavy, formatPrice(P.heavyDuty.median)),
      row('manipulator', 'Մանիպուլյատորով էվակուատոր', 'Մեկնարկային գին', crane, formatPrice(P.manipulator.median)),
    ],
    factorsTitle: 'Ինչից է կախված գինը',
    factors: [
      { title: 'Հեռավորություն', text: 'Քաղաքից դուրս գինը սովորաբար հաշվարկվում է կիլոմետրով։' },
      { title: 'Մեքենայի տեսակ և քաշ', text: 'Ջիպը, միկրոավտոբուսը կամ բեռնատարը կարող են պահանջել ավելի մեծ էվակուատոր։' },
      { title: 'Մեքենայի վիճակ', text: 'Փակ անիվները, չաշխատող շարժիչը կամ վթարը կարող են բարդացնել բեռնումը։' },
      { title: 'Տեղանք', text: 'Ստորգետնյա կայանատեղին, նեղ բակը, ձյունը կամ ցեխը կարող են լրացուցիչ աշխատանք պահանջել։' },
      { title: 'Ժամ', text: 'Գիշերային կանչերի համար որոշ վարորդներ հավելավճար են հաշվում։' },
    ],
    examplesTitle: 'Հաշվարկի օրինակներ',
    examples: [
      { title: 'Մարդատար մեքենա քաղաքի ներսում', calculation: 'Սովորական կանչ', result: city },
      {
        title: 'Նույն կանչը գիշերը',
        calculation: `${formatPrice(nightExampleBase)} + ${P.nightSurchargePercent.median}%`,
        result: formatPrice(nightExampleTotal),
      },
      {
        title: `${KM} կմ միջքաղաքային տեղափոխում`,
        calculation: `${KM} կմ × ${perKm}`,
        result: intercityExample,
      },
    ],
    examplesNote: 'Օրինակները մոտավոր են։ Միջքաղաքային դեպքում ճշտեք՝ գինը ներառում է կանչը և վարորդի վերադարձը, թե ոչ։',
    checklistTitle: 'Ինչ ճշտել վարորդից մինչև բեռնումը',
    checklist: [
      'Որքա՞ն է վերջնական գինը մինչև նշված հասցեն։',
      'Գինը ներառո՞ւմ է կանչը և վերադարձի ճանապարհը։',
      'Գիշերային հավելավճար կա՞։',
      'Փակ անիվների կամ բարդ բեռնման համար լրացուցիչ վճար կա՞։',
      'Սպասելու դեպքում գինը փոխվո՞ւմ է։',
      'Ինչպե՞ս կարող եմ վճարել։',
    ],
    methodTitle: 'Ինչպես են հաշվարկված գները',
    method:
      'Գները հաշվարկված են Evakuators.am-ում վարորդների հրապարակած տվյալներից։ Բնորոշ գինը ցույց է տալիս գների հիմնական միջակայքը՝ առանց ծայրահեղ ցածր և բարձր արժեքների։ Evakuators.am-ը գներ չի սահմանում․ վերջնական գինը համաձայնեցրեք վարորդի հետ։',
    ctaTitle: 'Գտեք վարորդին և ճշտեք գինը ուղիղ նրա հետ',
    faq: [
      { question: 'Ինչքա՞ն արժե էվակուատորը Հայաստանում', answer: `Քաղաքի ներսում կանչը սովորաբար արժե ${city}։ Վերջնական գինը կախված է մեքենայից, հեռավորությունից, ժամից և բեռնման բարդությունից։` },
      { question: 'Ինչքա՞ն է էվակուատորի 1 կմ-ի գինը', answer: `Միջքաղաքային տեղափոխման դեպքում մեկ կիլոմետրի գինը սովորաբար ${perKm} է, միջինը՝ ${formatPrice(P.perKm.median)}։` },
      { question: 'Գիշերը էվակուատորն ավելի թա՞նկ է', answer: `Որոշ վարորդներ գիշերային կանչի համար ավելացնում են ${night}։ Հավելավճարը ճշտեք զանգի ժամանակ։` },
      { question: 'Ինչու՞ կարող է գինը բարձր լինել', answer: 'Գինը կարող է բարձրանալ մեծ հեռավորության, ծանր մեքենայի, փակ անիվների, վթարի կամ դժվար հասանելի տեղանքի դեպքում։' },
      { question: 'Ինչքա՞ն արժե մանիպուլյատորով կամ ծանր տեխնիկայի էվակուատորը', answer: `Մանիպուլյատորով էվակուատորի մեկնարկային գինը սովորաբար ${crane} է, ծանր տեխնիկայինը՝ ${heavy}։ Գինը կախված է բեռից և աշխատանքի բարդությունից։` },
      { question: 'Ինչպե՞ս խուսափել անսպասելի վճարից', answer: 'Մինչև բեռնումը ճշտեք վերջնական գինը, հասցեն, գիշերային և բեռնման հավելավճարները, ինչպես նաև վերադարձի ճանապարհը ներառված է, թե ոչ։' },
    ],
  }
}

function buildRussian(): PriceGuideContent {
  const row = (
    key: keyof typeof P,
    label: string,
    note: string,
    value: string,
    median: string,
  ): PriceGuideRow => ({
    key,
    label,
    note,
    range: value,
    median,
    drivers: `по данным водителей: ${P[key].drivers}`,
  })

  return {
    title: `Сколько стоит эвакуатор в Армении · Цены | ${SITE_NAME}`,
    description: `Цены на эвакуатор в Армении: по городу ${city}, междугородние перевозки ${perKm}/км. Реальные цены водителей, примеры расчёта и что уточнить заранее.`,
    keywords:
      'сколько стоит эвакуатор, цена эвакуатора Ереван, эвакуатор цена за км, стоимость эвакуатора Армения, evakuator gin',
    h1: 'Сколько стоит эвакуатор в Армении',
    lead: `Вызов эвакуатора по городу обычно стоит ${city}, а междугородняя перевозка — ${perKm} за километр. Итоговая цена зависит от машины, расстояния, времени суток и сложности погрузки.`,
    updated: `Данные обновлены: ноябрь ${PRICE_GUIDE_UPDATED.year} г.`,
    highlights: [
      { label: 'Вызов по городу', value: city },
      { label: 'Один километр', value: `${perKm}/км` },
      { label: 'Ночная надбавка', value: night },
    ],
    tableTitle: 'Типичные цены по услугам',
    columns: { service: 'Услуга', range: 'Типичная цена', median: 'В среднем' },
    rows: [
      row('cityCallout', 'Вызов по городу', 'Начальная цена', city, formatPrice(P.cityCallout.median)),
      row(
        'largerTruckCallout',
        'Вызов эвакуатора грузоподъёмностью более 3,5 т',
        'Начальная цена',
        range(P.largerTruckCallout),
        formatPrice(P.largerTruckCallout.median),
      ),
      row('perKm', 'Междугородняя перевозка', 'За один километр', `${perKm}/км`, `${formatPrice(P.perKm.median)}/км`),
      row('nightSurchargePercent', 'Ночная надбавка', 'Добавляется к основной цене', night, `${P.nightSurchargePercent.median}%`),
      row('waitingPerHour', 'Ожидание', 'За один час', `${waiting}/час`, `${formatPrice(P.waitingPerHour.median)}/час`),
      row('extraLoading', 'Сложная погрузка', 'Дополнительная оплата', loading, formatPrice(P.extraLoading.median)),
      row('heavyDuty', 'Эвакуатор для тяжёлой техники', 'Начальная цена', heavy, formatPrice(P.heavyDuty.median)),
      row('manipulator', 'Эвакуатор с манипулятором', 'Начальная цена', crane, formatPrice(P.manipulator.median)),
    ],
    factorsTitle: 'От чего зависит цена',
    factors: [
      { title: 'Расстояние', text: 'За городом цена обычно считается по километрам.' },
      { title: 'Тип и вес машины', text: 'Для джипа, микроавтобуса или грузовика может понадобиться более крупный эвакуатор.' },
      { title: 'Состояние машины', text: 'Заблокированные колёса, неисправный двигатель или ДТП могут усложнить погрузку.' },
      { title: 'Место погрузки', text: 'Подземная парковка, узкий двор, снег или грязь могут потребовать дополнительной работы.' },
      { title: 'Время суток', text: 'За ночной вызов некоторые водители берут надбавку.' },
    ],
    examplesTitle: 'Примеры расчёта',
    examples: [
      { title: 'Легковая машина по городу', calculation: 'Обычный вызов', result: city },
      {
        title: 'Тот же вызов ночью',
        calculation: `${formatPrice(nightExampleBase)} + ${P.nightSurchargePercent.median}%`,
        result: formatPrice(nightExampleTotal),
      },
      {
        title: `Междугородняя перевозка на ${KM} км`,
        calculation: `${KM} км × ${perKm}`,
        result: intercityExample,
      },
    ],
    examplesNote: 'Примеры приблизительные. При междугородней перевозке уточните, входят ли в цену вызов и обратный путь водителя.',
    checklistTitle: 'Что уточнить у водителя до погрузки',
    checklist: [
      'Какая итоговая цена до нужного адреса?',
      'Входят ли в цену вызов и обратный путь?',
      'Есть ли ночная надбавка?',
      'Есть ли доплата за заблокированные колёса или сложную погрузку?',
      'Меняется ли цена, если придётся подождать?',
      'Как можно оплатить?',
    ],
    methodTitle: 'Как рассчитаны цены',
    method:
      'Цены рассчитаны по данным, которые водители опубликовали на Evakuators.am. Типичная цена показывает основной диапазон без крайне низких и крайне высоких значений. Evakuators.am не устанавливает цены — итоговую стоимость согласуйте с водителем.',
    ctaTitle: 'Найдите водителя и уточните цену напрямую',
    faq: [
      { question: 'Сколько стоит эвакуатор в Армении', answer: `Вызов по городу обычно стоит ${city}. Итоговая цена зависит от машины, расстояния, времени суток и сложности погрузки.` },
      { question: 'Какая цена эвакуатора за километр', answer: `При междугородней перевозке километр обычно стоит ${perKm}, в среднем ${formatPrice(P.perKm.median)}.` },
      { question: 'Ночью эвакуатор дороже', answer: `Некоторые водители добавляют за ночной вызов ${night}. Уточните надбавку во время звонка.` },
      { question: 'Почему цена может быть выше', answer: 'Цена может вырасти из-за большого расстояния, тяжёлой машины, заблокированных колёс, ДТП или труднодоступного места.' },
      { question: 'Сколько стоит манипулятор или эвакуатор для тяжёлой техники', answer: `Начальная цена манипулятора обычно составляет ${crane}, эвакуатора для тяжёлой техники — ${heavy}. Стоимость зависит от груза и сложности работы.` },
      { question: 'Как избежать неожиданной доплаты', answer: 'До погрузки уточните итоговую цену, адрес, ночную надбавку, доплату за погрузку и то, входит ли в цену обратный путь.' },
    ],
  }
}

function buildEnglish(): PriceGuideContent {
  const row = (
    key: keyof typeof P,
    label: string,
    note: string,
    value: string,
    median: string,
  ): PriceGuideRow => ({
    key,
    label,
    note,
    range: value,
    median,
    drivers: `based on ${P[key].drivers} drivers`,
  })

  return {
    title: `Tow truck prices in Armenia | ${SITE_NAME}`,
    description: `How much a tow truck costs in Armenia: ${city} within a city and ${perKm}/km between cities. Real driver prices, worked examples and what to ask first.`,
    keywords: 'tow truck price Armenia, tow truck cost Yerevan, towing price per km Armenia, evakuator price',
    h1: 'Tow truck prices in Armenia',
    lead: `A tow truck call-out within a city usually costs ${city}, and intercity transport costs ${perKm} per kilometre. The final price depends on the vehicle, the distance, the time of day and how difficult the loading is.`,
    updated: `Data updated: November ${PRICE_GUIDE_UPDATED.year}`,
    highlights: [
      { label: 'City call-out', value: city },
      { label: 'Per kilometre', value: `${perKm}/km` },
      { label: 'Night surcharge', value: night },
    ],
    tableTitle: 'Typical prices by service',
    columns: { service: 'Service', range: 'Typical price', median: 'Midpoint' },
    rows: [
      row('cityCallout', 'City call-out', 'Starting price', city, formatPrice(P.cityCallout.median)),
      row(
        'largerTruckCallout',
        'Call-out with a tow truck rated above 3.5 t',
        'Starting price',
        range(P.largerTruckCallout),
        formatPrice(P.largerTruckCallout.median),
      ),
      row('perKm', 'Intercity transport', 'Per kilometre', `${perKm}/km`, `${formatPrice(P.perKm.median)}/km`),
      row('nightSurchargePercent', 'Night surcharge', 'Added to the base price', night, `${P.nightSurchargePercent.median}%`),
      row('waitingPerHour', 'Waiting', 'Per hour', `${waiting}/hour`, `${formatPrice(P.waitingPerHour.median)}/hour`),
      row('extraLoading', 'Difficult loading', 'Additional charge', loading, formatPrice(P.extraLoading.median)),
      row('heavyDuty', 'Heavy-duty tow truck', 'Starting price', heavy, formatPrice(P.heavyDuty.median)),
      row('manipulator', 'Crane tow truck', 'Starting price', crane, formatPrice(P.manipulator.median)),
    ],
    factorsTitle: 'What affects the price',
    factors: [
      { title: 'Distance', text: 'Outside the city, the price is usually calculated per kilometre.' },
      { title: 'Vehicle type and weight', text: 'An SUV, minibus or truck may need a larger tow truck.' },
      { title: 'Vehicle condition', text: 'Locked wheels, a dead engine or accident damage can make loading harder.' },
      { title: 'Location', text: 'An underground car park, a narrow yard, snow or mud can mean extra work.' },
      { title: 'Time of day', text: 'Some drivers add a surcharge for night call-outs.' },
    ],
    examplesTitle: 'Worked examples',
    examples: [
      { title: 'Passenger car within a city', calculation: 'Standard call-out', result: city },
      {
        title: 'The same call-out at night',
        calculation: `${formatPrice(nightExampleBase)} + ${P.nightSurchargePercent.median}%`,
        result: formatPrice(nightExampleTotal),
      },
      {
        title: `${KM} km intercity transport`,
        calculation: `${KM} km × ${perKm}`,
        result: intercityExample,
      },
    ],
    examplesNote: 'These examples are approximate. For intercity trips, ask whether the price includes the call-out and the driver’s return journey.',
    checklistTitle: 'What to ask the driver before loading',
    checklist: [
      'What is the final price to the destination?',
      'Does it include the call-out and the return journey?',
      'Is there a night surcharge?',
      'Is there an extra charge for locked wheels or difficult loading?',
      'Does the price change if the driver has to wait?',
      'How can I pay?',
    ],
    methodTitle: 'How these prices are calculated',
    method:
      'Prices are calculated from the rates drivers publish on Evakuators.am. The typical price shows the main range, leaving out unusually low and high values. Evakuators.am does not set prices, so agree the final cost with the driver.',
    ctaTitle: 'Find a driver and confirm the price directly',
    faq: [
      { question: 'How much does a tow truck cost in Armenia?', answer: `A call-out within a city usually costs ${city}. The final price depends on the vehicle, the distance, the time of day and how difficult the loading is.` },
      { question: 'What is the tow truck price per kilometre?', answer: `Intercity transport usually costs ${perKm} per kilometre, with a midpoint of ${formatPrice(P.perKm.median)}.` },
      { question: 'Is a tow truck more expensive at night?', answer: `Some drivers add ${night} for a night call-out. Ask about the surcharge when you call.` },
      { question: 'Why might the price be higher?', answer: 'The price can rise with a long distance, a heavy vehicle, locked wheels, accident damage or a hard-to-reach location.' },
      { question: 'How much does a crane or heavy-duty tow truck cost?', answer: `A crane tow truck usually starts at ${crane}, and a heavy-duty tow truck at ${heavy}. The cost depends on the load and the complexity of the job.` },
      { question: 'How can I avoid unexpected charges?', answer: 'Before loading, confirm the final price, the destination, any night or loading surcharge, and whether the return journey is included.' },
    ],
  }
}

export function buildPriceGuide(locale = 'hy'): PriceGuideContent {
  if (locale === 'ru') return buildRussian()
  if (locale === 'en') return buildEnglish()
  return buildArmenian()
}
