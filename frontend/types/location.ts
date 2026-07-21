export interface Region {
  id: number
  name: string
  slug: string
  description: string
}

export interface City {
  id: number
  regionId: number
  name: string
  slug: string
  description?: string
}

export interface District {
  id: number
  name: string
  slug: string
  description?: string
}

/** Aggregated shapes returned by the service layer (counts are computed, not stored) */
export interface RegionWithStats extends Region {
  cityCount: number
  towTruckCount: number
}

export interface CityWithStats extends City {
  regionSlug: string
  regionName: string
  towTruckCount: number
  towTruck24hCount: number
}

export interface DistrictWithStats extends District {
  towTruckCount: number
  towTruck24hCount: number
}
