import { z } from "zod";
import { getDb } from "@/lib/db";
import { fail, handle, readJson } from "@/lib/http";
import { supabaseConfigured } from "@/lib/db/supabase";
import { activeParser } from "@/lib/receipt/parse";

export const runtime = "nodejs";

export async function GET() {
  return handle(async () => {
    const db = getDb();
    const [household, members] = await Promise.all([db.getHousehold(), db.listMembers()]);
    return {
      household,
      members,
      config: {
        storage: supabaseConfigured() ? "supabase" : "local",
        receipt_parser: activeParser(),
        nutrition_source: process.env.FDC_API_KEY ? "usda" : "builtin",
      },
    };
  });
}

const patchSchema = z.object({
  member_id: z.string().min(1),
  name: z.string().min(1).max(40).optional(),
  profile: z
    .object({
      calorie_target: z.number().int().min(800).max(6000).optional(),
      protein_target: z.number().int().min(20).max(400).optional(),
      dietary_preferences: z.array(z.string().max(40)).max(20).optional(),
      allergies: z.array(z.string().max(40)).max(20).optional(),
      dislikes: z.array(z.string().max(40)).max(30).optional(),
      preferred_cuisines: z.array(z.string().max(40)).max(20).optional(),
      max_cooking_time: z.number().int().min(5).max(180).optional(),
      spice_preference: z.enum(["mild", "medium", "hot"]).optional(),
      repeat_tolerance: z.number().min(0).max(1).optional(),
    })
    .optional(),
});

export async function PATCH(request: Request) {
  const parsed = patchSchema.safeParse(await readJson<unknown>(request));
  if (!parsed.success) return fail("Those settings aren't valid.", 400);

  return handle(async () => {
    const db = getDb();
    if (parsed.data.name) await db.updateMember(parsed.data.member_id, { name: parsed.data.name });
    if (parsed.data.profile) {
      return db.updateProfile(parsed.data.member_id, parsed.data.profile);
    }
    return db.getMember(parsed.data.member_id);
  });
}
