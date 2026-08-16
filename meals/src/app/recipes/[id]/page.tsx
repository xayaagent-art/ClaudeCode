import { notFound } from "next/navigation";
import { getRecipeDetail } from "@/lib/views/recipe";
import { RecipeView } from "@/components/recipe-view";

export const dynamic = "force-dynamic";

export default async function RecipePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getRecipeDetail(id, "dinner");
  if (!detail) notFound();
  return <RecipeView detail={detail} />;
}
