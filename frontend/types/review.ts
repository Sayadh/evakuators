/** Public shape — an approved review shown on a tow truck's profile page */
export interface Review {
  id: number
  authorName: string
  /** 1–5 */
  rating: number
  text: string
  cityName?: string
  /** ISO datetime */
  date: string
}

/** What a customer submits — goes to admin moderation before it's public */
export interface CreateReviewPayload {
  authorName: string
  rating: number
  text: string
  cityName?: string
}
