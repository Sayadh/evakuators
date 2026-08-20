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

  // 1b. Մանիպուլյատորի ծառայություններ
  //
  // Only the answers the existing taxonomy could NOT already express are new
  // slugs. «Ավտոմեքենաների բարձում», «վթարված/չշարժվող», «շինարարական
  // տեխնիկա», «գյուղատնտեսական տեխնիկա» and «միջքաղաքային» are the same
  // customer-facing services a flatbed offers — a crane is how the job is done,
  // not a different job — so MANIPULATOR_SERVICES below reuses
  // CarTransport / AccidentTransport / NonRunningTransport /
  // ConstructionEquipmentTransport / AgriculturalEquipmentTransport /
  // IntercityTransport / LongDistanceTransport rather than minting near-copies
  // of them. Two slugs meaning one thing is what
  // `docs/taxonomies.md` exists to prevent: the profile page, the filter and
  // the card would each pick one of the pair and disagree.
  MachineryTransport = 'machinery-transport',
  ContainerCabinTransport = 'container-cabin-transport',
  LoadingUnloadingWorks = 'loading-unloading-works',

  // 1c. Ծանր տեխնիկայի փոխադրման ծառայություններ
  //
  // Same rule. A named machine class an evacuator taxonomy has no word for
  // gets a slug; «գյուղատնտեսական տեխնիկա» and «միջքաղաքային» already have one.
  ExcavatorTransport = 'excavator-transport',
  BulldozerTransport = 'bulldozer-transport',
  LoaderTransport = 'loader-transport',
  RoadEquipmentTransport = 'road-equipment-transport',
  IndustrialEquipmentTransport = 'industrial-equipment-transport',
  OversizedCargoTransport = 'oversized-cargo-transport',

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
  // `receipt-provided` («ՀԴՄ կտրոն») was removed: it is not a way to pay, it is
  // a piece of paper you get afterwards, and it sat in the payment list next to
  // the four methods as if a customer had to choose between them. Stripped from
  // every stored profile by `20260820150000_payment_methods_rework`.
  //
  // `invoice-provided` is the same kind of thing and survives for the opposite
  // reason: businesses genuinely filter on it. It is asked as its own checkbox
  // OUTSIDE the payment group — see `STANDALONE_SERVICES`.
  InvoiceProvided = 'invoice-provided',

  // 5. Աշխատանքային պայմաններ
  Available247 = 'available-24-7',
  // `night-service` was removed: «Գիշերային սպասարկում» and «24/7 սպասարկում»
  // are the same claim said twice. A driver who works nights either works round
  // the clock or has working hours that say so, and the pair could disagree —
  // 24/7 ticked with nights unticked meant nothing anyone could act on. The
  // slug is stripped from every stored profile by
  // `20260820140000_drop_night_service_slug`; do not reintroduce it.
  //
  // Note this is unrelated to `priceNightSurchargePercent`, which is a price
  // and survives: charging more after midnight is a real, separate answer.
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
