import { todayISO } from "@/lib/date";
import { getTodayPayload } from "@/lib/views/today";
import { TodayView } from "@/components/today-view";

export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const payload = await getTodayPayload(todayISO());
  return <TodayView initial={payload} />;
}
