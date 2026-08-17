import { getDb } from "@/lib/db";
import { persistenceKind } from "@/lib/db";
import { activeProviderName } from "@/lib/ai";
import { youtubeProvider } from "@/lib/video/youtube";
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
        // Reports whether the provider can be called at all. It deliberately
        // does not probe: a status line is not worth 100 units of daily quota.
        video: youtubeProvider.enabled() ? "YouTube (live)" : "Not configured",
      }}
    />
  );
}
