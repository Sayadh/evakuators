/**
 * Combines the arrival date-picker's date + the arrival time-picker's time
 * into an ISO instant, given the route's already-built departure instant.
 *
 * There is deliberately no separate "arrival date" field — the form asks the
 * driver for one date and two clock times ("departs 12:00, arrives 19:00"),
 * matching how a driver actually thinks about a single trip. That means an
 * arrival typed as *earlier* than the departure time is almost always an
 * overnight trip (departs 22:00, arrives 03:00), not a mistake — so a
 * same-or-earlier clock time rolls over to the next calendar day rather than
 * being rejected. A trip long enough to span more than 24h still needs the
 * driver to edit the route again once under way; that's an acceptable trade
 * for keeping the form to one date field.
 */
export function buildEstimatedArrivalAt(departure: Date, dateStr: string, timeStr: string): Date | null {
  if (!dateStr || !timeStr) return null
  const combined = new Date(`${dateStr}T${timeStr}:00`)
  if (Number.isNaN(combined.getTime())) return null
  if (combined.getTime() <= departure.getTime()) {
    combined.setDate(combined.getDate() + 1)
  }
  return combined
}
