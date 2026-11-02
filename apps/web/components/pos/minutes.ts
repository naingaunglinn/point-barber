/** Whole minutes from an instant to now, never negative (the elapsed time of a visit — AD-TODAY-01). */
export function minutesSince(from: string, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - new Date(from).getTime()) / 60_000));
}
