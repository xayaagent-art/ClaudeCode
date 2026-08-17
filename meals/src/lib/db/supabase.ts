import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import type { Database } from "@/lib/db/types";
import { catalogRecipes } from "@/lib/meals/catalog";
import { HOUSEHOLD_ID } from "@/lib/seed";
import type {
  Household,
  HouseholdMember,
  InventoryEvent,
  InventoryItem,
  MealFeedback,
  MealLog,
  MealRecommendation,
  Member,
  NutritionProfile,
  PreferenceSignal,
  ProductMapping,
  ReceiptTelemetry,
  Receipt,
  ReceiptItem,
  Recipe,
  RecipeIngredient,
  WeeklyPlan,
} from "@/lib/types";

/**
 * Supabase adapter. Runs server-side only and uses the service-role key, which
 * is why nothing in this file may ever be imported from a client component.
 */

export function supabaseConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

let client: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient {
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("Supabase is not configured");
    client = createClient(url, key, { auth: { persistSession: false } });
  }
  return client;
}

function unwrap<T>(result: { data: T | null; error: { message: string } | null }, what: string): T {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
  if (result.data === null) throw new Error(`${what}: no data returned`);
  return result.data;
}

type Row = Record<string, unknown>;

function toMember(memberRow: Row, profileRow: Row | undefined): Member {
  const profile: NutritionProfile = {
    member_id: memberRow.id as string,
    calorie_target: Number(profileRow?.calorie_target ?? 2000),
    protein_target: Number(profileRow?.protein_target ?? 120),
    dietary_preferences: (profileRow?.dietary_preferences as string[]) ?? [],
    allergies: (profileRow?.allergies as string[]) ?? [],
    dislikes: (profileRow?.dislikes as string[]) ?? [],
    preferred_cuisines: (profileRow?.preferred_cuisines as string[]) ?? [],
    max_cooking_time: Number(profileRow?.max_cooking_time ?? 30),
    spice_preference: (profileRow?.spice_preference as NutritionProfile["spice_preference"]) ?? "medium",
    repeat_tolerance: Number(profileRow?.repeat_tolerance ?? 0.3),
  };
  return {
    id: memberRow.id as string,
    household_id: memberRow.household_id as string,
    name: memberRow.name as string,
    avatar: (memberRow.avatar as string | null) ?? null,
    created_at: memberRow.created_at as string,
    profile,
  };
}

function toRecipe(row: Row, ingredients: RecipeIngredient[]): Recipe {
  return {
    id: row.id as string,
    title: row.title as string,
    description: (row.description as string) ?? "",
    cuisine: (row.cuisine as string) ?? "Other",
    image_url: (row.image_url as string | null) ?? null,
    prep_time_minutes: Number(row.prep_time_minutes ?? 0),
    cook_time_minutes: Number(row.cook_time_minutes ?? 0),
    total_time_minutes: Number(row.total_time_minutes ?? 0),
    servings: Number(row.servings ?? 2),
    calories_per_serving: Number(row.calories_per_serving ?? 0),
    protein_per_serving: Number(row.protein_per_serving ?? 0),
    dietary_tags: (row.dietary_tags as string[]) ?? [],
    source_type: row.source_type as Recipe["source_type"],
    source_url: (row.source_url as string | null) ?? null,
    source_name: (row.source_name as string | null) ?? null,
    video_url: (row.video_url as string | null) ?? null,
    video_platform: (row.video_platform as Recipe["video_platform"]) ?? null,
    thumbnail_url: (row.thumbnail_url as string | null) ?? null,
    attribution: (row.attribution as string | null) ?? null,
    source_quality: (row.source_quality as Recipe["source_quality"]) ?? null,
    discovered_at: (row.discovered_at as string | null) ?? null,
    cooking_summary: (row.cooking_summary as string | null) ?? null,
    instructions: (row.instructions as string[]) ?? [],
    ingredients,
    canonical_key: (row.canonical_key as string | null) ?? null,
    times_cooked: Number(row.times_cooked ?? 0),
    last_cooked_at: (row.last_cooked_at as string | null) ?? null,
    created_at: row.created_at as string,
  };
}

class SupabaseDatabase implements Database {
  readonly kind = "supabase" as const;
  private readonly db = supabaseAdmin();

  async getHousehold(): Promise<Household> {
    const data = unwrap(
      await this.db.from("households").select("*").eq("id", HOUSEHOLD_ID).single(),
      "load household",
    );
    return data as unknown as Household;
  }

  async listMembers(): Promise<Member[]> {
    const members = unwrap(
      await this.db
        .from("household_members")
        .select("*")
        .eq("household_id", HOUSEHOLD_ID)
        .order("created_at"),
      "list members",
    ) as Row[];
    const profiles = unwrap(
      await this.db.from("nutrition_profiles").select("*"),
      "list profiles",
    ) as Row[];
    return members.map((m) => toMember(m, profiles.find((p) => p.member_id === m.id)));
  }

  async getMember(memberId: string): Promise<Member | null> {
    return (await this.listMembers()).find((m) => m.id === memberId) ?? null;
  }

  async updateMember(memberId: string, patch: Partial<HouseholdMember>): Promise<Member> {
    unwrap(
      await this.db.from("household_members").update(patch).eq("id", memberId).select().single(),
      "update member",
    );
    const member = await this.getMember(memberId);
    if (!member) throw new Error(`Unknown member ${memberId}`);
    return member;
  }

  async updateProfile(memberId: string, patch: Partial<NutritionProfile>): Promise<Member> {
    unwrap(
      await this.db
        .from("nutrition_profiles")
        .upsert({ ...patch, member_id: memberId })
        .select()
        .single(),
      "update profile",
    );
    const member = await this.getMember(memberId);
    if (!member) throw new Error(`Unknown member ${memberId}`);
    return member;
  }

  async createReceipt(input: Omit<Receipt, "id" | "created_at">): Promise<Receipt> {
    return unwrap(
      await this.db.from("receipts").insert(input).select().single(),
      "create receipt",
    ) as unknown as Receipt;
  }

  async updateReceipt(receiptId: string, patch: Partial<Receipt>): Promise<Receipt> {
    return unwrap(
      await this.db.from("receipts").update(patch).eq("id", receiptId).select().single(),
      "update receipt",
    ) as unknown as Receipt;
  }

  async getReceipt(receiptId: string): Promise<Receipt | null> {
    const { data } = await this.db.from("receipts").select("*").eq("id", receiptId).maybeSingle();
    return (data as unknown as Receipt) ?? null;
  }

  async listReceipts(limit = 20): Promise<Receipt[]> {
    return unwrap(
      await this.db
        .from("receipts")
        .select("*")
        .eq("household_id", HOUSEHOLD_ID)
        .order("created_at", { ascending: false })
        .limit(limit),
      "list receipts",
    ) as unknown as Receipt[];
  }

  async replaceReceiptItems(
    receiptId: string,
    items: Omit<ReceiptItem, "id">[],
  ): Promise<ReceiptItem[]> {
    const del = await this.db.from("receipt_items").delete().eq("receipt_id", receiptId);
    if (del.error) throw new Error(`clear receipt items: ${del.error.message}`);
    if (items.length === 0) return [];
    return unwrap(
      await this.db.from("receipt_items").insert(items).select(),
      "insert receipt items",
    ) as unknown as ReceiptItem[];
  }

  async listReceiptItems(receiptId: string): Promise<ReceiptItem[]> {
    return unwrap(
      await this.db.from("receipt_items").select("*").eq("receipt_id", receiptId),
      "list receipt items",
    ) as unknown as ReceiptItem[];
  }

  async updateReceiptItem(itemId: string, patch: Partial<ReceiptItem>): Promise<ReceiptItem> {
    return unwrap(
      await this.db.from("receipt_items").update(patch).eq("id", itemId).select().single(),
      "update receipt item",
    ) as unknown as ReceiptItem;
  }

  async listInventory(): Promise<InventoryItem[]> {
    return unwrap(
      await this.db
        .from("inventory_items")
        .select("*")
        .eq("household_id", HOUSEHOLD_ID)
        .order("created_at", { ascending: false }),
      "list inventory",
    ) as unknown as InventoryItem[];
  }

  async getInventoryItem(itemId: string): Promise<InventoryItem | null> {
    const { data } = await this.db.from("inventory_items").select("*").eq("id", itemId).maybeSingle();
    return (data as unknown as InventoryItem) ?? null;
  }

  async addInventoryItems(
    items: Omit<InventoryItem, "id" | "household_id" | "created_at" | "updated_at">[],
  ): Promise<InventoryItem[]> {
    if (items.length === 0) return [];
    const rows = items.map((item) => ({ ...item, household_id: HOUSEHOLD_ID }));
    return unwrap(
      await this.db.from("inventory_items").insert(rows).select(),
      "add inventory items",
    ) as unknown as InventoryItem[];
  }

  async updateInventoryItem(itemId: string, patch: Partial<InventoryItem>): Promise<InventoryItem> {
    return unwrap(
      await this.db
        .from("inventory_items")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", itemId)
        .select()
        .single(),
      "update inventory item",
    ) as unknown as InventoryItem;
  }

  async deleteInventoryItem(itemId: string): Promise<void> {
    const { error } = await this.db.from("inventory_items").delete().eq("id", itemId);
    if (error) throw new Error(`delete inventory item: ${error.message}`);
  }

  async addInventoryEvent(
    event: Omit<InventoryEvent, "id" | "household_id" | "created_at">,
  ): Promise<void> {
    const { error } = await this.db
      .from("inventory_events")
      .insert({ ...event, household_id: HOUSEHOLD_ID });
    if (error) throw new Error(`add inventory event: ${error.message}`);
  }

  async listInventoryEvents(limit = 100): Promise<InventoryEvent[]> {
    return unwrap(
      await this.db
        .from("inventory_events")
        .select("*")
        .eq("household_id", HOUSEHOLD_ID)
        .order("created_at", { ascending: false })
        .limit(limit),
      "list inventory events",
    ) as unknown as InventoryEvent[];
  }

  async upsertRecipe(recipe: Recipe): Promise<Recipe> {
    const { ingredients, ...row } = recipe;
    const up = await this.db.from("recipes").upsert(row);
    if (up.error) throw new Error(`upsert recipe: ${up.error.message}`);
    await this.db.from("recipe_ingredients").delete().eq("recipe_id", recipe.id);
    if (ingredients.length > 0) {
      const ing = await this.db.from("recipe_ingredients").insert(
        ingredients.map(({ inventory_item_id: _ignored, ...rest }) => rest),
      );
      if (ing.error) throw new Error(`upsert recipe ingredients: ${ing.error.message}`);
    }
    return recipe;
  }

  async getRecipe(recipeId: string): Promise<Recipe | null> {
    const { data } = await this.db.from("recipes").select("*").eq("id", recipeId).maybeSingle();
    if (!data) return catalogRecipes.find((r) => r.id === recipeId) ?? null;
    const ingredients = unwrap(
      await this.db.from("recipe_ingredients").select("*").eq("recipe_id", recipeId),
      "load recipe ingredients",
    ) as unknown as RecipeIngredient[];
    return toRecipe(data as Row, ingredients);
  }

  async listRecipes(): Promise<Recipe[]> {
    const rows = (unwrap(await this.db.from("recipes").select("*"), "list recipes") ?? []) as Row[];
    const ingredients = (unwrap(
      await this.db.from("recipe_ingredients").select("*"),
      "list recipe ingredients",
    ) ?? []) as unknown as RecipeIngredient[];
    const stored = rows.map((row) =>
      toRecipe(
        row,
        ingredients.filter((i) => i.recipe_id === row.id),
      ),
    );
    const storedIds = new Set(stored.map((r) => r.id));
    return [...catalogRecipes.filter((r) => !storedIds.has(r.id)), ...stored];
  }

  async saveRecommendations(
    recs: Omit<MealRecommendation, "id" | "household_id" | "created_at">[],
  ): Promise<MealRecommendation[]> {
    if (recs.length === 0) return [];
    const rows = recs.map((rec) => ({ ...rec, household_id: HOUSEHOLD_ID }));
    return unwrap(
      await this.db.from("meal_recommendations").insert(rows).select(),
      "save recommendations",
    ) as unknown as MealRecommendation[];
  }

  async listRecommendations(limit = 12): Promise<MealRecommendation[]> {
    return unwrap(
      await this.db
        .from("meal_recommendations")
        .select("*")
        .eq("household_id", HOUSEHOLD_ID)
        .order("created_at", { ascending: false })
        .limit(limit),
      "list recommendations",
    ) as unknown as MealRecommendation[];
  }

  async logMeals(logs: Omit<MealLog, "id" | "household_id">[]): Promise<MealLog[]> {
    if (logs.length === 0) return [];
    const rows = logs.map((log) => ({ ...log, household_id: HOUSEHOLD_ID }));
    return unwrap(await this.db.from("meal_logs").insert(rows).select(), "log meals") as unknown as MealLog[];
  }

  async listMealLogs(sinceISO?: string): Promise<MealLog[]> {
    let query = this.db
      .from("meal_logs")
      .select("*")
      .eq("household_id", HOUSEHOLD_ID)
      .order("consumed_at", { ascending: false });
    if (sinceISO) query = query.gte("consumed_at", sinceISO);
    return unwrap(await query, "list meal logs") as unknown as MealLog[];
  }

  async deleteMealBatch(batchId: string): Promise<MealLog[]> {
    return unwrap(
      await this.db.from("meal_logs").delete().eq("batch_id", batchId).select(),
      "delete meal batch",
    ) as unknown as MealLog[];
  }

  async addFeedback(
    feedback: Omit<MealFeedback, "id" | "household_id" | "created_at">,
  ): Promise<void> {
    const { error } = await this.db
      .from("meal_feedback")
      .insert({ ...feedback, household_id: HOUSEHOLD_ID });
    if (error) throw new Error(`add feedback: ${error.message}`);
  }

  async listFeedback(): Promise<MealFeedback[]> {
    return unwrap(
      await this.db
        .from("meal_feedback")
        .select("*")
        .eq("household_id", HOUSEHOLD_ID)
        .order("created_at", { ascending: false }),
      "list feedback",
    ) as unknown as MealFeedback[];
  }

  async addSignal(
    signal: Omit<PreferenceSignal, "id" | "household_id" | "created_at">,
  ): Promise<void> {
    const { error } = await this.db
      .from("preference_signals")
      .insert({ ...signal, household_id: HOUSEHOLD_ID });
    // Signals are telemetry, not state — a failure must never break the flow.
    if (error) console.error("[signals] insert failed:", error.message);
  }

  async listSignals(limit = 100): Promise<PreferenceSignal[]> {
    return unwrap(
      await this.db
        .from("preference_signals")
        .select("*")
        .eq("household_id", HOUSEHOLD_ID)
        .order("created_at", { ascending: false })
        .limit(limit),
      "list signals",
    ) as unknown as PreferenceSignal[];
  }

  async listMappings(): Promise<ProductMapping[]> {
    return unwrap(
      await this.db.from("product_mappings").select("*").eq("household_id", HOUSEHOLD_ID),
      "list product mappings",
    ) as unknown as ProductMapping[];
  }

  async upsertMapping(
    mapping: Omit<ProductMapping, "id" | "household_id" | "created_at" | "updated_at" | "times_seen">,
  ): Promise<ProductMapping> {
    // times_seen is incremented by the on-conflict trigger in migration 0003, so
    // repeated corrections strengthen a mapping instead of resetting it.
    const { data, error } = await this.db.rpc("upsert_product_mapping", {
      p_household_id: HOUSEHOLD_ID,
      p_merchant: mapping.merchant,
      p_raw_name: mapping.raw_name,
      p_normalized_name: mapping.normalized_name,
      p_category: mapping.category,
      p_storage_location: mapping.storage_location,
      p_classification: mapping.classification,
      p_confidence: mapping.confidence,
      p_source: mapping.source,
    });
    if (error) throw new Error(`upsert product mapping: ${error.message}`);
    return data as unknown as ProductMapping;
  }

  async addTelemetry(
    entry: Omit<ReceiptTelemetry, "id" | "household_id" | "created_at">,
  ): Promise<void> {
    const { error } = await this.db
      .from("receipt_telemetry")
      .insert({ ...entry, household_id: HOUSEHOLD_ID });
    // Telemetry must never break a receipt import.
    if (error) console.error("[telemetry] insert failed:", error.message);
  }

  async listTelemetry(limit = 50): Promise<ReceiptTelemetry[]> {
    return unwrap(
      await this.db
        .from("receipt_telemetry")
        .select("*")
        .eq("household_id", HOUSEHOLD_ID)
        .order("created_at", { ascending: false })
        .limit(limit),
      "list telemetry",
    ) as unknown as ReceiptTelemetry[];
  }

  async findReceiptByHash(imageHash: string): Promise<Receipt | null> {
    const { data } = await this.db
      .from("receipts")
      .select("*")
      .eq("household_id", HOUSEHOLD_ID)
      .eq("image_hash", imageHash)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return (data as unknown as Receipt) ?? null;
  }

  async savePlan(plan: Omit<WeeklyPlan, "id" | "household_id" | "created_at">): Promise<WeeklyPlan> {
    return unwrap(
      await this.db
        .from("weekly_plans")
        .upsert({ ...plan, id: randomUUID(), household_id: HOUSEHOLD_ID }, {
          onConflict: "household_id,start_date",
        })
        .select()
        .single(),
      "save plan",
    ) as unknown as WeeklyPlan;
  }

  async getCurrentPlan(startDate: string): Promise<WeeklyPlan | null> {
    const { data } = await this.db
      .from("weekly_plans")
      .select("*")
      .eq("household_id", HOUSEHOLD_ID)
      .eq("start_date", startDate)
      .maybeSingle();
    return (data as unknown as WeeklyPlan) ?? null;
  }
}

let dbInstance: SupabaseDatabase | null = null;

export function supabaseDatabase(): Database {
  if (!dbInstance) dbInstance = new SupabaseDatabase();
  return dbInstance;
}
