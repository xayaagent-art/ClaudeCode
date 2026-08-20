import type { WeeklyPlan } from "@/lib/types";

/**
 * Does this saved plan still describe the week the household is living in?
 *
 * A plan is addressed by the date it starts on, but it is read on whatever day
 * someone opens Plan. Asking for an exact match meant the week disappeared the
 * morning after it was made. Coverage is decided by the entries themselves
 * rather than by assuming seven days, so a three-day plan expires when its
 * last dinner does and a fortnight keeps answering for a fortnight.
 */
export function planCovers(plan: WeeklyPlan | null, date: string): boolean {
  if (!plan) return false;
  if (plan.start_date > date) return false;
  const last = plan.entries.reduce<string | null>(
    (latest, entry) => (latest === null || entry.date > latest ? entry.date : latest),
    null,
  );
  // A plan with no entries covers nothing; there is no week in it to show.
  return last !== null && last >= date;
}
