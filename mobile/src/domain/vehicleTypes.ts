/**
 * Vehicle types an app-only driver can pick at sign-up. Keep in sync with
 * `VehicleType` in frontend/types/enums.ts and APP_VEHICLE_TYPES in
 * backend/src/live-dispatch/fleet/fleet-access.ts (a backend test reads this
 * file as text). Labels live in i18n (`register.vehicleTypes.*`).
 */
export const VEHICLE_TYPES = ['flatbed', 'sliding-platform', 'manipulator', 'heavy-duty'] as const
export type VehicleType = (typeof VEHICLE_TYPES)[number]
