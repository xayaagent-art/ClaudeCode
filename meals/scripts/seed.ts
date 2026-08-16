/**
 * Seeds the household and a starter kitchen.
 *
 * Run with: npm run seed
 *
 * Against Supabase this upserts the household, both members and their nutrition
 * profiles, then inserts the sample inventory with expiry dates relative to
 * today (which is why inventory is seeded here rather than in seed.sql).
 * Without Supabase configured it resets the local development store instead.
 */
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { addDays, todayISO } from "../src/lib/date";
import {
  HOUSEHOLD_ID,
  seedHousehold,
  seedInventorySpecs,
  seedMembers,
} from "../src/lib/seed";

async function seedSupabase(url: string, key: string) {
  const db = createClient(url, key, { auth: { persistSession: false } });
  const today = todayISO();

  const household = await db.from("households").upsert({
    id: seedHousehold.id,
    name: seedHousehold.name,
  });
  if (household.error) throw new Error(household.error.message);

  for (const member of seedMembers) {
    const memberRow = await db.from("household_members").upsert({
      id: member.id,
      household_id: HOUSEHOLD_ID,
      name: member.name,
      avatar: member.avatar,
    });
    if (memberRow.error) throw new Error(memberRow.error.message);

    const profile = await db.from("nutrition_profiles").upsert(member.profile);
    if (profile.error) throw new Error(profile.error.message);
  }

  const existing = await db
    .from("inventory_items")
    .select("id")
    .eq("household_id", HOUSEHOLD_ID)
    .limit(1);
  if (existing.error) throw new Error(existing.error.message);

  if ((existing.data ?? []).length > 0) {
    console.log("Inventory already present — leaving it alone.");
  } else {
    const rows = seedInventorySpecs.map((spec) => ({
      id: randomUUID(),
      household_id: HOUSEHOLD_ID,
      normalized_name: spec.normalized_name,
      category: spec.category,
      storage_location: spec.storage_location,
      quantity: 1,
      package_size: spec.package_size ?? null,
      status: spec.status,
      purchase_date: addDays(today, -3),
      estimated_expiry:
        spec.expires_in_days === null ? null : addDays(today, spec.expires_in_days),
      confidence: 1,
    }));
    const inventory = await db.from("inventory_items").insert(rows);
    if (inventory.error) throw new Error(inventory.error.message);
    console.log(`Seeded ${rows.length} inventory items.`);
  }

  console.log(`Seeded ${seedHousehold.name} with ${seedMembers.map((m) => m.name).join(" and ")}.`);
}

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (url && key) {
    await seedSupabase(url, key);
    return;
  }

  const { resetLocalDatabase } = await import("../src/lib/db/local");
  await resetLocalDatabase();
  console.log("Supabase is not configured — reset the local development store instead.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
