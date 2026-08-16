import { getDb } from "@/lib/db";
import { daysToExpiry, todayISO } from "@/lib/date";
import { supabaseConfigured } from "@/lib/db/supabase";
import { activeProviderName } from "@/lib/ai";
import { KitchenView } from "@/components/kitchen-view";

export const dynamic = "force-dynamic";

export default async function KitchenPage() {
  const db = getDb();
  const today = todayISO();
  const items = await db.listInventory();

  return (
    <KitchenView
      items={items.map((item) => ({
        id: item.id,
        name: item.normalized_name,
        raw_name: item.raw_name,
        category: item.category,
        storage_location: item.storage_location,
        status: item.status,
        quantity: item.quantity,
        package_size: item.package_size,
        days_to_expiry: daysToExpiry(item.estimated_expiry, today),
        created_at: item.created_at,
        nutrition_source: item.nutrition_source,
        nutrition_confidence: item.nutrition_confidence,
      }))}
      config={{
        storage: supabaseConfigured() ? "supabase" : "local",
        parser: activeProviderName(),
      }}
    />
  );
}
