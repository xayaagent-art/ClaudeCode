-- Seed the Mehta household. Safe to re-run.
-- Inventory seeding lives in scripts/seed.ts so expiry dates stay relative to today.

insert into households (id, name)
values ('11111111-1111-4111-8111-111111111111', 'Mehta Household')
on conflict (id) do update set name = excluded.name;

insert into household_members (id, household_id, name)
values
  ('22222222-2222-4222-8222-222222222221', '11111111-1111-4111-8111-111111111111', 'Yash'),
  ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111', 'Survi')
on conflict (id) do update set name = excluded.name;

insert into nutrition_profiles (
  member_id, calorie_target, protein_target, dietary_preferences,
  allergies, dislikes, preferred_cuisines, max_cooking_time, spice_preference, repeat_tolerance
)
values
  (
    '22222222-2222-4222-8222-222222222221', 2100, 150,
    '["vegetarian","eggs","occasional_chicken"]'::jsonb,
    '[]'::jsonb, '["beets"]'::jsonb,
    '["Indian","Mediterranean","Greek","Mexican"]'::jsonb, 30, 'medium', 0.3
  ),
  (
    '22222222-2222-4222-8222-222222222222', 1650, 100,
    '["vegetarian","eggs"]'::jsonb,
    '[]'::jsonb, '["olives"]'::jsonb,
    '["Indian","Mediterranean","Greek"]'::jsonb, 35, 'mild', 0.4
  )
on conflict (member_id) do update set
  calorie_target = excluded.calorie_target,
  protein_target = excluded.protein_target,
  dietary_preferences = excluded.dietary_preferences,
  preferred_cuisines = excluded.preferred_cuisines,
  max_cooking_time = excluded.max_cooking_time,
  spice_preference = excluded.spice_preference,
  repeat_tolerance = excluded.repeat_tolerance;
