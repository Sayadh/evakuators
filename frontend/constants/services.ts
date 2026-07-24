import { ServiceType } from '~/types/enums'

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
  [ServiceType.CashPayment]: 'Կանխիկ',
  [ServiceType.CardPayment]: 'Քարտով վճարում',
  [ServiceType.CashlessTransfer]: 'Անկանխիկ փոխանցում',
  [ServiceType.BankTransfer]: 'Բանկային փոխանցում',
  [ServiceType.ReceiptProvided]: 'ՀԴՄ կտրոն',
  [ServiceType.InvoiceProvided]: 'Հաշիվ-ապրանքագիր',

  // 5. Աշխատանքային պայմաններ
  [ServiceType.Available247]: '24/7 սպասարկում',
  [ServiceType.NightService]: 'Գիշերային սպասարկում',
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
    services: [
      ServiceType.CashPayment,
      ServiceType.CardPayment,
      ServiceType.CashlessTransfer,
      ServiceType.BankTransfer,
      ServiceType.ReceiptProvided,
      ServiceType.InvoiceProvided,
    ],
  },
  {
    key: 'availability',
    title: 'Աշխատանքային պայմաններ',
    description: 'Ե՞րբ եք հասանելի։',
    services: [ServiceType.Available247, ServiceType.NightService, ServiceType.WeekendService],
  },
]
