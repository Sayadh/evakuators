export enum ServiceType {
  Intercity = 'intercity',
  IntercityAllArmenia = 'intercity-all-armenia',
  IntercityCrossBorder = 'intercity-cross-border',
  CarTransport = 'car-transport',
  SuvTransport = 'suv-transport',
  MinibusTransport = 'minibus-transport',
  TruckTransport = 'truck-transport',
  MotorcycleTransport = 'motorcycle-transport',
  SpecialEquipment = 'special-equipment',
  AccidentTow = 'accident-tow',
  NonRunningTow = 'non-running-tow',
  OffRoadRecovery = 'off-road-recovery',
  SnowMudRecovery = 'snow-mud-recovery',
  UndergroundParking = 'underground-parking',
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
