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
  aliases: string[]
}

export interface District {
  id: number
  name: string
  slug: string
  description?: string
  aliases: string[]
}

/**
 * A named road corridor a driver can list as coverage — «Գառնի–Գեղարդ».
 *
 * Deliberately its own type rather than a `City` with a flag. A city has
 * settlements around it, appears in the nearby-cities list, carries its own
 * counters and owns a browsable page built from all of that; a zone has none
 * of it and must never be pulled into city-shaped logic by accident. Keeping
 * the types apart is what makes that a compile error rather than a bug.
 *
 * No `aliases`: those exist for text search, which this project does not have
 * (the hero form is a region → area cascade of `<select>`s).
 */
export interface ServiceZone {
  id: number
  regionId: number
  name: string
  slug: string
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
