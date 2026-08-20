import { ServiceType, VehicleType } from '~/types/enums'

export const SERVICE_LABELS: Record<ServiceType, string> = {
  // 1. Էվակուատորի ծառայություններ (Հիմնական)
  [ServiceType.CarTransport]: 'Թեթև մարդատար ավտոմեքենաների տեղափոխում',
  [ServiceType.SuvTransport]: 'Ջիպերի և ամենագնացների տեղափոխում',
  [ServiceType.MinibusTransport]: 'Միկրոավտոբուսների տեղափոխում',
  [ServiceType.TruckTransport]: 'Բեռնատար ավտոմեքենաների տեղափոխում',
  [ServiceType.MotorcycleTransport]: 'Մոտոցիկլների տեղափոխում',
  [ServiceType.QuadbikeTransport]: 'Քվադրոցիկլների տեղափոխում',
  [ServiceType.SportsCarTransport]: 'Սպորտային մեքենաների տեղափոխում',
  [ServiceType.LowClearanceTransport]: 'Ցածր կախվածքով մեքենաների տեղափոխում',
  [ServiceType.ElectricCarTransport]: 'Էլեկտրական մեքենաների տեղափոխում',
  [ServiceType.HybridCarTransport]: 'Հիբրիդային մեքենաների տեղափոխում',
  [ServiceType.NonRunningTransport]: 'Անսարք մեքենաների տեղափոխում',
  [ServiceType.AccidentTransport]: 'Վթարված մեքենաների տեղափոխում',
  [ServiceType.NonStartingTransport]: 'Չգործարկվող մեքենաների տեղափոխում',
  [ServiceType.LongDistanceTransport]: 'Երկար տարածությունների տեղափոխում',
  [ServiceType.IntercityTransport]: 'Միջքաղաքային տեղափոխում',
  [ServiceType.IntercityCrossBorder]: 'Միջքաղաքային՝ սահմանային ուղղություններ (Վրաստան / Իրան)',
  [ServiceType.ConstructionEquipmentTransport]: 'Շինարարական տեխնիկայի տեղափոխում',
  [ServiceType.AgriculturalEquipmentTransport]: 'Գյուղատնտեսական տեխնիկայի տեղափոխում',

  // 1b. Մանիպուլյատորի ծառայություններ
  [ServiceType.MachineryTransport]: 'Սարքավորումների և հաստոցների տեղափոխում',
  [ServiceType.ContainerCabinTransport]:
    'Կոնտեյներների, շարժական տնակների և այլ բեռների տեղափոխում',
  [ServiceType.LoadingUnloadingWorks]: 'Բեռնման և բեռնաթափման աշխատանքներ',

  // 1c. Ծանր տեխնիկայի փոխադրման ծառայություններ
  [ServiceType.ExcavatorTransport]: 'Էքսկավատորների տեղափոխում',
  [ServiceType.BulldozerTransport]: 'Բուլդոզերների տեղափոխում',
  // The Russian word is what the trade actually says, so it rides along in
  // brackets — a driver scanning this list recognises «պոգրուզչիկ» faster than
  // the Armenian term, and a customer searching for one uses either.
  [ServiceType.LoaderTransport]: 'Բեռնիչների (պոգրուզչիկ) տեղափոխում',
  [ServiceType.RoadEquipmentTransport]: 'Ճանապարհաշինական տեխնիկայի տեղափոխում',
  [ServiceType.IndustrialEquipmentTransport]: 'Արդյունաբերական և հատուկ տեխնիկայի տեղափոխում',
  [ServiceType.OversizedCargoTransport]: 'Խոշորածավալ և ծանր բեռների տեղափոխում',

  // 2. Ճանապարհային օգնություն
  [ServiceType.BatteryJumpstart]: 'Ակումուլյատորի գործարկում',
  [ServiceType.BatteryReplacement]: 'Ակումուլյատորի փոխարինում',
  [ServiceType.BatteryCharging]: 'Ակումուլյատորի լիցքավորում',
  [ServiceType.TireReplacement]: 'Անվադողի փոխարինում',
  [ServiceType.SpareTireFitting]: 'Պահեստային անվադողի տեղադրում',
  [ServiceType.FuelDeliveryPetrol]: 'Բենզինի առաքում',
  [ServiceType.FuelDeliveryDiesel]: 'Դիզելային վառելիքի առաքում',
  [ServiceType.DoorUnlocking]: 'Դռների բացում',
  [ServiceType.LockoutAssistance]:
    'Բանալու կորուստ կամ մեքենայի ներսում մնալու դեպքում օգնություն',
  [ServiceType.MinorRoadsideRepair]: 'Փոքր տեխնիկական օգնություն ճանապարհին',

  // 3. Դուրսբերման ծառայություններ
  [ServiceType.WinchRecovery]: 'Վինչով դուրսբերում',
  [ServiceType.SnowRecovery]: 'Մեքենայի դուրսբերում ձյունից',
  [ServiceType.MudRecovery]: 'Մեքենայի դուրսբերում ցեխից',
  [ServiceType.PotholeRecovery]: 'Մեքենայի դուրսբերում փոսից',
  [ServiceType.RavineRecovery]: 'Մեքենայի դուրսբերում ձորակից',
  [ServiceType.OffRoadRecovery]: 'Մեքենայի դուրսբերում դժվարանցանելի ճանապարհից',
  [ServiceType.RolloverRecovery]: 'Շրջված մեքենայի դուրսբերում',
  [ServiceType.UndergroundParkingRecovery]: 'Ստորգետնյա ավտոկայանատեղիից դուրսբերում',

  // 4. Վճարման տարբերակներ
  //
  // Four ways to hand over money, named by HOW rather than by category — the
  // old labels («Անկանխիկ փոխանցում», «Բանկային փոխանցում») described the same
  // act twice from two angles, and a driver could not tell which one meant
  // "to my card" and which "to my account". The slugs are unchanged, so no
  // driver's existing answer is lost; only the wording got specific.
  [ServiceType.CashPayment]: 'Կանխիկ',
  [ServiceType.CashlessTransfer]: 'Փոխանցում բանկային քարտին',
  [ServiceType.BankTransfer]: 'Փոխանցում բանկային հաշվեհամարին',
  [ServiceType.CardPayment]: 'Քարտով վճարում POS տերմինալով',
  [ServiceType.InvoiceProvided]: 'Հաշիվ-ապրանքագիր',

  // 5. Աշխատանքային պայմաններ
  [ServiceType.Available247]: '24/7 սպասարկում',
  [ServiceType.WeekendService]: 'Շաբաթ և կիրակի',
}

export interface ServiceCategory {
  key: string
  title: string
  /** Shown once above the category's checkboxes, explains what to pick */
  description: string
  services: ServiceType[]
}

/**
 * Single source of truth for how services are grouped everywhere they're
 * picked or shown: registration form, driver dashboard, admin, and the
 * public listing filters. Add a new service by adding it to the right
 * category here — every picker updates automatically.
 */
export const SERVICE_CATEGORIES: ServiceCategory[] = [
  {
    key: 'core',
    title: 'Էվակուատորի ծառայություններ',
    description: 'Ինչպիսի մեքենաներ եք տեղափոխում։',
    services: [
      ServiceType.CarTransport,
      ServiceType.SuvTransport,
      ServiceType.MinibusTransport,
      ServiceType.TruckTransport,
      ServiceType.MotorcycleTransport,
      ServiceType.QuadbikeTransport,
      ServiceType.SportsCarTransport,
      ServiceType.LowClearanceTransport,
      ServiceType.ElectricCarTransport,
      ServiceType.HybridCarTransport,
      ServiceType.NonRunningTransport,
      ServiceType.AccidentTransport,
      ServiceType.NonStartingTransport,
      ServiceType.LongDistanceTransport,
      ServiceType.IntercityTransport,
      ServiceType.IntercityCrossBorder,
      ServiceType.ConstructionEquipmentTransport,
      ServiceType.AgriculturalEquipmentTransport,
    ],
  },
  {
    key: 'roadside',
    title: 'Ճանապարհային օգնություն',
    description: 'Ի՞նչ օգնություն եք ցուցաբերում տեղում։',
    services: [
      ServiceType.BatteryJumpstart,
      ServiceType.BatteryReplacement,
      ServiceType.BatteryCharging,
      ServiceType.TireReplacement,
      ServiceType.SpareTireFitting,
      ServiceType.FuelDeliveryPetrol,
      ServiceType.FuelDeliveryDiesel,
      ServiceType.DoorUnlocking,
      ServiceType.LockoutAssistance,
      ServiceType.MinorRoadsideRepair,
    ],
  },
  {
    key: 'recovery',
    title: 'Դուրսբերման ծառայություններ',
    description: 'Եթե մեքենան դուրս չի գալիս ինքնուրույն։',
    services: [
      ServiceType.WinchRecovery,
      ServiceType.SnowRecovery,
      ServiceType.MudRecovery,
      ServiceType.PotholeRecovery,
      ServiceType.RavineRecovery,
      ServiceType.OffRoadRecovery,
      ServiceType.RolloverRecovery,
      ServiceType.UndergroundParkingRecovery,
    ],
  },
  {
    key: 'payment',
    title: 'Վճարման տարբերակներ',
    description: 'Ինչպե՞ս կարող են վճարել ձեզ։',
    // Four methods and nothing else. «Հաշիվ-ապրանքագիր» used to sit here too,
    // which made the group read as six alternatives to choose between — but an
    // invoice is a document you get afterwards, not a fifth way to pay, and it
    // is asked separately now (`STANDALONE_SERVICES`).
    services: [
      ServiceType.CashPayment,
      ServiceType.CashlessTransfer,
      ServiceType.BankTransfer,
      ServiceType.CardPayment,
    ],
  },
  {
    key: 'availability',
    title: 'Աշխատանքային պայմաններ',
    description: 'Ե՞րբ եք հասանելի։',
    services: [ServiceType.Available247, ServiceType.WeekendService],
  },
]

/**
 * The two categories every driver is asked, whatever they drive.
 *
 * Pulled out of `SERVICE_CATEGORIES` by key rather than re-listed, so adding a
 * payment method or a working-hours option reaches the specialist forms too —
 * the same "edit one file" promise the rest of this module makes. Re-listing
 * them is what would let «Քարտով վճարում» exist for a flatbed and not for a
 * manipulator.
 */
const UNIVERSAL_CATEGORY_KEYS = ['payment', 'availability'] as const

const universalCategories = (): ServiceCategory[] =>
  SERVICE_CATEGORIES.filter((category) =>
    (UNIVERSAL_CATEGORY_KEYS as readonly string[]).includes(category.key),
  )

/**
 * «Մանիպուլյատոր» — what a crane truck is actually hired for.
 *
 * Mostly existing slugs. A manipulator loading a wrecked car is offering
 * `accident-transport`, the same service a sliding-platform offers; the crane
 * is the method. Only the three jobs an evacuator taxonomy had no word for —
 * machinery/machine tools, containers and cabins, and loading work sold on its
 * own — are new (see `ServiceType`).
 */
export const MANIPULATOR_SERVICES: ServiceType[] = [
  ServiceType.CarTransport,
  ServiceType.AccidentTransport,
  ServiceType.NonRunningTransport,
  ServiceType.ConstructionEquipmentTransport,
  ServiceType.AgriculturalEquipmentTransport,
  ServiceType.MachineryTransport,
  ServiceType.ContainerCabinTransport,
  ServiceType.LoadingUnloadingWorks,
  ServiceType.IntercityTransport,
  ServiceType.LongDistanceTransport,
]

/** «Ծանր տեխնիկայի հատուկ փոխադրող» — the machine classes it is called for */
export const HEAVY_TRANSPORT_SERVICES: ServiceType[] = [
  ServiceType.ExcavatorTransport,
  ServiceType.BulldozerTransport,
  ServiceType.LoaderTransport,
  ServiceType.AgriculturalEquipmentTransport,
  ServiceType.RoadEquipmentTransport,
  ServiceType.IndustrialEquipmentTransport,
  ServiceType.OversizedCargoTransport,
  ServiceType.IntercityTransport,
  ServiceType.LongDistanceTransport,
]

/**
 * Which service questions a driver is asked, given the vehicle they picked.
 *
 * ## Why the roadside and recovery categories disappear for these two
 *
 * «Ակումուլյատորի գործարկում», «անվադողի փոխարինում», «դուրսբերում ցեխից» are
 * services sold to a stranded motorist. A manipulator or a heavy-machinery
 * transporter is dispatched to a construction site against a booked job; it is
 * not the truck anyone calls from the roadside, and the platform already
 * withholds it from every general listing for exactly that reason (see
 * `SPECIALIST_VEHICLE_TYPES`). Asking those questions produces answers no
 * customer will ever search on.
 *
 * The exception the product asked for is the honest one: a driver whose truck
 * is an ordinary `flatbed`/`sliding-platform` keeps the full list even when
 * they also carry heavy machinery, because that truck genuinely does answer
 * roadside calls. So this switches on the **vehicle type alone** — never on
 * `manipulator`/`heavyEquipment`, which are "can also do" flags. It is the same
 * type-vs-union distinction `isSpecialistVehicleType` draws, for the same
 * reason: a capability must not delete a question the truck can still answer.
 *
 * Payment and working hours are asked of everyone — see
 * `UNIVERSAL_CATEGORY_KEYS`.
 */
export function serviceCategoriesFor(vehicleType: string): ServiceCategory[] {
  if (vehicleType === VehicleType.Manipulator) {
    return [
      {
        key: 'manipulator',
        title: 'Մանիպուլյատորի ծառայություններ',
        description: 'Ի՞նչ եք բարձում և տեղափոխում կռունկով։',
        services: MANIPULATOR_SERVICES,
      },
      ...universalCategories(),
    ]
  }

  if (vehicleType === VehicleType.HeavyDuty) {
    return [
      {
        key: 'heavyTransport',
        title: 'Ծանր տեխնիկայի փոխադրման ծառայություններ',
        description: 'Ի՞նչ տեխնիկա եք տեղափոխում։',
        services: HEAVY_TRANSPORT_SERVICES,
      },
      ...universalCategories(),
    ]
  }

  return SERVICE_CATEGORIES
}

/**
 * Slugs the driver may keep, for the categories they are currently shown.
 *
 * Switching «Հարթակով» → «Մանիպուլյատոր» hides the roadside and recovery
 * checkboxes, but the ticks behind them stay in `services` unless something
 * removes them — and an invisible answer is one nobody can correct. Worse, it
 * still renders on the public profile, so a crane truck would advertise
 * «անվադողի փոխարինում» with no field anywhere to untick it.
 *
 * Returns the filtered list rather than mutating, so the forms can apply it in
 * a watcher and the tests can assert it directly.
 */
export function servicesAllowedFor(
  vehicleType: string,
  services: readonly string[],
): string[] {
  const allowed = new Set<string>([
    ...serviceCategoriesFor(vehicleType).flatMap((category) => category.services),
    ...STANDALONE_SERVICES,
  ])
  return services.filter((slug) => allowed.has(slug))
}

/**
 * Slugs stored in `services` but asked **outside** the category picker.
 *
 * «Տրամադրում եմ հաշիվ-ապրանքագիր» is a real thing a customer filters on — a
 * company car cannot use a driver who has no invoice to give accounting — but
 * it is not a *way of paying*, and while it sat in the payment group it read as
 * a fifth alternative alongside cash and POS. Its own checkbox says what it is:
 * a yes/no about paperwork, independent of how the money moves.
 *
 * It stays a `ServiceType` rather than becoming a boolean column because it
 * already is one on every existing profile, and because everything that renders
 * a service list — the public profile, the moderation diff — then needs no new
 * case.
 *
 * ## Why this set has to exist
 *
 * `servicesAllowedFor` strips any answer whose question is no longer on screen,
 * which is what stops a crane truck advertising tyre changes. A slug in no
 * category looks exactly like such an orphan, so without this list the invoice
 * tick would be silently deleted the first time a driver touched their vehicle
 * type — a save that quietly removes an answer the driver never changed.
 */
export const STANDALONE_SERVICES: ServiceType[] = [ServiceType.InvoiceProvided]

/**
 * A service list with one slug switched on or off.
 *
 * Both forms bind a plain checkbox to a slug inside the `services` array, and
 * both need the array identity to change so Vue re-renders — hence a new array
 * rather than `push`/`splice`. Generic over the element type for the same
 * reason `syncVehicleDependentFields` is: the dashboard types this as
 * `ServiceType[]` and the registration form as `string[]`.
 */
export function withService<T extends string>(
  services: readonly T[],
  slug: T,
  enabled: boolean,
): T[] {
  if (enabled) return services.includes(slug) ? [...services] : [...services, slug]
  return services.filter((item) => item !== slug)
}
