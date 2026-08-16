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
  Receipt,
  ReceiptItem,
  Recipe,
  WeeklyPlan,
} from "@/lib/types";

/**
 * The only surface the app (and the AI tool layer) uses to touch persistence.
 * Two implementations exist: Supabase (when configured) and a local file store
 * for development. Nothing else in the app may talk to a database directly.
 */
export interface Database {
  readonly kind: "supabase" | "local";

  getHousehold(): Promise<Household>;
  listMembers(): Promise<Member[]>;
  getMember(memberId: string): Promise<Member | null>;
  updateMember(memberId: string, patch: Partial<HouseholdMember>): Promise<Member>;
  updateProfile(memberId: string, patch: Partial<NutritionProfile>): Promise<Member>;

  createReceipt(input: Omit<Receipt, "id" | "created_at">): Promise<Receipt>;
  updateReceipt(receiptId: string, patch: Partial<Receipt>): Promise<Receipt>;
  getReceipt(receiptId: string): Promise<Receipt | null>;
  listReceipts(limit?: number): Promise<Receipt[]>;
  replaceReceiptItems(receiptId: string, items: Omit<ReceiptItem, "id">[]): Promise<ReceiptItem[]>;
  listReceiptItems(receiptId: string): Promise<ReceiptItem[]>;
  updateReceiptItem(itemId: string, patch: Partial<ReceiptItem>): Promise<ReceiptItem>;

  listInventory(): Promise<InventoryItem[]>;
  getInventoryItem(itemId: string): Promise<InventoryItem | null>;
  addInventoryItems(
    items: Omit<InventoryItem, "id" | "household_id" | "created_at" | "updated_at">[],
  ): Promise<InventoryItem[]>;
  updateInventoryItem(itemId: string, patch: Partial<InventoryItem>): Promise<InventoryItem>;
  deleteInventoryItem(itemId: string): Promise<void>;
  addInventoryEvent(event: Omit<InventoryEvent, "id" | "household_id" | "created_at">): Promise<void>;
  listInventoryEvents(limit?: number): Promise<InventoryEvent[]>;

  upsertRecipe(recipe: Recipe): Promise<Recipe>;
  getRecipe(recipeId: string): Promise<Recipe | null>;
  listRecipes(): Promise<Recipe[]>;

  saveRecommendations(
    recs: Omit<MealRecommendation, "id" | "household_id" | "created_at">[],
  ): Promise<MealRecommendation[]>;
  listRecommendations(limit?: number): Promise<MealRecommendation[]>;

  logMeals(logs: Omit<MealLog, "id" | "household_id">[]): Promise<MealLog[]>;
  listMealLogs(sinceISO?: string): Promise<MealLog[]>;
  deleteMealBatch(batchId: string): Promise<MealLog[]>;

  addFeedback(feedback: Omit<MealFeedback, "id" | "household_id" | "created_at">): Promise<void>;
  listFeedback(): Promise<MealFeedback[]>;

  addSignal(signal: Omit<PreferenceSignal, "id" | "household_id" | "created_at">): Promise<void>;
  listSignals(limit?: number): Promise<PreferenceSignal[]>;

  savePlan(plan: Omit<WeeklyPlan, "id" | "household_id" | "created_at">): Promise<WeeklyPlan>;
  getCurrentPlan(startDate: string): Promise<WeeklyPlan | null>;
}
