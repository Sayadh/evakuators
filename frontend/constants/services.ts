import { ServiceType } from '~/types/enums'

export const SERVICE_LABELS: Record<ServiceType, string> = {
  [ServiceType.Intercity]: 'Միջքաղաքային տեղափոխում',
  [ServiceType.IntercityAllArmenia]: 'Միջքաղաքային՝ ամբողջ Հայաստանի տարածքում',
  [ServiceType.IntercityCrossBorder]:
    'Միջքաղաքային՝ սահմանային ուղղություններ (Վրաստան / Իրան)',
  [ServiceType.CarTransport]: 'Մարդատար մեքենաների տեղափոխում',
  [ServiceType.SuvTransport]: 'Ամենագնացների (ջիպերի) տեղափոխում',
  [ServiceType.MinibusTransport]: 'Միկրոավտոբուսների տեղափոխում',
  [ServiceType.TruckTransport]: 'Բեռնատարների տեղափոխում',
  [ServiceType.MotorcycleTransport]: 'Մոտոցիկլների տեղափոխում',
  [ServiceType.SpecialEquipment]: 'Հատուկ տեխնիկայի տեղափոխում',
  [ServiceType.AccidentTow]: 'Վթարված մեքենաների տեղափոխում',
  [ServiceType.NonRunningTow]: 'Չաշխատող մեքենաների տեղափոխում',
  [ServiceType.OffRoadRecovery]: 'Ճանապարհից դուրս մեքենայի դուրսբերում',
  [ServiceType.SnowMudRecovery]: 'Ձյունից կամ ցեխից մեքենայի դուրսբերում',
  [ServiceType.UndergroundParking]: 'Ստորգետնյա ավտոկայանատեղիից դուրսբերում',
}

/** Services shown as filter checkboxes on listing pages */
export const FILTERABLE_SERVICES: ServiceType[] = [
  ServiceType.CarTransport,
  ServiceType.SuvTransport,
  ServiceType.MinibusTransport,
  ServiceType.TruckTransport,
  ServiceType.MotorcycleTransport,
  ServiceType.SpecialEquipment,
  ServiceType.AccidentTow,
  ServiceType.NonRunningTow,
  ServiceType.Intercity,
]
