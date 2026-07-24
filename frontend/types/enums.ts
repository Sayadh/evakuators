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

export enum CapacityOption {
  UpTo2 = 2,
  UpTo5 = 5,
  UpTo10 = 10,
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
}
