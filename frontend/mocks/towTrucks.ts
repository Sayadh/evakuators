import { LocationType, ServiceType, VehicleType } from '~/types/enums'
import type {
  ServiceArea,
  TowTruck,
  TowTruckLocation,
  TowTruckPricing,
  TowTruckVehicle,
} from '~/types/towTruck'

/**
 * ⚠️ Demo data. Phone numbers, names, plates and prices are mock values
 * and do not belong to real people or companies.
 */

const city = (name: string, slug: string): ServiceArea => ({
  name,
  slug,
  type: LocationType.City,
})

const district = (name: string, slug: string): ServiceArea => ({
  name,
  slug,
  type: LocationType.District,
})

const BASE_SERVICES: ServiceType[] = [
  ServiceType.CarTransport,
  ServiceType.AccidentTransport,
  ServiceType.NonStartingTransport,
]

interface TowTruckSeed {
  id: number
  slug: string
  driverName: string
  companyName?: string
  phone: string
  secondaryPhone?: string
  telegram?: string
  email?: string
  works24Hours?: boolean
  startingPrice?: number
  perKm?: number
  waitingPerHour?: number
  nightSurchargePercent?: number
  extraLoading?: number
  vehicle: Omit<TowTruckVehicle, 'winch' | 'manipulator' | 'showPlateNumber'> &
    Partial<Pick<TowTruckVehicle, 'winch' | 'manipulator' | 'showPlateNumber'>>
  extraServices?: ServiceType[]
  serviceAreas: ServiceArea[]
  location: TowTruckLocation
  description?: string
}

/** Builds pricing only from the fields the driver actually provided */
function buildPricing(seed: TowTruckSeed): TowTruckPricing | undefined {
  const pricing: TowTruckPricing = {}
  if (seed.startingPrice !== undefined) pricing.cityCallout = seed.startingPrice
  if (seed.perKm !== undefined) pricing.perKm = seed.perKm
  if (seed.waitingPerHour !== undefined) pricing.waitingPerHour = seed.waitingPerHour
  if (seed.nightSurchargePercent !== undefined)
    pricing.nightSurchargePercent = seed.nightSurchargePercent
  if (seed.extraLoading !== undefined) pricing.extraLoading = seed.extraLoading
  return Object.keys(pricing).length > 0 ? pricing : undefined
}

function defineTowTruck(seed: TowTruckSeed): TowTruck {
  const works24Hours = seed.works24Hours ?? false

  return {
    id: seed.id,
    slug: seed.slug,
    driverName: seed.driverName,
    companyName: seed.companyName,
    phone: seed.phone,
    secondaryPhone: seed.secondaryPhone,
    whatsapp: seed.phone,
    telegram: seed.telegram,
    email: seed.email,
    works24Hours,
    workingHours: works24Hours ? 'Շուրջօրյա (24/7)' : '09:00 – 21:00',
    startingPrice: seed.startingPrice,
    description:
      seed.description ??
      `Էվակուատորի ծառայություններ ${seed.location.name}ում և հարակից բնակավայրերում։ Արագ ժամանում, զգույշ բարձում և տեղափոխում մատչելի գներով։`,
    vehicle: {
      winch: true,
      manipulator: seed.vehicle.type === VehicleType.Manipulator,
      showPlateNumber: false,
      ...seed.vehicle,
    },
    services: [...BASE_SERVICES, ...(seed.extraServices ?? [])],
    serviceAreas: seed.serviceAreas,
    location: seed.location,
    pricing: buildPricing(seed),
    images: [1, 2, 3].map((n) => `https://picsum.photos/seed/evak-${seed.id}-${n}/800/600`),
    // Mock data has no real edit history — "now" is as honest as anything else here.
    updatedAt: new Date().toISOString(),
  }
}

const gegharkunikCities = {
  gavar: city('Գավառ', 'gavar'),
  sevan: city('Սևան', 'sevan'),
  martuni: city('Մարտունի', 'martuni'),
  vardenis: city('Վարդենիս', 'vardenis'),
  chambarak: city('Ճամբարակ', 'chambarak'),
}

export const mockTowTrucks: TowTruck[] = [
  // ─── Գեղարքունիք ───
  defineTowTruck({
    id: 1,
    slug: 'arman-avetisyan',
    driverName: 'Արման Ավետիսյան',
    phone: '+374 91 00 00 01',
    secondaryPhone: '+374 99 11 00 01',
    telegram: 'arman_evak_demo',
    works24Hours: true,
    startingPrice: 15000,
    perKm: 280,
    waitingPerHour: 3000,
    nightSurchargePercent: 20,
    extraLoading: 5000,
    vehicle: {
      brand: 'Isuzu',
      model: 'NPR 75',
      year: 2018,
      type: VehicleType.Flatbed,
      capacityTons: 5,
      platformLengthM: 5.6,
      platformWidthM: 2.2,
      plateNumber: '34 DEMO 01',
      showPlateNumber: true,
    },
    extraServices: [
      ServiceType.SuvTransport,
      ServiceType.IntercityTransport,
      ServiceType.LongDistanceTransport,
      ServiceType.OffRoadRecovery,
      ServiceType.SnowRecovery,
    ],
    serviceAreas: [
      gegharkunikCities.vardenis,
      gegharkunikCities.martuni,
      gegharkunikCities.gavar,
      gegharkunikCities.sevan,
      gegharkunikCities.chambarak,
      city('Դիլիջան', 'dilijan'),
    ],
    location: { regionSlug: 'gegharkunik', citySlug: 'vardenis', name: 'Վարդենիս' },
    description:
      'Աշխատում եմ Վարդենիսում և ամբողջ Գեղարքունիքի մարզում՝ 24/7 ռեժիմով։ Հարթակով էվակուատոր՝ ճախարակով, հարմար նաև վթարված և չաշխատող մեքենաների համար։',
  }),
  defineTowTruck({
    id: 2,
    slug: 'davit-grigoryan',
    driverName: 'Դավիթ Գրիգորյան',
    companyName: 'Sevan Evak Service',
    phone: '+374 93 00 00 02',
    email: 'sevan.evak@example.am',
    works24Hours: true,
    startingPrice: 14000,
    vehicle: {
      brand: 'Hyundai',
      model: 'HD78',
      year: 2019,
      type: VehicleType.Flatbed,
      capacityTons: 4.5,
      platformLengthM: 5.4,
      platformWidthM: 2.1,
    },
    extraServices: [
      ServiceType.SuvTransport,
      ServiceType.MotorcycleTransport,
      ServiceType.IntercityTransport,
    ],
    serviceAreas: [
      gegharkunikCities.sevan,
      gegharkunikCities.gavar,
      city('Հրազդան', 'hrazdan'),
      city('Ծաղկաձոր', 'tsaghkadzor'),
      city('Դիլիջան', 'dilijan'),
    ],
    location: { regionSlug: 'gegharkunik', citySlug: 'sevan', name: 'Սևան' },
  }),
  defineTowTruck({
    id: 3,
    slug: 'tigran-hakobyan',
    driverName: 'Տիգրան Հակոբյան',
    phone: '+374 94 00 00 03',
    startingPrice: 13000,
    vehicle: {
      brand: 'ГАЗель',
      model: 'Next',
      year: 2016,
      type: VehicleType.SlidingPlatform,
      capacityTons: 2,
    },
    extraServices: [],
    serviceAreas: [gegharkunikCities.gavar, gegharkunikCities.martuni, gegharkunikCities.sevan],
    location: { regionSlug: 'gegharkunik', citySlug: 'gavar', name: 'Գավառ' },
  }),
  defineTowTruck({
    id: 4,
    slug: 'sargis-manukyan',
    driverName: 'Սարգիս Մանուկյան',
    phone: '+374 91 00 00 04',
    works24Hours: true,
    startingPrice: 14000,
    vehicle: {
      brand: 'Mercedes-Benz',
      model: 'Atego 815',
      year: 2015,
      type: VehicleType.Manipulator,
      capacityTons: 6,
      platformLengthM: 6,
      platformWidthM: 2.3,
    },
    extraServices: [
      ServiceType.SuvTransport,
      ServiceType.MinibusTransport,
      ServiceType.OffRoadRecovery,
      ServiceType.SnowRecovery,
    ],
    serviceAreas: [
      gegharkunikCities.martuni,
      gegharkunikCities.vardenis,
      gegharkunikCities.gavar,
      city('Եղեգնաձոր', 'yeghegnadzor'),
    ],
    location: { regionSlug: 'gegharkunik', citySlug: 'martuni', name: 'Մարտունի' },
  }),
  defineTowTruck({
    id: 5,
    slug: 'vahe-petrosyan',
    driverName: 'Վահե Պետրոսյան',
    phone: '+374 99 00 00 05',
    vehicle: {
      brand: 'ГАЗ',
      model: '3309',
      year: 2013,
      type: VehicleType.Flatbed,
      capacityTons: 3,
    },
    extraServices: [ServiceType.SnowRecovery],
    serviceAreas: [gegharkunikCities.chambarak, gegharkunikCities.sevan, city('Իջևան', 'ijevan')],
    location: { regionSlug: 'gegharkunik', citySlug: 'chambarak', name: 'Ճամբարակ' },
  }),

  // ─── Երևան ───
  defineTowTruck({
    id: 6,
    slug: 'gevorg-sahakyan',
    driverName: 'Գևորգ Սահակյան',
    companyName: 'Evak Express',
    phone: '+374 91 00 00 06',
    secondaryPhone: '+374 93 11 00 06',
    telegram: 'evak_express_demo',
    email: 'evak.express@example.am',
    works24Hours: true,
    startingPrice: 10000,
    perKm: 250,
    waitingPerHour: 2500,
    nightSurchargePercent: 15,
    extraLoading: 4000,
    vehicle: {
      brand: 'Iveco',
      model: 'Daily 70C',
      year: 2020,
      type: VehicleType.Flatbed,
      capacityTons: 3.5,
      platformLengthM: 5.2,
      platformWidthM: 2.1,
      plateNumber: '01 DEMO 06',
      showPlateNumber: true,
    },
    extraServices: [
      ServiceType.SuvTransport,
      ServiceType.MotorcycleTransport,
      ServiceType.IntercityTransport,
      ServiceType.LongDistanceTransport,
      ServiceType.UndergroundParkingRecovery,
    ],
    serviceAreas: [
      district('Արաբկիր', 'arabkir'),
      district('Կենտրոն', 'kentron'),
      district('Քանաքեռ-Զեյթուն', 'kanaker-zeytun'),
      district('Դավթաշեն', 'davtashen'),
      district('Աջափնյակ', 'ajapnyak'),
    ],
    location: { districtSlug: 'arabkir', name: 'Արաբկիր' },
  }),
  defineTowTruck({
    id: 7,
    slug: 'artak-harutyunyan',
    driverName: 'Արտակ Հարությունյան',
    phone: '+374 93 00 00 07',
    works24Hours: true,
    startingPrice: 10000,
    perKm: 250,
    vehicle: {
      brand: 'Hyundai',
      model: 'Mighty EX8',
      year: 2021,
      type: VehicleType.Flatbed,
      capacityTons: 4,
      platformLengthM: 5.5,
      platformWidthM: 2.2,
    },
    extraServices: [ServiceType.SuvTransport, ServiceType.MinibusTransport, ServiceType.IntercityTransport],
    serviceAreas: [
      district('Կենտրոն', 'kentron'),
      district('Էրեբունի', 'erebuni'),
      district('Նորք-Մարաշ', 'nork-marash'),
      district('Շենգավիթ', 'shengavit'),
    ],
    location: { districtSlug: 'kentron', name: 'Կենտրոն' },
  }),
  defineTowTruck({
    id: 8,
    slug: 'narek-mkrtchyan',
    driverName: 'Նարեկ Մկրտչյան',
    phone: '+374 94 00 00 08',
    startingPrice: 9000,
    vehicle: {
      brand: 'ГАЗель',
      model: 'Next',
      year: 2018,
      type: VehicleType.SlidingPlatform,
      capacityTons: 2,
    },
    extraServices: [ServiceType.MotorcycleTransport, ServiceType.UndergroundParkingRecovery],
    serviceAreas: [
      district('Շենգավիթ', 'shengavit'),
      district('Մալաթիա-Սեբաստիա', 'malatia-sebastia'),
      district('Նուբարաշեն', 'nubarashen'),
    ],
    location: { districtSlug: 'shengavit', name: 'Շենգավիթ' },
  }),
  defineTowTruck({
    id: 9,
    slug: 'hayk-karapetyan',
    driverName: 'Հայկ Կարապետյան',
    companyName: 'HK Evakuator',
    phone: '+374 95 00 00 09',
    works24Hours: true,
    startingPrice: 11000,
    vehicle: {
      brand: 'MAN',
      model: 'TGL 12.180',
      year: 2017,
      type: VehicleType.Manipulator,
      capacityTons: 8,
      platformLengthM: 6.5,
      platformWidthM: 2.4,
    },
    extraServices: [
      ServiceType.SuvTransport,
      ServiceType.MinibusTransport,
      ServiceType.TruckTransport,
      ServiceType.ConstructionEquipmentTransport,
      ServiceType.OffRoadRecovery,
    ],
    serviceAreas: [
      district('Աջափնյակ', 'ajapnyak'),
      district('Դավթաշեն', 'davtashen'),
      district('Արաբկիր', 'arabkir'),
      city('Աշտարակ', 'ashtarak'),
    ],
    location: { districtSlug: 'ajapnyak', name: 'Աջափնյակ' },
  }),
  defineTowTruck({
    id: 10,
    slug: 'karen-ghazaryan',
    driverName: 'Կարեն Ղազարյան',
    phone: '+374 96 00 00 10',
    startingPrice: 9500,
    vehicle: {
      brand: 'Ford',
      model: 'Transit',
      year: 2015,
      type: VehicleType.SlidingPlatform,
      capacityTons: 1.8,
    },
    extraServices: [],
    serviceAreas: [
      district('Նոր Նորք', 'nor-nork'),
      district('Ավան', 'avan'),
      district('Քանաքեռ-Զեյթուն', 'kanaker-zeytun'),
    ],
    location: { districtSlug: 'nor-nork', name: 'Նոր Նորք' },
  }),
  defineTowTruck({
    id: 11,
    slug: 'ruben-martirosyan',
    driverName: 'Ռուբեն Մարտիրոսյան',
    phone: '+374 91 00 00 11',
    works24Hours: true,
    startingPrice: 10000,
    vehicle: {
      brand: 'Fuso',
      model: 'Canter',
      year: 2019,
      type: VehicleType.Flatbed,
      capacityTons: 3.5,
      platformLengthM: 5.3,
      platformWidthM: 2.1,
    },
    extraServices: [ServiceType.SuvTransport, ServiceType.IntercityTransport],
    serviceAreas: [
      district('Էրեբունի', 'erebuni'),
      district('Նուբարաշեն', 'nubarashen'),
      city('Մասիս', 'masis'),
      city('Արտաշատ', 'artashat'),
    ],
    location: { districtSlug: 'erebuni', name: 'Էրեբունի' },
  }),

  // ─── Շիրակ ───
  defineTowTruck({
    id: 12,
    slug: 'samvel-avagyan',
    driverName: 'Սամվել Ավագյան',
    companyName: 'Gyumri Evak',
    phone: '+374 93 00 00 12',
    works24Hours: true,
    startingPrice: 12000,
    vehicle: {
      brand: 'Isuzu',
      model: 'NQR 90',
      year: 2019,
      type: VehicleType.Flatbed,
      capacityTons: 5,
      platformLengthM: 5.7,
      platformWidthM: 2.2,
    },
    extraServices: [
      ServiceType.SuvTransport,
      ServiceType.MinibusTransport,
      ServiceType.IntercityTransport,
      ServiceType.IntercityCrossBorder,
      ServiceType.SnowRecovery,
    ],
    serviceAreas: [
      city('Գյումրի', 'gyumri'),
      city('Արթիկ', 'artik'),
      city('Մարալիկ', 'maralik'),
      city('Սպիտակ', 'spitak'),
    ],
    location: { regionSlug: 'shirak', citySlug: 'gyumri', name: 'Գյումրի' },
  }),
  defineTowTruck({
    id: 13,
    slug: 'arsen-babayan',
    driverName: 'Արսեն Բաբայան',
    phone: '+374 94 00 00 13',
    startingPrice: 11000,
    vehicle: {
      brand: 'ГАЗ',
      model: 'Валдай',
      year: 2014,
      type: VehicleType.Flatbed,
      capacityTons: 3,
    },
    extraServices: [],
    serviceAreas: [city('Գյումրի', 'gyumri'), city('Արթիկ', 'artik')],
    location: { regionSlug: 'shirak', citySlug: 'gyumri', name: 'Գյումրի' },
  }),

  // ─── Լոռի ───
  defineTowTruck({
    id: 14,
    slug: 'vardan-khachatryan',
    driverName: 'Վարդան Խաչատրյան',
    phone: '+374 91 00 00 14',
    works24Hours: true,
    startingPrice: 12000,
    vehicle: {
      brand: 'Hyundai',
      model: 'HD72',
      year: 2017,
      type: VehicleType.Flatbed,
      capacityTons: 3.5,
      platformLengthM: 5.2,
      platformWidthM: 2.1,
    },
    extraServices: [ServiceType.SuvTransport, ServiceType.IntercityTransport, ServiceType.SnowRecovery],
    serviceAreas: [
      city('Վանաձոր', 'vanadzor'),
      city('Սպիտակ', 'spitak'),
      city('Ստեփանավան', 'stepanavan'),
      city('Ալավերդի', 'alaverdi'),
      city('Դիլիջան', 'dilijan'),
    ],
    location: { regionSlug: 'lori', citySlug: 'vanadzor', name: 'Վանաձոր' },
  }),
  defineTowTruck({
    id: 15,
    slug: 'gor-simonyan',
    driverName: 'Գոռ Սիմոնյան',
    companyName: 'Lori Tow Service',
    phone: '+374 99 00 00 15',
    startingPrice: 11000,
    vehicle: {
      brand: 'КамАЗ',
      model: '4308',
      year: 2016,
      type: VehicleType.Manipulator,
      capacityTons: 10,
      platformLengthM: 6.8,
      platformWidthM: 2.5,
    },
    extraServices: [
      ServiceType.TruckTransport,
      ServiceType.MinibusTransport,
      ServiceType.ConstructionEquipmentTransport,
      ServiceType.OffRoadRecovery,
    ],
    serviceAreas: [city('Վանաձոր', 'vanadzor'), city('Ալավերդի', 'alaverdi')],
    location: { regionSlug: 'lori', citySlug: 'vanadzor', name: 'Վանաձոր' },
  }),

  // ─── Տավուշ ───
  defineTowTruck({
    id: 16,
    slug: 'edgar-asatryan',
    driverName: 'Էդգար Ասատրյան',
    phone: '+374 93 00 00 16',
    works24Hours: true,
    startingPrice: 13000,
    vehicle: {
      brand: 'Hino',
      model: '300',
      year: 2018,
      type: VehicleType.Flatbed,
      capacityTons: 4,
      platformLengthM: 5.4,
      platformWidthM: 2.2,
    },
    extraServices: [
      ServiceType.SuvTransport,
      ServiceType.IntercityTransport,
      ServiceType.OffRoadRecovery,
      ServiceType.SnowRecovery,
    ],
    serviceAreas: [
      city('Դիլիջան', 'dilijan'),
      city('Իջևան', 'ijevan'),
      city('Սևան', 'sevan'),
      city('Վանաձոր', 'vanadzor'),
    ],
    location: { regionSlug: 'tavush', citySlug: 'dilijan', name: 'Դիլիջան' },
  }),
  defineTowTruck({
    id: 17,
    slug: 'ashot-melkonyan',
    driverName: 'Աշոտ Մելքոնյան',
    phone: '+374 94 00 00 17',
    vehicle: {
      brand: 'ГАЗель',
      model: 'Бизнес',
      year: 2012,
      type: VehicleType.SlidingPlatform,
      capacityTons: 1.5,
    },
    extraServices: [ServiceType.MotorcycleTransport, ServiceType.UndergroundParkingRecovery],
    serviceAreas: [city('Իջևան', 'ijevan'), city('Բերդ', 'berd'), city('Դիլիջան', 'dilijan')],
    location: { regionSlug: 'tavush', citySlug: 'ijevan', name: 'Իջևան' },
  }),

  // ─── Սյունիք ───
  defineTowTruck({
    id: 18,
    slug: 'levon-danielyan',
    driverName: 'Լևոն Դանիելյան',
    companyName: 'Syunik Evak',
    phone: '+374 91 00 00 18',
    works24Hours: true,
    startingPrice: 15000,
    perKm: 350,
    waitingPerHour: 3000,
    nightSurchargePercent: 20,
    vehicle: {
      brand: 'Mercedes-Benz',
      model: 'Atego 1224',
      year: 2019,
      type: VehicleType.Manipulator,
      capacityTons: 9,
      platformLengthM: 6.6,
      platformWidthM: 2.4,
    },
    extraServices: [
      ServiceType.SuvTransport,
      ServiceType.TruckTransport,
      ServiceType.IntercityTransport,
      ServiceType.LongDistanceTransport,
      ServiceType.IntercityCrossBorder,
      ServiceType.OffRoadRecovery,
      ServiceType.SnowRecovery,
    ],
    serviceAreas: [
      city('Կապան', 'kapan'),
      city('Գորիս', 'goris'),
      city('Սիսիան', 'sisian'),
      city('Մեղրի', 'meghri'),
    ],
    location: { regionSlug: 'syunik', citySlug: 'kapan', name: 'Կապան' },
  }),
  defineTowTruck({
    id: 19,
    slug: 'mher-gasparyan',
    driverName: 'Մհեր Գասպարյան',
    phone: '+374 99 00 00 19',
    startingPrice: 13000,
    vehicle: {
      brand: 'Isuzu',
      model: 'NPR 66',
      year: 2015,
      type: VehicleType.Flatbed,
      capacityTons: 4,
    },
    extraServices: [ServiceType.SuvTransport, ServiceType.IntercityTransport],
    serviceAreas: [city('Գորիս', 'goris'), city('Սիսիան', 'sisian'), city('Կապան', 'kapan')],
    location: { regionSlug: 'syunik', citySlug: 'goris', name: 'Գորիս' },
  }),

  // ─── Կոտայք ───
  defineTowTruck({
    id: 20,
    slug: 'ara-voskanyan',
    driverName: 'Արա Ոսկանյան',
    phone: '+374 91 00 00 20',
    works24Hours: true,
    startingPrice: 11000,
    vehicle: {
      brand: 'Hyundai',
      model: 'HD78',
      year: 2020,
      type: VehicleType.Flatbed,
      capacityTons: 4.5,
      platformLengthM: 5.5,
      platformWidthM: 2.2,
    },
    extraServices: [ServiceType.SuvTransport, ServiceType.MinibusTransport],
    serviceAreas: [
      city('Աբովյան', 'abovyan'),
      city('Հրազդան', 'hrazdan'),
      city('Չարենցավան', 'charentsavan'),
      district('Ավան', 'avan'),
      district('Նոր Նորք', 'nor-nork'),
    ],
    location: { regionSlug: 'kotayk', citySlug: 'abovyan', name: 'Աբովյան' },
  }),
  defineTowTruck({
    id: 21,
    slug: 'suren-zakaryan',
    driverName: 'Սուրեն Զաքարյան',
    phone: '+374 93 00 00 21',
    works24Hours: false,
    startingPrice: 10000,
    vehicle: {
      brand: 'ГАЗ',
      model: '3302',
      year: 2013,
      type: VehicleType.SlidingPlatform,
      capacityTons: 1.5,
    },
    extraServices: [ServiceType.SnowRecovery],
    serviceAreas: [
      city('Հրազդան', 'hrazdan'),
      city('Ծաղկաձոր', 'tsaghkadzor'),
      city('Չարենցավան', 'charentsavan'),
    ],
    location: { regionSlug: 'kotayk', citySlug: 'hrazdan', name: 'Հրազդան' },
  }),

  // ─── Արարատ ───
  defineTowTruck({
    id: 22,
    slug: 'hovhannes-tadevosyan',
    driverName: 'Հովհաննես Թադևոսյան',
    phone: '+374 94 00 00 22',
    works24Hours: true,
    startingPrice: 11000,
    vehicle: {
      brand: 'Iveco',
      model: 'EuroCargo',
      year: 2016,
      type: VehicleType.Flatbed,
      capacityTons: 5,
      platformLengthM: 5.8,
      platformWidthM: 2.3,
    },
    extraServices: [ServiceType.SuvTransport, ServiceType.IntercityTransport],
    serviceAreas: [
      city('Արտաշատ', 'artashat'),
      city('Արարատ', 'ararat'),
      city('Վեդի', 'vedi'),
      city('Մասիս', 'masis'),
      district('Էրեբունի', 'erebuni'),
    ],
    location: { regionSlug: 'ararat', citySlug: 'artashat', name: 'Արտաշատ' },
  }),

  // ─── Արագածոտն ───
  defineTowTruck({
    id: 23,
    slug: 'aram-nersisyan',
    driverName: 'Արամ Ներսիսյան',
    phone: '+374 95 00 00 23',
    startingPrice: 10000,
    vehicle: {
      brand: 'Fuso',
      model: 'Canter',
      year: 2017,
      type: VehicleType.Flatbed,
      capacityTons: 3,
    },
    extraServices: [ServiceType.SuvTransport, ServiceType.SnowRecovery],
    serviceAreas: [
      city('Աշտարակ', 'ashtarak'),
      city('Ապարան', 'aparan'),
      city('Թալին', 'talin'),
      district('Աջափնյակ', 'ajapnyak'),
    ],
    location: { regionSlug: 'aragatsotn', citySlug: 'ashtarak', name: 'Աշտարակ' },
  }),

  // ─── Արմավիր ───
  defineTowTruck({
    id: 24,
    slug: 'vachagan-poghosyan',
    driverName: 'Վաչագան Պողոսյան',
    companyName: 'Armavir Evak Service',
    phone: '+374 96 00 00 24',
    works24Hours: true,
    startingPrice: 10000,
    vehicle: {
      brand: 'Isuzu',
      model: 'ELF',
      year: 2018,
      type: VehicleType.Flatbed,
      capacityTons: 3.5,
      platformLengthM: 5.3,
      platformWidthM: 2.1,
    },
    extraServices: [ServiceType.SuvTransport, ServiceType.MotorcycleTransport],
    serviceAreas: [
      city('Արմավիր', 'armavir'),
      city('Վաղարշապատ', 'vagharshapat'),
      city('Մեծամոր', 'metsamor'),
      district('Մալաթիա-Սեբաստիա', 'malatia-sebastia'),
    ],
    location: { regionSlug: 'armavir', citySlug: 'armavir', name: 'Արմավիր' },
  }),

  // ─── Վայոց Ձոր ───
  defineTowTruck({
    id: 25,
    slug: 'spartak-hovsepyan',
    driverName: 'Սպարտակ Հովսեփյան',
    phone: '+374 91 00 00 25',
    works24Hours: true,
    startingPrice: 13000,
    perKm: 320,
    vehicle: {
      brand: 'Hyundai',
      model: 'HD65',
      year: 2014,
      type: VehicleType.Flatbed,
      capacityTons: 2.5,
    },
    extraServices: [ServiceType.IntercityTransport, ServiceType.SnowRecovery],
    serviceAreas: [
      city('Եղեգնաձոր', 'yeghegnadzor'),
      city('Վայք', 'vayk'),
      city('Ջերմուկ', 'jermuk'),
      city('Մարտունի', 'martuni'),
    ],
    location: { regionSlug: 'vayots-dzor', citySlug: 'yeghegnadzor', name: 'Եղեգնաձոր' },
  }),
]
