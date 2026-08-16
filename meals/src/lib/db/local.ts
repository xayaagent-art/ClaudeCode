import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Database } from "@/lib/db/types";
import { catalogRecipes } from "@/lib/meals/catalog";
import { HOUSEHOLD_ID, seedHousehold, seedInventorySpecs, seedMembers } from "@/lib/seed";
import { addDays, todayISO } from "@/lib/date";
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
  WeeklyPlan,
} from "@/lib/types";

interface Snapshot {
  household: Household;
  members: Member[];
  receipts: Receipt[];
  receipt_items: ReceiptItem[];
  inventory: InventoryItem[];
  inventory_events: InventoryEvent[];
  recipes: Recipe[];
  recommendations: MealRecommendation[];
  meal_logs: MealLog[];
  feedback: MealFeedback[];
  plans: WeeklyPlan[];
  /** Optional so snapshots written before signals existed still load. */
  signals?: PreferenceSignal[];
  mappings?: ProductMapping[];
  telemetry?: ReceiptTelemetry[];
}

function dbPath(): string {
  if (process.env.LOCAL_DB_PATH) return process.env.LOCAL_DB_PATH;
  // Vercel's filesystem is read-only apart from /tmp.
  const base = process.env.VERCEL ? "/tmp" : process.cwd();
  return path.join(base, ".data", "meals.json");
}

function emptySnapshot(): Snapshot {
  const now = todayISO();
  const inventory: InventoryItem[] = seedInventorySpecs.map((spec) => ({
    id: randomUUID(),
    household_id: HOUSEHOLD_ID,
    normalized_name: spec.normalized_name,
    raw_name: null,
    category: spec.category,
    storage_location: spec.storage_location,
    quantity: 1,
    package_size: spec.package_size ?? null,
    status: spec.status,
    purchase_date: addDays(now, -3),
    estimated_expiry: spec.expires_in_days === null ? null : addDays(now, spec.expires_in_days),
    nutrition_food_id: null,
    nutrition_source: null,
    nutrition_confidence: null,
    calories_per_100g: null,
    protein_per_100g: null,
    serving_size: null,
    confidence: 1,
    receipt_item_id: null,
    receipt_id: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }));

  return {
    household: seedHousehold,
    members: structuredClone(seedMembers),
    receipts: [],
    receipt_items: [],
    inventory,
    inventory_events: [],
    recipes: [],
    recommendations: [],
    meal_logs: [],
    feedback: [],
    plans: [],
    signals: [],
    mappings: [],
    telemetry: [],
  };
}

/**
 * File-backed development store. Reads are served from an in-process cache and
 * every mutation is written through, so `next dev` and the test runner see the
 * same data across requests.
 */
class LocalDatabase implements Database {
  readonly kind = "local" as const;
  private cache: Snapshot | null = null;
  private cachedMtimeMs = 0;
  private writeQueue: Promise<void> = Promise.resolve();

  /**
   * The file on disk is the source of truth, not the cache.
   *
   * `next dev` serves server components and route handlers from separate
   * workers, each with its own module instance. A cache that never revalidated
   * would let a page render inventory that a route handler had already changed,
   * so the snapshot is re-read whenever the file's mtime moves.
   */
  private async load(): Promise<Snapshot> {
    const target = dbPath();
    try {
      const stat = await fs.stat(/* turbopackIgnore: true */ target);
      if (this.cache && stat.mtimeMs === this.cachedMtimeMs) return this.cache;

      const raw = await fs.readFile(/* turbopackIgnore: true */ target, "utf8");
      this.cache = JSON.parse(raw) as Snapshot;
      this.cachedMtimeMs = stat.mtimeMs;
    } catch {
      // No file yet (or it is unreadable) — start from the seeded snapshot.
      this.cache = emptySnapshot();
      await this.flush();
    }
    return this.cache!;
  }

  private async flush(): Promise<void> {
    const snapshot = this.cache;
    if (!snapshot) return;
    const target = dbPath();
    this.writeQueue = this.writeQueue.then(async () => {
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(/* turbopackIgnore: true */ target, JSON.stringify(snapshot, null, 2), "utf8");
      const stat = await fs.stat(/* turbopackIgnore: true */ target);
      this.cachedMtimeMs = stat.mtimeMs;
    });
    await this.writeQueue;
  }

  private async mutate<T>(fn: (s: Snapshot) => T): Promise<T> {
    const snapshot = await this.load();
    const result = fn(snapshot);
    await this.flush();
    return result;
  }

  async reset(): Promise<void> {
    this.cache = emptySnapshot();
    this.cachedMtimeMs = 0;
    await this.flush();
  }

  async getHousehold(): Promise<Household> {
    return (await this.load()).household;
  }

  async listMembers(): Promise<Member[]> {
    return structuredClone((await this.load()).members);
  }

  async getMember(memberId: string): Promise<Member | null> {
    return (await this.listMembers()).find((m) => m.id === memberId) ?? null;
  }

  async updateMember(memberId: string, patch: Partial<HouseholdMember>): Promise<Member> {
    return this.mutate((s) => {
      const member = s.members.find((m) => m.id === memberId);
      if (!member) throw new Error(`Unknown member ${memberId}`);
      Object.assign(member, { name: patch.name ?? member.name, avatar: patch.avatar ?? member.avatar });
      return structuredClone(member);
    });
  }

  async updateProfile(memberId: string, patch: Partial<NutritionProfile>): Promise<Member> {
    return this.mutate((s) => {
      const member = s.members.find((m) => m.id === memberId);
      if (!member) throw new Error(`Unknown member ${memberId}`);
      member.profile = { ...member.profile, ...patch, member_id: memberId };
      return structuredClone(member);
    });
  }

  async createReceipt(input: Omit<Receipt, "id" | "created_at">): Promise<Receipt> {
    return this.mutate((s) => {
      const receipt: Receipt = { ...input, id: randomUUID(), created_at: new Date().toISOString() };
      s.receipts.unshift(receipt);
      return receipt;
    });
  }

  async updateReceipt(receiptId: string, patch: Partial<Receipt>): Promise<Receipt> {
    return this.mutate((s) => {
      const receipt = s.receipts.find((r) => r.id === receiptId);
      if (!receipt) throw new Error(`Unknown receipt ${receiptId}`);
      Object.assign(receipt, patch);
      return structuredClone(receipt);
    });
  }

  async getReceipt(receiptId: string): Promise<Receipt | null> {
    return (await this.load()).receipts.find((r) => r.id === receiptId) ?? null;
  }

  async listReceipts(limit = 20): Promise<Receipt[]> {
    return (await this.load()).receipts.slice(0, limit);
  }

  async replaceReceiptItems(
    receiptId: string,
    items: Omit<ReceiptItem, "id">[],
  ): Promise<ReceiptItem[]> {
    return this.mutate((s) => {
      s.receipt_items = s.receipt_items.filter((i) => i.receipt_id !== receiptId);
      const created = items.map((item) => ({ ...item, id: randomUUID() }));
      s.receipt_items.push(...created);
      return structuredClone(created);
    });
  }

  async listReceiptItems(receiptId: string): Promise<ReceiptItem[]> {
    return structuredClone((await this.load()).receipt_items.filter((i) => i.receipt_id === receiptId));
  }

  async updateReceiptItem(itemId: string, patch: Partial<ReceiptItem>): Promise<ReceiptItem> {
    return this.mutate((s) => {
      const item = s.receipt_items.find((i) => i.id === itemId);
      if (!item) throw new Error(`Unknown receipt item ${itemId}`);
      Object.assign(item, patch);
      return structuredClone(item);
    });
  }

  async listInventory(): Promise<InventoryItem[]> {
    return structuredClone((await this.load()).inventory);
  }

  async getInventoryItem(itemId: string): Promise<InventoryItem | null> {
    return (await this.listInventory()).find((i) => i.id === itemId) ?? null;
  }

  async addInventoryItems(
    items: Omit<InventoryItem, "id" | "household_id" | "created_at" | "updated_at">[],
  ): Promise<InventoryItem[]> {
    return this.mutate((s) => {
      const now = new Date().toISOString();
      const created = items.map((item) => ({
        ...item,
        id: randomUUID(),
        household_id: HOUSEHOLD_ID,
        created_at: now,
        updated_at: now,
      }));
      s.inventory.push(...created);
      return structuredClone(created);
    });
  }

  async updateInventoryItem(itemId: string, patch: Partial<InventoryItem>): Promise<InventoryItem> {
    return this.mutate((s) => {
      const item = s.inventory.find((i) => i.id === itemId);
      if (!item) throw new Error(`Unknown inventory item ${itemId}`);
      Object.assign(item, patch, { updated_at: new Date().toISOString() });
      return structuredClone(item);
    });
  }

  async deleteInventoryItem(itemId: string): Promise<void> {
    await this.mutate((s) => {
      s.inventory = s.inventory.filter((i) => i.id !== itemId);
    });
  }

  async addInventoryEvent(
    event: Omit<InventoryEvent, "id" | "household_id" | "created_at">,
  ): Promise<void> {
    await this.mutate((s) => {
      s.inventory_events.unshift({
        ...event,
        id: randomUUID(),
        household_id: HOUSEHOLD_ID,
        created_at: new Date().toISOString(),
      });
    });
  }

  async listInventoryEvents(limit = 100): Promise<InventoryEvent[]> {
    return (await this.load()).inventory_events.slice(0, limit);
  }

  async upsertRecipe(recipe: Recipe): Promise<Recipe> {
    return this.mutate((s) => {
      const index = s.recipes.findIndex((r) => r.id === recipe.id);
      if (index >= 0) s.recipes[index] = recipe;
      else s.recipes.push(recipe);
      return recipe;
    });
  }

  async getRecipe(recipeId: string): Promise<Recipe | null> {
    const stored = (await this.load()).recipes.find((r) => r.id === recipeId);
    if (stored) return structuredClone(stored);
    return catalogRecipes.find((r) => r.id === recipeId) ?? null;
  }

  async listRecipes(): Promise<Recipe[]> {
    const stored = (await this.load()).recipes;
    const storedIds = new Set(stored.map((r) => r.id));
    return [...catalogRecipes.filter((r) => !storedIds.has(r.id)), ...structuredClone(stored)];
  }

  async saveRecommendations(
    recs: Omit<MealRecommendation, "id" | "household_id" | "created_at">[],
  ): Promise<MealRecommendation[]> {
    return this.mutate((s) => {
      const created = recs.map((rec) => ({
        ...rec,
        id: randomUUID(),
        household_id: HOUSEHOLD_ID,
        created_at: new Date().toISOString(),
      }));
      s.recommendations.unshift(...created);
      s.recommendations = s.recommendations.slice(0, 200);
      return structuredClone(created);
    });
  }

  async listRecommendations(limit = 12): Promise<MealRecommendation[]> {
    return structuredClone((await this.load()).recommendations.slice(0, limit));
  }

  async logMeals(logs: Omit<MealLog, "id" | "household_id">[]): Promise<MealLog[]> {
    return this.mutate((s) => {
      const created = logs.map((log) => ({ ...log, id: randomUUID(), household_id: HOUSEHOLD_ID }));
      s.meal_logs.unshift(...created);
      return structuredClone(created);
    });
  }

  async listMealLogs(sinceISO?: string): Promise<MealLog[]> {
    const logs = (await this.load()).meal_logs;
    const filtered = sinceISO ? logs.filter((l) => l.consumed_at >= sinceISO) : logs;
    return structuredClone(filtered);
  }

  async deleteMealBatch(batchId: string): Promise<MealLog[]> {
    return this.mutate((s) => {
      const removed = s.meal_logs.filter((l) => l.batch_id === batchId);
      s.meal_logs = s.meal_logs.filter((l) => l.batch_id !== batchId);
      return structuredClone(removed);
    });
  }

  async addFeedback(
    feedback: Omit<MealFeedback, "id" | "household_id" | "created_at">,
  ): Promise<void> {
    await this.mutate((s) => {
      s.feedback.unshift({
        ...feedback,
        id: randomUUID(),
        household_id: HOUSEHOLD_ID,
        created_at: new Date().toISOString(),
      });
    });
  }

  async listFeedback(): Promise<MealFeedback[]> {
    return structuredClone((await this.load()).feedback);
  }

  async addSignal(
    signal: Omit<PreferenceSignal, "id" | "household_id" | "created_at">,
  ): Promise<void> {
    await this.mutate((s) => {
      s.signals ??= [];
      s.signals.unshift({
        ...signal,
        id: randomUUID(),
        household_id: HOUSEHOLD_ID,
        created_at: new Date().toISOString(),
      });
      s.signals = s.signals.slice(0, 500);
    });
  }

  async listSignals(limit = 100): Promise<PreferenceSignal[]> {
    return structuredClone(((await this.load()).signals ?? []).slice(0, limit));
  }

  async listMappings(): Promise<ProductMapping[]> {
    return structuredClone((await this.load()).mappings ?? []);
  }

  async upsertMapping(
    mapping: Omit<ProductMapping, "id" | "household_id" | "created_at" | "updated_at" | "times_seen">,
  ): Promise<ProductMapping> {
    return this.mutate((s) => {
      s.mappings ??= [];
      const now = new Date().toISOString();
      const existing = s.mappings.find(
        (m) => m.merchant === mapping.merchant && m.raw_name === mapping.raw_name,
      );
      if (existing) {
        Object.assign(existing, mapping, {
          times_seen: existing.times_seen + 1,
          updated_at: now,
        });
        return structuredClone(existing);
      }
      const created: ProductMapping = {
        ...mapping,
        id: randomUUID(),
        household_id: HOUSEHOLD_ID,
        times_seen: 1,
        created_at: now,
        updated_at: now,
      };
      s.mappings.push(created);
      return structuredClone(created);
    });
  }

  async addTelemetry(
    entry: Omit<ReceiptTelemetry, "id" | "household_id" | "created_at">,
  ): Promise<void> {
    await this.mutate((s) => {
      s.telemetry ??= [];
      s.telemetry.unshift({
        ...entry,
        id: randomUUID(),
        household_id: HOUSEHOLD_ID,
        created_at: new Date().toISOString(),
      });
      s.telemetry = s.telemetry.slice(0, 200);
    });
  }

  async listTelemetry(limit = 50): Promise<ReceiptTelemetry[]> {
    return structuredClone(((await this.load()).telemetry ?? []).slice(0, limit));
  }

  async findReceiptByHash(imageHash: string): Promise<Receipt | null> {
    return (await this.load()).receipts.find((r) => r.image_hash === imageHash) ?? null;
  }

  async savePlan(plan: Omit<WeeklyPlan, "id" | "household_id" | "created_at">): Promise<WeeklyPlan> {
    return this.mutate((s) => {
      const created: WeeklyPlan = {
        ...plan,
        id: randomUUID(),
        household_id: HOUSEHOLD_ID,
        created_at: new Date().toISOString(),
      };
      s.plans = s.plans.filter((p) => p.start_date !== plan.start_date);
      s.plans.unshift(created);
      return created;
    });
  }

  async getCurrentPlan(startDate: string): Promise<WeeklyPlan | null> {
    return (await this.load()).plans.find((p) => p.start_date === startDate) ?? null;
  }
}

let instance: LocalDatabase | null = null;

export function localDatabase(): LocalDatabase {
  if (!instance) instance = new LocalDatabase();
  return instance;
}

/** Test helper: drop the cached snapshot and re-seed. */
export async function resetLocalDatabase(): Promise<void> {
  await localDatabase().reset();
}
