import { todayISO } from "@/lib/date";
import { getTodayPayload } from "@/lib/views/today";
import { getCurrentRecommendations } from "@/lib/views/recommendations";
import { TodayView } from "@/components/today-view";

export const dynamic = "force-dynamic";

export default async function TodayPage() {
  // Both read persisted state. Opening Today costs reads and nothing else.
  const [payload, current] = await Promise.all([
    getTodayPayload(todayISO()),
    getCurrentRecommendations(),
  ]);

  return <TodayView initial={payload} currentSet={current} />;
}
