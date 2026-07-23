/** Minimal shape of what we read from a Telegram "Update" webhook payload */
export interface TelegramUpdate {
  update_id: number
  message?: {
    message_id: number
    date: number
    chat: { id: number }
    text?: string
  }
}
