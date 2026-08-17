import { getDb } from "@/lib/db";
import { SettingsView } from "@/components/settings-view";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const db = getDb();
  const [household, members, inventory] = await Promise.all([
    db.getHousehold(),
    db.listMembers(),
    db.listInventory(),
  ]);

  // Seeded rows carry status_source "seed" and have no receipt behind them.
  // Real groceries always arrive from a scan, so the two are distinguishable
  // and "clear the demo pantry" can mean exactly that.
  const demoCount = inventory.filter(
    (item) => item.status_source === "seed" && !item.receipt_id && !item.receipt_item_id,
  ).length;

  return (
    <SettingsView
      householdName={household.name}
      members={members}
      kitchen={{ total: inventory.length, demo: demoCount }}
    />
  );
}
