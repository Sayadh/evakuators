/**
 * `TELEGRAM_MESSAGE_MAX_LENGTH` here MUST match the constant of the same name
 * in `backend/src/admin/dto/broadcast-message.dto.ts` — see CLAUDE.md
 * § "Manual sync points". Raising it here only means the admin broadcast
 * textarea accepts a value the API then rejects; raising it on the backend
 * only means the limit is advisory until this copy catches up.
 */
export const TELEGRAM_MESSAGE_MAX_LENGTH = 4000

/**
 * The schematic driver map on /admin/orders and /admin/orders/:id
 * (`OpsDriverMap.vue`) is hidden for now: with no tile layer it reads as a
 * broken map. The driver list next to it stays, with a Google Maps link per
 * driver. Turn this back on — or replace the component — once a real map
 * provider is chosen (docs/live-dispatch/07-admin-console.md § "Map").
 */
export const SHOW_OPS_DRIVER_MAP = false
