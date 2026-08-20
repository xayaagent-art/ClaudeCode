import { todayISO } from "@/lib/date";
import { getTodayPayload } from "@/lib/views/today";
import { getCurrentRecommendations } from "@/lib/views/recommendations";
import { TodayView } from "@/components/today-view";

export const dynamic = "force-dynamic";

export default async function TodayPage() {
  // Both come from persisted state, so opening Today costs reads and nothing
  // else. The set is passed in whole: the alternatives sheet opens instantly
  // with what the household already has, and only asks for more when asked.
  const [payload, current] = await Promise.all([
    getTodayPayload(todayISO()),
    getCurrentRecommendations(),
  ]);

  return <TodayView initial={payload} currentSet={current} />;
}
