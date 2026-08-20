import { getDb } from "@/lib/db";
import { todayISO } from "@/lib/date";
import { inspectAll } from "@/lib/kitchen/state";
import { KitchenView } from "@/components/kitchen-view";

export const dynamic = "force-dynamic";

export default async function KitchenPage() {
  const db = getDb();
  const today = todayISO();
  const [items, events] = await Promise.all([db.listInventory(), db.listInventoryEvents(300)]);
  const insights = inspectAll(items, events, today);

  // Nothing about the storage backend or the model provider is passed here any
  // more. Which database this runs on is not something a person cooking dinner
  // has an opinion about; it lives on the diagnostics page instead.
  return (
    <KitchenView
      items={insights.map((insight) => ({
        id: insight.item.id,
        name: insight.item.normalized_name,
        raw_name: insight.item.raw_name,
        storage_location: insight.item.storage_location,
        status: insight.status,
        quantity: insight.item.quantity,
        package_size: insight.item.package_size,
        created_at: insight.item.created_at,
        use_soon: insight.use_soon,
        use_soon_score: insight.use_soon_score,
        freshness_label: insight.freshness_label,
        likely_past_best: insight.likely_past_best,
      }))}
    />
  );
}
