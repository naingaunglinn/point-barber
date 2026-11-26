// The preferred-barber rule (D-CUS-08 · owner #6 · design D6): among the customer's last W FINISHED
// visits in the caller's read scope (`customer.preferred_barber_window`, newest first), the performer
// with at least M of them (`customer.preferred_barber_min_visits`); when the settings let two qualify,
// the one with more of those visits, then the one whose latest of them is newer. Null when nobody
// qualifies. A pure function: CustomerStats.of reads the visits and the two settings.

/** One of the customer's recent finished visits (CustomerActivity.recentVisits). */
export interface RecentVisit {
  readonly visit_id: string;
  readonly finished_at: Date;
  readonly performed_by_employee_id: string;
}

interface Group {
  readonly employeeId: string;
  readonly count: number;
  readonly latest: number;
}

/** The employee id of the preferred barber of `visits`, or null. */
export function pickPreferred(visits: readonly RecentVisit[], minVisits: number): string | null {
  const groups = new Map<string, Group>();
  for (const visit of visits) {
    const at = visit.finished_at.getTime();
    const employeeId = visit.performed_by_employee_id;
    const seen = groups.get(employeeId);
    groups.set(employeeId, {
      employeeId,
      count: (seen?.count ?? 0) + 1,
      latest: Math.max(seen?.latest ?? at, at),
    });
  }
  let best: Group | null = null;
  for (const group of groups.values()) {
    if (group.count < minVisits) continue;
    const better =
      best === null ||
      group.count > best.count ||
      (group.count === best.count && group.latest > best.latest);
    if (better) best = group;
  }
  return best?.employeeId ?? null;
}
