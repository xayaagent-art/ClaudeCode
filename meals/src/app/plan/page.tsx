import { todayISO } from "@/lib/date";
import { getPlanPayload } from "@/lib/views/plan";
import { PlanView } from "@/components/plan-view";

export const dynamic = "force-dynamic";

export default async function PlanPage() {
  // Read only. Opening Plan has never generated anything and still does not.
  const payload = await getPlanPayload(todayISO());
  return <PlanView payload={payload} />;
}
