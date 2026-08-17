import { getDb } from "@/lib/db";
import { persistenceKind } from "@/lib/db";
import { activeProviderName } from "@/lib/ai";
import { SettingsView } from "@/components/settings-view";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const db = getDb();
  const [household, members] = await Promise.all([db.getHousehold(), db.listMembers()]);

  return (
    <SettingsView
      householdName={household.name}
      members={members}
      config={{
        storage:
          persistenceKind() === "supabase"
            ? "Supabase"
            : persistenceKind() === "local"
              ? "Local dev store"
              : "Not configured",
        parser:
          activeProviderName() === "openai"
            ? "OpenAI vision (real receipts)"
            : "Mock mode (bundled fixture)",
        nutrition: process.env.FDC_API_KEY ? "USDA FoodData Central" : "Built-in generic table",
      }}
    />
  );
}
