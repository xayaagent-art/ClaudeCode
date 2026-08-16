import { getDb } from "@/lib/db";
import { todayISO } from "@/lib/date";
import { PlanView } from "@/components/plan-view";

export const dynamic = "force-dynamic";

export default async function PlanPage() {
  const db = getDb();
  const start = todayISO();
  const [plan, inventory] = await Promise.all([db.getCurrentPlan(start), db.listInventory()]);

  return (
    <PlanView
      startDate={start}
      entries={plan?.entries ?? []}
      kitchenEmpty={inventory.filter((i) => i.status !== "out").length === 0}
    />
  );
}
