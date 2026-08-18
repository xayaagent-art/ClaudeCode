import Link from "next/link";
import { persistenceKind } from "@/lib/db";
import { activeProviderName } from "@/lib/ai";
import { modelRouting } from "@/lib/ai/models";
import { openAIModelHint } from "@/lib/ai/openai-models";
import { youtubeProvider } from "@/lib/video/youtube";

export const dynamic = "force-dynamic";

/**
 * Where the implementation details live now.
 *
 * They were on Settings, next to Yash and Surabhi's calorie targets, which made
 * a household app read like a build dashboard. Nobody deciding what to cook
 * needs to know which model parses receipts — but when something looks wrong,
 * it needs to be findable, so it moved rather than disappeared.
 */
export default function DiagnosticsPage() {
  const provider = activeProviderName();
  const models = modelRouting();

  const rows: { label: string; value: string }[] = [
    {
      label: "Storage",
      value:
        persistenceKind() === "supabase"
          ? "Supabase"
          : persistenceKind() === "local"
            ? "Local dev store"
            : "Not configured",
    },
    {
      label: "Receipt parser",
      value:
        provider === "gemini"
          ? `Gemini vision (${models.receipt_parse})`
          : provider === "openai"
            ? `OpenAI vision (${openAIModelHint("receipt_vision")})`
            : "Mock mode (bundled fixture)",
    },
    {
      label: "Receipt escalation",
      value: provider === "gemini" ? models.receipt_escalation : "Not applicable",
    },
    {
      label: "Meal ideas",
      value:
        provider === "gemini"
          ? `Gemini (${models.meal_candidate_generation})`
          : provider === "openai"
            ? `OpenAI (${openAIModelHint("meal_generation")})`
            : "Built-in recipe library only",
    },
    {
      label: "Nutrition data",
      value: process.env.FDC_API_KEY ? "USDA FoodData Central" : "Built-in generic table",
    },
    {
      label: "Cooking videos",
      value: youtubeProvider.enabled() ? "YouTube (live)" : "Not configured",
    },
  ];

  return (
    <>
      <header className="flex items-start justify-between gap-4 px-5 pt-8 pb-6">
        <div>
          <p className="text-meta text-ink-muted">Settings</p>
          <h1 className="mt-1 text-display font-semibold tracking-tight">Diagnostics</h1>
        </div>
        <Link
          href="/settings"
          className="min-h-11 self-center px-2 text-meta text-ink-muted hover:text-ink"
        >
          Back
        </Link>
      </header>

      <section className="px-5 pb-10">
        <dl className="space-y-2 text-meta">
          {rows.map((row) => (
            <div key={row.label} className="flex justify-between gap-4">
              <dt className="text-ink-muted">{row.label}</dt>
              <dd className="text-right">{row.value}</dd>
            </div>
          ))}
        </dl>
      </section>
    </>
  );
}
