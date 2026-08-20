/**
 * Domain types. These mirror the SQL schema in supabase/migrations one-to-one so
 * the Supabase and local adapters can share mapping code.
 */

export type StorageLocation = "Fridge" | "Pantry" | "Freezer" | "Produce";

export type InventoryStatus = "full" | "some" | "low" | "out";

export type Classification = "human_food" | "non_food" | "pet_food" | "uncertain";

export type ConfidenceBand = "high" | "medium" | "low";

export type ReceiptStatus =
  | "uploaded"
  | "parsing"
  | "parsed"
  | "partially_parsed"
  | "failed"
  | "confirmed";

export type MealType = "breakfast" | "lunch" | "dinner" | "snack";

export type RecipeSourceType = "catalog" | "web" | "adapted" | "generated" | "user";

export type FeedbackRating = "love" | "fine" | "never";

export type InventoryEventType =
  | "receipt_added"
  | "meal_consumed"
  | "manual_adjustment"
  | "restocked"
  | "marked_low"
  | "marked_out"
  | "expired"
  | "undo_meal"
  | "system_inference"
  | "user_confirmation";

export interface Household {
  id: string;
  name: string;
  created_at: string;
}

export interface HouseholdMember {
  id: string;
  household_id: string;
  name: string;
  avatar: string | null;
  created_at: string;
}

export interface NutritionProfile {
  member_id: string;
  calorie_target: number;
  protein_target: number;
  /** Free-form flags such as "vegetarian", "eggs", "occasional_chicken". */
  dietary_preferences: string[];
  allergies: string[];
  dislikes: string[];
  preferred_cuisines: string[];
  max_cooking_time: number;
  spice_preference: "mild" | "medium" | "hot";
  /** 0 = never repeat a recent meal, 1 = repeats are fine. */
  repeat_tolerance: number;
}

export interface Member extends HouseholdMember {
  profile: NutritionProfile;
}

export interface Receipt {
  id: string;
  household_id: string;
  merchant: string | null;
  purchase_date: string | null;
  currency: string;
  subtotal: number | null;
  tax: number | null;
  total: number | null;
  image_path: string | null;
  /** sha256 of the uploaded bytes, so the same photo is recognised. */
  image_hash: string | null;
  processing_status: ReceiptStatus;
  parser: "openai" | "gemini" | "fixture" | null;
  error_message: string | null;
  created_at: string;
}

export interface ReceiptItem {
  id: string;
  receipt_id: string;
  raw_name: string;
  normalized_name: string;
  quantity: number;
  package_size: string | null;
  /** Per-unit price when printed. */
  unit_price: number | null;
  /** Line total. Kept as `price` for storage compatibility with 0001. */
  price: number | null;
  category: string;
  storage_location: StorageLocation;
  classification: Classification;
  confidence: number;
  matched_food_id: string | null;
  /** Set false when the user removes the line during review. */
  included: boolean;
  notes: string | null;
}

export interface InventoryItem {
  id: string;
  household_id: string;
  normalized_name: string;
  raw_name: string | null;
  category: string;
  storage_location: StorageLocation;
  quantity: number;
  package_size: string | null;
  status: InventoryStatus;
  purchase_date: string | null;
  estimated_expiry: string | null;
  nutrition_food_id: string | null;
  nutrition_source: NutritionSource | null;
  nutrition_confidence: ConfidenceBand | null;
  calories_per_100g: number | null;
  protein_per_100g: number | null;
  serving_size: string | null;
  confidence: number;
  /**
   * How sure we are that `status` reflects reality, 0–1. Starts high after a
   * receipt or a user confirmation and decays as the state becomes inferred
   * rather than observed. Internal — the UI shows a band, not the number.
   */
  status_confidence: number;
  /** Last time a human told us the true state, as opposed to us inferring it. */
  last_confirmed_at: string | null;
  /** How the current status was arrived at. */
  status_source: InventoryStatusSource;
  receipt_item_id: string | null;
  receipt_id: string | null;
  created_at: string;
  updated_at: string;
}

export type InventoryStatusSource = "receipt" | "user" | "inferred" | "seed";

/**
 * Where an item's nutrition numbers came from, most trustworthy first. Shown to
 * the user as a plain-language label so a generic estimate is never mistaken
 * for a match on the actual product.
 */
export type NutritionSource =
  | "known_product"
  | "store_product"
  | "usda_branded"
  | "usda_generic"
  | "builtin_generic"
  | "ai_generic"
  | "unmatched";

export interface InventoryEvent {
  id: string;
  household_id: string;
  inventory_item_id: string;
  event_type: InventoryEventType;
  from_status: InventoryStatus | null;
  to_status: InventoryStatus | null;
  detail: string | null;
  created_at: string;
}

export interface RecipeIngredient {
  id: string;
  recipe_id: string;
  ingredient_name: string;
  /** Canonical form used for inventory matching; see kitchen/match.ts. */
  normalized_name: string;
  quantity: number | null;
  unit: string | null;
  optional: boolean;
  /** Resolved at read time against current inventory, not persisted. */
  inventory_item_id?: string | null;
}

export type VideoPlatform = "youtube" | "other";

/**
 * Why a particular source was chosen. Kept internal and never rendered as a
 * numeric score — users see the outcome, not a fabricated confidence number.
 */
export interface SourceQuality {
  /** 0–1, internal only. */
  score: number;
  /** Human-readable factors, for debugging a bad pick after the fact. */
  reasons: string[];
  checked_at: string;
}

export interface Recipe {
  id: string;
  title: string;
  description: string;
  cuisine: string;
  image_url: string | null;
  prep_time_minutes: number;
  cook_time_minutes: number;
  total_time_minutes: number;
  servings: number;
  calories_per_serving: number;
  protein_per_serving: number;
  dietary_tags: string[];
  source_type: RecipeSourceType;
  source_url: string | null;
  /** Publisher or channel name, shown as attribution next to the link. */
  source_name: string | null;
  /** Watchable cooking video for this dish, when one has been found. */
  video_url: string | null;
  video_platform: VideoPlatform | null;
  /** Real image from the chosen source. Null falls back to a typographic plate. */
  thumbnail_url: string | null;
  attribution: string | null;
  source_quality: SourceQuality | null;
  /** When the external source was last resolved; drives cache staleness. */
  discovered_at: string | null;
  /** Our own two-line description of the method, never the source's text. */
  cooking_summary: string | null;
  instructions: string[];
  ingredients: RecipeIngredient[];
  /** Stable identity for de-duplication across rediscoveries. */
  canonical_key: string | null;
  /** Incremented on Ate This. A proven recipe outranks an untried suggestion. */
  times_cooked: number;
  last_cooked_at: string | null;
  created_at: string;
}

export interface RankingFactors {
  nutrition_fit: number;
  inventory_fit: number;
  preference_fit: number;
  expiry_priority: number;
  time_fit: number;
  variety: number;
  feedback: number;
}

export interface MealRecommendation {
  id: string;
  household_id: string;
  /** The set this row was shown as part of. One write, one batch. */
  batch_id: string;
  recipe_id: string;
  meal_type: MealType;
  recommendation_reason: string;
  ranking_score: number;
  ranking_factors: RankingFactors;
  availability: number;
  missing: string[];
  created_at: string;
}

export interface MealLog {
  id: string;
  household_id: string;
  member_id: string;
  recipe_id: string;
  recipe_title: string;
  meal_type: MealType;
  servings: number;
  calories: number;
  protein: number;
  consumed_at: string;
  /** Groups the per-member rows created by a single "Ate this" so undo is clean. */
  batch_id: string;
}

export interface MealFeedback {
  id: string;
  household_id: string;
  member_id: string;
  recipe_id: string;
  rating: FeedbackRating;
  cuisine: string | null;
  main_ingredients: string[];
  created_at: string;
}

/**
 * Household learning signals. Persisted now so preference learning has history
 * to work from later; nothing reads them for ranking yet.
 */
export type PreferenceEvent =
  | "recommendation_seen"
  | "recommendation_selected"
  | "recipe_viewed"
  | "recipe_video_opened"
  | "external_source_opened"
  | "meal_logged"
  | "recommendation_regenerated"
  | "meal_disliked";

export interface PreferenceSignal {
  id: string;
  household_id: string;
  member_id: string | null;
  event: PreferenceEvent;
  recipe_id: string | null;
  cuisine: string | null;
  detail: Record<string, string | number | boolean | null>;
  created_at: string;
}

export interface PlanEntry {
  date: string;
  meal_type: MealType;
  kind: "recipe" | "leftovers" | "eating_out";
  recipe_id: string | null;
  recipe_title: string | null;
  note: string | null;
}

export interface WeeklyPlan {
  id: string;
  household_id: string;
  start_date: string;
  entries: PlanEntry[];
  created_at: string;
}

/** Everything the recommender needs, assembled by the household-context module. */
export interface HouseholdContext {
  meal_type: MealType;
  date: string;
  household: {
    id: string;
    name: string;
    members: {
      id: string;
      name: string;
      calorie_target: number;
      protein_target: number;
      calories_remaining: number;
      protein_remaining: number;
    }[];
  };
  preferences: {
    preferred_cuisines: string[];
    max_cooking_time_minutes: number;
    vegetarian: boolean;
    eggs_allowed: boolean;
    chicken_allowed: boolean;
    allergies: string[];
    dislikes: string[];
    spice_preference: "mild" | "medium" | "hot";
    repeat_tolerance: number;
  };
  inventory: {
    name: string;
    category: string;
    status: InventoryStatus;
    days_to_expiry: number | null;
  }[];
  recent_meals: { recipe_id: string; title: string; cuisine: string; days_ago: number }[];
  use_soon: { name: string; days_to_expiry: number }[];
  feedback: { recipe_id: string; cuisine: string | null; rating: FeedbackRating }[];
}

/**
 * Store-specific product mapping learned from corrections.
 *
 * "HERB GOAT LOG" at Trader Joe's means Herbed Goat Cheese. Once a human has
 * confirmed that, the app should never ask again — and should never spend a
 * model call on it either.
 */
export interface ProductMapping {
  id: string;
  household_id: string;
  /** Normalised merchant key, e.g. "trader joes". Null = applies to any store. */
  merchant: string | null;
  /** The raw receipt line, upper-cased and whitespace-collapsed. */
  raw_name: string;
  normalized_name: string;
  category: string | null;
  storage_location: StorageLocation | null;
  classification: Classification;
  confidence: number;
  /** Whether a human confirmed this, as opposed to it being model output. */
  source: "user_correction" | "model";
  times_seen: number;
  created_at: string;
  updated_at: string;
}

/** One row per real receipt parse, for cost and quality tracking. */
export interface ReceiptTelemetry {
  id: string;
  household_id: string;
  receipt_id: string | null;
  provider: string;
  model: string;
  latency_ms: number;
  input_tokens: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
  estimated_cost_usd: number | null;
  item_count: number;
  high_confidence_count: number;
  needs_review_count: number;
  excluded_count: number;
  /** Confidence banding across the parse, so quality is visible over time. */
  confidence_high: number;
  confidence_medium: number;
  confidence_low: number;
  mean_confidence: number | null;
  /** Lines resolved from a learned mapping rather than trusted from the model. */
  mapping_hit_count: number;
  /** Lines the model returned that failed validation and were left out. */
  dropped_item_count: number;
  /** Provider calls made, including retries. Cost scales with this. */
  attempts: number;
  success: boolean;
  error_kind: string | null;
  created_at: string;
}
