import { getDb } from "@/lib/db";
import { supabaseConfigured } from "@/lib/db/supabase";
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
        storage: supabaseConfigured() ? "Supabase" : "Local dev store",
        parser:
          activeProviderName() === "openai"
            ? "OpenAI vision (real receipts)"
            : "Mock mode (bundled fixture)",
        nutrition: process.env.FDC_API_KEY ? "USDA FoodData Central" : "Built-in generic table",
      }}
    />
  );
}
