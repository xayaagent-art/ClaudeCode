/**
 * Put a plausible day into the local QA store — through the app's own endpoints,
 * never by writing numbers into the file.
 *
 * The calorie ring has to be shot against a day that has meals in it, and the
 * only honest way to produce one is to log meals the way a household does: ask
 * for recommendations, then POST /api/meals/log. Every figure the screenshots
 * then show is the app's own arithmetic over its own records. Nothing here
 * invents a consumed-calorie total.
 */
const BASE = process.env.QA_BASE ?? "http://localhost:3311";

async function json(path, init) {
  const response = await fetch(`${BASE}${path}`, init);
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`${path} -> ${response.status} ${JSON.stringify(body)}`);
  return body;
}

const recommend = await json("/api/meals/recommend", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ meal_type: "dinner" }),
});

const set = recommend.recommendations ?? recommend.data?.recommendations ?? [];
if (set.length === 0) throw new Error(`no recommendations: ${JSON.stringify(recommend).slice(0, 400)}`);

// Breakfast and lunch already eaten; dinner is still the open decision, which
// is the state Today is designed for.
const eaten = set.slice(1, 3);
for (const [index, entry] of eaten.entries()) {
  const recipeId = entry.recipe?.id ?? entry.recipe_id;
  const logged = await json("/api/meals/log", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recipe_id: recipeId, meal_type: index === 0 ? "breakfast" : "lunch" }),
  });
  console.log("logged", index === 0 ? "breakfast" : "lunch", recipeId, JSON.stringify(logged).slice(0, 160));
}

const today = await json("/api/today");
const payload = today.data ?? today;
const household = payload.progress?.find((row) => row.scope === "household");
console.log("household progress:", JSON.stringify(household));
console.log("hero:", payload.latest_recommendation?.title, "thumb:", payload.latest_recommendation?.thumbnail_url);
