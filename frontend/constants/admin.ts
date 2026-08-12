/**
 * `TELEGRAM_MESSAGE_MAX_LENGTH` here MUST match the constant of the same name
 * in `backend/src/admin/dto/broadcast-message.dto.ts` — see CLAUDE.md
 * § "Manual sync points". Raising it here only means the admin broadcast
 * textarea accepts a value the API then rejects; raising it on the backend
 * only means the limit is advisory until this copy catches up.
 */
export const TELEGRAM_MESSAGE_MAX_LENGTH = 4000
