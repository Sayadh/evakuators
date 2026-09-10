import type { FaqItem } from '~/types/common'
import { localizedPlaceName } from '~/i18n/placeNames'

/**
 * Homepage-only FAQ — targets the exact query variants people search on Google.
 *
 * Written per language rather than translated sentence by sentence, for the
 * same reason the city FAQ is: this is the block that has to match «сколько
 * стоит эвакуатор ереван» as it is actually typed. Where the Armenian text
 * tells the reader to tick a filter, the translations name the label the
 * filter now carries in that language — a FAQ that quotes a control by a name
 * the page does not use is worse than no FAQ.
 */
export function buildHomeFaq(locale = 'hy'): FaqItem[] {
  if (locale === 'ru') {
    return [
      {
        question: 'Сколько стоит вызвать эвакуатор',
        answer:
          'Цены обычно начинаются с 9 000 – 15 000 драмов и зависят от типа машины, расстояния и времени суток. На карточке каждого водителя видна начальная цена, поэтому сравнить варианты и выбрать самый дешёвый эвакуатор в своём районе несложно.',
      },
      {
        question: 'Есть ли эвакуатор, который работает 24 часа',
        answer:
          'Да, многие водители работают круглосуточно (24/7), включая ночные часы и праздничные дни. В списке включите фильтр «Работает 24/7», чтобы увидеть только их.',
      },
      {
        question: 'Есть ли эвакуатор с манипулятором',
        answer:
          'Да, у части водителей есть эвакуатор с краном-манипулятором — для тяжёлых машин и для мест, куда обычная платформа не подъедет. Все такие водители собраны на странице «Эвакуатор с манипулятором».',
      },
      {
        question: 'Как зарегистрироваться водителем эвакуатора',
        answer:
          'Нажмите «Зарегистрировать эвакуатор», заполните данные машины и услуг — заявка проходит проверку администрации. После подтверждения ваш профиль сразу появляется на сайте.',
      },
      {
        question: 'Есть ли эвакуаторы в Ереване и во всех марзах',
        answer:
          'Да, на сайте есть эвакуаторы во всех административных районах Еревана, а также во всех марзах и городах Армении. Выберите свой район в поиске на главной, чтобы увидеть ближайших водителей.',
      },
      {
        question: 'Чем эвакуатор с манипулятором отличается от обычного',
        answer:
          'Обычный эвакуатор затягивает машину на наклонную платформу. У эвакуатора с манипулятором есть гидравлическая стрела: ею можно поднять машину сбоку, повреждённую или стоящую в глубокой яме, без риска дополнительных повреждений.',
      },
      {
        question: 'Как оплатить услугу эвакуатора',
        answer:
          'Большинство водителей принимает и наличные, и безналичную оплату. Точный способ подтвердите во время звонка, до приезда эвакуатора.',
      },
      {
        question: 'Что нужно сказать при вызове эвакуатора',
        answer:
          'Назовите точное местоположение, марку и состояние машины (заводится ли двигатель, есть ли подъезд сбоку) и куда её нужно доставить. Этого хватает, чтобы водитель сразу понял, нужен обычный эвакуатор или манипулятор.',
      },
    ]
  }

  if (locale === 'en') {
    return [
      {
        question: 'How much does it cost to call a tow truck?',
        answer:
          'Prices usually start at 9,000–15,000 drams, depending on the vehicle, the distance and the time of day. Every driver card shows a starting price, so comparing them and picking the cheapest tow truck in your area is straightforward.',
      },
      {
        question: 'Is there a tow truck that works 24 hours?',
        answer:
          'Yes — many drivers work around the clock (24/7), including nights and public holidays. Turn on the "Works 24/7" filter in the listing to see only those.',
      },
      {
        question: 'Is there a tow truck with a crane?',
        answer:
          'Yes. Some drivers have a crane truck (a manipulator), for heavy vehicles and for places an ordinary flatbed cannot reach. They are all collected on the "Crane tow truck" page.',
      },
      {
        question: 'How do I register as a tow truck driver?',
        answer:
          'Press "Register a tow truck" and fill in the details of your vehicle and services. The application is reviewed by the administration, and once it is approved your profile appears on the site immediately.',
      },
      {
        question: 'Are there tow trucks in Yerevan and in every region?',
        answer:
          'Yes — the site lists tow trucks in every administrative district of Yerevan and in every region and town in Armenia. Pick your area in the search on the home page to see the drivers nearest to you.',
      },
      {
        question: 'How is a crane truck different from an ordinary tow truck?',
        answer:
          'An ordinary tow truck pulls the car up onto a tilting platform. A crane truck has a hydraulic boom, so it can lift a car from the side, one that is damaged, or one sitting in a deep hole — without the risk of doing more damage.',
      },
      {
        question: 'How do I pay for the service?',
        answer:
          'Most drivers take both cash and card. Confirm the exact method on the call, before the truck sets off.',
      },
      {
        question: 'What should I tell the driver when I call?',
        answer:
          'Your exact location, the make and condition of the car (does the engine start, can it be reached from the side) and where it has to go. That is enough for the driver to know straight away whether an ordinary truck or a crane is needed.',
      },
    ]
  }

  return [
    {
      question: 'Ինչքա՞ն արժե էժան էվակուատոր կանչել',
      answer:
        'Գները սովորաբար սկսվում են 9 000 – 15 000 դրամից, կախված մեքենայի տեսակից, հեռավորությունից և ժամից։ Ամեն վարորդի քարտի վրա երևում է մեկնարկային գինը, ուստի հեշտությամբ կարող եք համեմատել և ընտրել ամենաէժան էվակուատորը Ձեր տարածքում։',
    },
    {
      question: 'Կա՞ 24 ժամ աշխատող էվակուատոր',
      answer:
        'Այո, բազմաթիվ վարորդներ աշխատում են շուրջօրյա (24/7)՝ ներառյալ գիշերային ժամերն ու տոն օրերը։ Ցուցակում օգտագործեք «Աշխատում է 24/7» ֆիլտրը՝ միայն նրանց տեսնելու համար։',
    },
    {
      question: 'Կա՞ մանիպուլյատորով էվակուատոր',
      answer:
        'Այո, մի շարք վարորդներ ունեն մանիպուլյատորով էվակուատոր՝ նախատեսված ծանր կամ դժվար հասանելի մեքենաների բարձման համար։ Ֆիլտրերում նշեք «Մանիպուլյատոր»՝ միայն այդ հնարավորությամբ մեքենաները տեսնելու համար։',
    },
    {
      question: 'Ինչպե՞ս գրանցվել որպես նոր էվակուատոր վարորդ',
      answer:
        'Սեղմեք «Գրանցել էվակուատոր» կոճակը, լրացրեք Ձեր մեքենայի և ծառայությունների տվյալները, և հայտը կանցնի ադմինիստրացիայի ստուգմամբ։ Հաստատվելուց հետո Ձեր պրոֆիլն անմիջապես երևում է կայքում։',
    },
    {
      question: 'Կա՞ էվակուատոր Երևանում և բոլոր մարզերում',
      answer:
        'Այո, կայքում ներկայացված են էվակուատորներ Երևանի բոլոր վարչական շրջաններում, ինչպես նաև Հայաստանի բոլոր մարզերում ու քաղաքներում։ Ընտրեք Ձեր տարածքը գլխավոր որոնումից՝ մոտակա վարորդներին տեսնելու համար։',
    },
    {
      question: 'Ինչո՞վ է մանիպուլյատորով էվակուատորը տարբերվում սովորականից',
      answer:
        'Սովորական էվակուատորը մեքենան քարշում է կամ բարձում թեք հարթակով։ Մանիպուլյատորով էվակուատորն ունի հիդրավլիկ բազուկ, որով հնարավոր է բարձել նաև կողքից հասանելի, վնասված կամ խորը փոսում գտնվող մեքենաներ՝ առանց լրացուցիչ վնասի ռիսկի։ Ֆիլտրերում ընտրեք «Մանիպուլյատոր»՝ միայն այդպիսի էվակուատորները տեսնելու համար։',
    },
    {
      question: 'Ինչպե՞ս վճարել էվակուատորի ծառայության համար',
      answer:
        'Վարորդների մեծ մասն ընդունում է թե՛ կանխիկ, թե՛ անկանխիկ վճարում։ Ճշգրիտ վճարման եղանակը հաստատեք զանգի ժամանակ՝ նախքան էվակուատորի ժամանումը։',
    },
    {
      question: 'Ի՞նչ տեղեկություն է պետք ասել էվակուատոր կանչելիս',
      answer:
        'Նշեք Ձեր ճշգրիտ գտնվելու վայրը, մեքենայի մակնիշն ու վիճակը (աշխատու՞մ է շարժիչը, կողքից է հասանելի, թե՞ ոչ), և ուր է անհրաժեշտ տեղափոխել։ Սա թույլ է տալիս վարորդին անմիջապես գնահատել՝ արդյոք պետք է սովորական էվակուատոր, թե՝ մանիպուլյատորով։',
    },
  ]
}

/** «Հայաստանի մարզեր» ցուցակի էջ — մեկ մակարդակ վերևից, ընդհանուր հարցեր */
export function buildAllRegionsFaq(locale = 'hy'): FaqItem[] {
  if (locale === 'ru') {
    return [
      {
        question: 'Работают ли эвакуаторы во всех марзах Армении',
        answer:
          'Да, на Evakuators.am есть эвакуаторы во всех 10 марзах и в Ереване. Выберите свой марз из списка, чтобы посмотреть ближайших водителей и цены.',
      },
      {
        question: 'Можно ли вызвать эвакуатор из одного марза в другой',
        answer:
          'Да. Водители с услугой «Междугородняя перевозка» возят машины из марза в марз, в том числе в Ереван и из Еревана. Цена считается по расстоянию, поэтому уточните её во время звонка.',
      },
      {
        question: 'Отличаются ли цены в марзах от Еревана',
        answer:
          'Базовая цена сопоставима, но в марзах на итоговую сумму влияют расстояние и состояние дороги. Начальная цена указана на карточке каждого водителя.',
      },
    ]
  }

  if (locale === 'en') {
    return [
      {
        question: 'Do tow trucks work in every region of Armenia?',
        answer:
          'Yes — Evakuators.am lists tow trucks in all ten regions and in Yerevan. Pick your region from the list to see the nearest drivers and their prices.',
      },
      {
        question: 'Can I have a car moved from one region to another?',
        answer:
          'Yes. Drivers who offer "Intercity transport" move cars between regions, including to and from Yerevan. The price is worked out by distance, so confirm it on the call.',
      },
      {
        question: 'Are prices in the regions different from Yerevan?',
        answer:
          'The base price is comparable, but in the regions the distance and the state of the road affect the final figure. Every driver card shows a starting price.',
      },
    ]
  }

  return [
    {
      question: 'Աշխատու՞մ են էվակուատորները Հայաստանի բոլոր մարզերում',
      answer:
        'Այո, Evakuators.am-ում ներկայացված են էվակուատորներ բոլոր 10 մարզերում, ինչպես նաև Երևանում։ Ընտրեք Ձեր մարզը ցանկից՝ մոտակա վարորդներին ու գներին ծանոթանալու համար։',
    },
    {
      question: 'Հնարավո՞ր է էվակուատոր կանչել մեկ մարզից մյուսը',
      answer:
        'Այո, «Միջքաղաքային տեղափոխում» ծառայությամբ վարորդները մեքենա են տեղափոխում մարզից մարզ, ներառյալ դեպի/Երևանից։ Գինը հաշվարկվում է ըստ հեռավորության, ուստի հստակեցրեք այն զանգի ժամանակ։',
    },
    {
      question: 'Տարբերվու՞մ են գները մարզերում Երևանից',
      answer:
        'Հիմնական գինը նման է, սակայն մարզերում հեռավորությունն ու ճանապարհի պայմանները կարող են ազդել վերջնական արժեքի վրա։ Ամեն վարորդի քարտին երևում է մեկնարկային գին։',
    },
  ]
}

/** «Ազատ երթուղիներ» — յուրահատուկ գործառույթ, մարդիկ առաջին անգամ լսելիս հարցեր ունեն */
export function buildFreeRoutesFaq(locale = 'hy'): FaqItem[] {
  if (locale === 'ru') {
    return [
      {
        question: 'Что такое «попутный рейс»',
        answer:
          'Попутный рейс — это маршрут, по которому водитель эвакуатора уже едет порожняком из одной точки в другую. По дороге он может взять заказ, не отклоняясь от маршрута, — для клиента это обычно быстрее и дешевле.',
      },
      {
        question: 'Почему стоит выбрать попутный рейс',
        answer:
          'Водитель уже движется в вашу сторону, поэтому приезжает он обычно быстрее, а цена выходит ниже, чем при отдельном вызове.',
      },
      {
        question: 'Как связаться с водителем попутного рейса',
        answer:
          'Выберите из списка маршрут, совпадающий с вашим направлением, и позвоните водителю напрямую. Список обновляется в реальном времени, а просроченные рейсы исчезают сами.',
      },
    ]
  }

  if (locale === 'en') {
    return [
      {
        question: 'What is a "free route"?',
        answer:
          'A free route is a trip a driver is already making empty, from one place to another. Along the way they can take an order without going out of their way, which is usually both faster and cheaper for the customer.',
      },
      {
        question: 'Why choose a driver on a free route?',
        answer:
          'The driver is already heading your way, so they normally arrive sooner and the price is lower than for a dedicated call-out.',
      },
      {
        question: 'How do I reach a driver on a free route?',
        answer:
          'Pick the route that matches your direction from the list and call the driver directly. The list updates in real time and expired routes drop off it automatically.',
      },
    ]
  }

  return [
    {
      question: 'Ի՞նչ է «Ազատ երթուղին»',
      answer:
        'Ազատ երթուղին էվակուատոր վարորդի կողմից նշված երթուղի է, որով նա արդեն դատարկ շարժվում է մի կետից մյուսը։ Այս ընթացքում վարորդը կարող է ընդունել նոր պատվեր՝ առանց հատուկ շեղվելու, ինչը հաճախ ավելի արագ և էժան տարբերակ է հաճախորդի համար։',
    },
    {
      question: 'Ինչու՞ ընտրել ազատ երթուղով էվակուատոր',
      answer:
        'Քանի որ վարորդն արդեն շարժվում է Ձեր ուղղությամբ, ժամանման ժամանակը սովորաբար ավելի կարճ է, իսկ գինը՝ ավելի մատչելի, քան հատուկ կանչի դեպքում։',
    },
    {
      question: 'Ինչպե՞ս կապվել ազատ երթուղով վարորդի հետ',
      answer:
        'Ցանկից ընտրեք Ձեր ուղղությանը համապատասխան երթուղին և զանգահարեք վարորդին ուղղակիորեն։ Երթուղիները թարմացվում են իրական ժամանակում և ինքնաբերաբար հեռացվում ժամկետը լրանալուց հետո։',
    },
  ]
}

/**
 * The city page's FAQ.
 *
 * Written per language rather than translated field by field, because the
 * grammar differs where the name goes: Armenian takes a locative suffix
 * («Աբովյանում»), Russian a preposition and a case («в городе Абовян», kept in
 * the nominative on purpose — see `buildLocationSeo`), English neither.
 *
 * It is also real SEO copy, not chrome: this block is what a search engine
 * reads to match «сколько стоит эвакуатор ереван», so it has to be written in
 * the language rather than converted into it.
 */
export function buildCityFaq(cityName: string, locale = 'hy', slug?: string): FaqItem[] {
  const name = slug ? localizedPlaceName('city', slug, cityName, locale) : cityName

  if (locale === 'ru') {
    return [
      {
        question: `Сколько стоит вызвать эвакуатор в городе ${name}`,
        answer: `Вызов эвакуатора в городе ${name} обычно начинается от 9 000 – 15 000 драмов. Итоговая цена зависит от типа машины, её состояния и расстояния. У водителей, указавших цену, стартовая стоимость видна прямо на карточке.`,
      },
      {
        question: `За сколько приезжает эвакуатор в городе ${name}`,
        answer: 'В черте города эвакуаторы обычно приезжают за 20–40 минут. Точное время уточните у водителя во время звонка.',
      },
      {
        question: `Есть ли эвакуаторы, работающие 24/7, в городе ${name}`,
        answer: 'Да. Водители с отметкой 24/7 работают круглосуточно, включая ночные часы и праздничные дни. Включите фильтр «Работает 24/7», чтобы видеть только их.',
      },
      {
        question: 'Как выбрать подходящий эвакуатор',
        answer: 'Обратите внимание на грузоподъёмность машины и список услуг. Для внедорожника или грузовика выбирайте эвакуатор с соответствующей грузоподъёмностью.',
      },
    ]
  }

  if (locale === 'en') {
    return [
      {
        question: `How much does a tow truck cost in ${name}`,
        answer: `A call-out in ${name} usually starts at 9,000–15,000 AMD. The final price depends on the type and condition of the vehicle and on the distance. Drivers who have set a price show their starting rate on the card itself.`,
      },
      {
        question: `How quickly does a tow truck arrive in ${name}`,
        answer: 'Within the town, trucks usually arrive in 20–40 minutes. Confirm the exact time with the driver on the call.',
      },
      {
        question: `Are there tow trucks working 24/7 in ${name}`,
        answer: 'Yes. Drivers marked 24/7 work around the clock, including nights and public holidays. Use the "Open 24/7" filter to see only those.',
      },
      {
        question: 'How do I choose the right tow truck',
        answer: 'Look at the load capacity and the list of services. For an SUV or a van, pick a truck rated for the weight.',
      },
    ]
  }

  return [
    {
      question: `Ինչքա՞ն արժե էվակուատոր կանչելը ${cityName}ում`,
      answer: `${cityName}ում էվակուատորի կանչի արժեքը սովորաբար սկսվում է 9 000 – 15 000 դրամից։ Վերջնական գինը կախված է մեքենայի տեսակից, վիճակից և հեռավորությունից։ Գին նշած վարորդների քարտերում կտեսնեք մեկնարկային գինը։`,
    },
    {
      question: `Ինչքա՞ն ժամանակում է հասնում էվակուատորը ${cityName}ում`,
      answer: `Քաղաքի ներսում էվակուատորները սովորաբար հասնում են 20-40 րոպեում։ Ճշգրիտ ժամանակը ճշտեք վարորդի հետ զանգի ընթացքում։`,
    },
    {
      question: `Կա՞ն 24/7 աշխատող էվակուատորներ ${cityName}ում`,
      answer: `Այո, ցանկում 24/7 նշումով վարորդներն աշխատում են շուրջօրյա՝ ներառյալ գիշերային ժամերը և տոն օրերը։ Օգտագործեք «Աշխատում է 24/7» ֆիլտրը՝ միայն նրանց տեսնելու համար։`,
    },
    {
      question: 'Ինչպե՞ս ընտրել ճիշտ էվակուատոր',
      answer:
        'Ուշադրություն դարձրեք մեքենայի բեռնատարողությանը և ծառայությունների ցանկին։ SUV-ի կամ բեռնատարի համար ընտրեք համապատասխան բեռնատարողությամբ էվակուատոր։',
    },
  ]
}

export function buildRegionFaq(regionName: string, locale = 'hy', slug?: string): FaqItem[] {
  const name = slug ? localizedPlaceName('region', slug, regionName, locale) : regionName

  if (locale === 'ru') {
    return [
      {
        question: `Как найти эвакуатор в марзе ${name}`,
        answer: 'Выберите свой город из списка, посмотрите доступные эвакуаторы, сравните цены и позвоните водителю напрямую.',
      },
      {
        question: `Работают ли эвакуаторы в сёлах марза ${name}`,
        answer: 'Да, большинство водителей обслуживает и сёла марза, и междугородние трассы. Проверьте раздел «Обслуживаемые районы» на странице водителя.',
      },
      {
        question: 'Возможна ли перевозка между марзами',
        answer: 'Да. Водители с услугой «Междугородняя перевозка» перевозят машины из марза в марз, включая Ереван. Цена считается по километражу.',
      },
    ]
  }

  if (locale === 'en') {
    return [
      {
        question: `How do I find a tow truck in ${name} region`,
        answer: 'Pick your town from the list, look through the trucks available, compare the prices and call the driver directly.',
      },
      {
        question: `Do tow trucks serve the villages of ${name}`,
        answer: 'Yes — most drivers cover the region\'s villages and its intercity roads as well. Check the "Areas served" section on the driver\'s page.',
      },
      {
        question: 'Is transport between regions possible',
        answer: 'Yes. Drivers offering "Intercity transport" move vehicles from one region to another, Yerevan included. The price is worked out by distance.',
      },
    ]
  }

  return [
    {
      question: `Ինչպե՞ս գտնել էվակուատոր ${regionName}ի մարզում`,
      answer: `Ընտրեք ձեր քաղաքը ցանկից, դիտեք հասանելի էվակուատորները, համեմատեք գները և զանգահարեք վարորդին անմիջապես։`,
    },
    {
      question: `Աշխատու՞մ են էվակուատորները ${regionName}ի գյուղերում`,
      answer: `Այո, վարորդների մեծ մասը սպասարկում է նաև մարզի գյուղերն ու միջքաղաքային ճանապարհները։ Ստուգեք վարորդի էջի «Սպասարկվող տարածքներ» բաժինը։`,
    },
    {
      question: 'Հնարավո՞ր է միջմարզային տեղափոխում',
      answer:
        'Այո, «Միջքաղաքային տեղափոխում» ծառայությամբ վարորդները տեղափոխում են մեքենաներ մարզից մարզ, ներառյալ Երևան։ Գինը հաշվարկվում է ըստ կիլոմետրաժի։',
    },
  ]
}
