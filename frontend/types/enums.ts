export enum ServiceType {
  // 1. Էվակուատորի ծառայություններ (Հիմնական)
  CarTransport = 'car-transport',
  SuvTransport = 'suv-transport',
  MinibusTransport = 'minibus-transport',
  TruckTransport = 'truck-transport',
  MotorcycleTransport = 'motorcycle-transport',
  QuadbikeTransport = 'quadbike-transport',
  SportsCarTransport = 'sports-car-transport',
  LowClearanceTransport = 'low-clearance-transport',
  ElectricCarTransport = 'electric-car-transport',
  HybridCarTransport = 'hybrid-car-transport',
  NonRunningTransport = 'non-running-transport',
  AccidentTransport = 'accident-transport',
  NonStartingTransport = 'non-starting-transport',
  LongDistanceTransport = 'long-distance-transport',
  IntercityTransport = 'intercity-transport',
  IntercityCrossBorder = 'intercity-cross-border',
  ConstructionEquipmentTransport = 'construction-equipment-transport',
  AgriculturalEquipmentTransport = 'agricultural-equipment-transport',

  // 2. Ճանապարհային օգնություն
  BatteryJumpstart = 'battery-jumpstart',
  BatteryReplacement = 'battery-replacement',
  BatteryCharging = 'battery-charging',
  TireReplacement = 'tire-replacement',
  SpareTireFitting = 'spare-tire-fitting',
  FuelDeliveryPetrol = 'fuel-delivery-petrol',
  FuelDeliveryDiesel = 'fuel-delivery-diesel',
  DoorUnlocking = 'door-unlocking',
  LockoutAssistance = 'lockout-assistance',
  MinorRoadsideRepair = 'minor-roadside-repair',

  // 3. Դուրսբերման ծառայություններ
  WinchRecovery = 'winch-recovery',
  SnowRecovery = 'snow-recovery',
  MudRecovery = 'mud-recovery',
  PotholeRecovery = 'pothole-recovery',
  RavineRecovery = 'ravine-recovery',
  OffRoadRecovery = 'offroad-recovery',
  RolloverRecovery = 'rollover-recovery',
  UndergroundParkingRecovery = 'underground-parking-recovery',

  // 4. Վճարման տարբերակներ
  CashPayment = 'cash-payment',
  CardPayment = 'card-payment',
  CashlessTransfer = 'cashless-transfer',
  BankTransfer = 'bank-transfer',
  ReceiptProvided = 'receipt-provided',
  InvoiceProvided = 'invoice-provided',

  // 5. Աշխատանքային պայմաններ
  Available247 = 'available-24-7',
  NightService = 'night-service',
  WeekendService = 'weekend-service',
}

export enum VehicleType {
  Flatbed = 'flatbed',
  SlidingPlatform = 'sliding-platform',
  Manipulator = 'manipulator',
  HeavyDuty = 'heavy-duty',
}

export enum SortOption {
  Recommended = 'recommended',
  Price = 'price',
}

export enum AvailabilityStatus {
  AvailableNow = 'available-now',
  Busy = 'busy',
  Offline = 'offline',
}

export enum LocationType {
  Region = 'region',
  City = 'city',
  District = 'district',
  /**
   * A named road corridor a driver serves as a whole — «Գառնի–Գեղարդ»,
   * «Տաթև–Հալիձոր». Not a settlement, so it has no population, no nearby-city
   * relationships and no implied coverage of the places along it: picking
   * «Գառնի–Գեղարդ» says the driver works that route, NOT that they serve Գառնի
   * or Գեղարդ. Matching is therefore exact-slug only.
   *
   * MANUAL SYNC POINT: the value must equal `@IsIn` in
   * `backend/src/tow-trucks/dto/service-area.dto.ts`. It travels in both
   * directions inside `TowTruck.serviceAreas` JSON, and nothing checks it at
   * compile time — same rule as `available-24-7` (see CLAUDE.md).
   */
  Route = 'route',
}

/**
 * Provider-analytics event taxonomy.
 *
 * MANUAL SYNC POINT: these values must match `enum AnalyticsEventType` in
 * `backend/prisma/schema.prisma` character-for-character — they travel over the
 * wire in both directions (sent when tracking, used as response object keys).
 * Nothing enforces this at compile time, same as the `available-24-7` slug
 * (see CLAUDE.md § "Manual sync points"). Unlike the service slugs these are
 * SCREAMING_SNAKE_CASE, because they are a real Postgres enum rather than a
 * kebab-case URL-ish slug.
 */
export enum AnalyticsEventType {
  PageView = 'PAGE_VIEW',
  PhoneClick = 'PHONE_CLICK',
  WhatsAppClick = 'WHATSAPP_CLICK',
  TelegramClick = 'TELEGRAM_CLICK',
  EmailClick = 'EMAIL_CLICK',
}

/**
 * Site-wide event taxonomy, for the admin panel's own traffic numbers.
 *
 * MANUAL SYNC POINT, same as AnalyticsEventType above: these must match
 * `enum SiteEventType` in `backend/prisma/schema.prisma` exactly. Separate
 * from AnalyticsEventType on purpose — those belong to one driver's listing,
 * these describe the platform.
 */
export enum SiteEventType {
  /** Any page of the site opened, once per visitor per Armenia day */
  SiteVisit = 'SITE_VISIT',
  /** The "Ազատ երթուղիներ" page specifically */
  FreeRoutesView = 'FREE_ROUTES_VIEW',
}

/** Selectable chart/overview windows — mirrors backend AnalyticsPeriod */
export enum AnalyticsPeriod {
  Last7Days = 'LAST_7_DAYS',
  Last30Days = 'LAST_30_DAYS',
  Last90Days = 'LAST_90_DAYS',
}

/** Which slice of reviews the dashboard asks for — mirrors backend AnalyticsReviewStatus */
export enum AnalyticsReviewStatus {
  Confirmed = 'CONFIRMED',
  Pending = 'PENDING',
  All = 'ALL',
}

/**
 * Every card the analytics dashboard can render. Kept as its own enum (rather
 * than reusing AnalyticsEventType) because two cards — unique visitors, and the
 * 24h-independent review/rating blocks — are not event types at all, and the
 * card list is a presentation concern that may diverge from the event taxonomy.
 */
export enum AnalyticsCard {
  PageViews = 'PAGE_VIEWS',
  UniqueVisitors = 'UNIQUE_VISITORS',
  PhoneClicks = 'PHONE_CLICKS',
  WhatsAppClicks = 'WHATSAPP_CLICKS',
  TelegramClicks = 'TELEGRAM_CLICKS',
  EmailClicks = 'EMAIL_CLICKS',
}
