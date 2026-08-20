import { getCurrentRecommendations } from "@/lib/views/recommendations";
import { RecommendationsView } from "@/components/recommendations-view";

export const dynamic = "force-dynamic";

export default async function MealsPage() {
  // Read the current set on the server. Arriving here — including by pressing
  // back — renders what the household was already looking at; it never asks
  // the model a question nobody asked.
  const initial = await getCurrentRecommendations();
  return <RecommendationsView initial={initial} />;
}
