-- Household Meal Intelligence — initial schema.
-- Single-household MVP: every row hangs off households.id.

create extension if not exists "pgcrypto";

create table if not exists households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists household_members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name text not null,
  avatar text,
  created_at timestamptz not null default now()
);

create table if not exists nutrition_profiles (
  member_id uuid primary key references household_members(id) on delete cascade,
  calorie_target integer not null default 2000,
  protein_target integer not null default 120,
  dietary_preferences jsonb not null default '[]'::jsonb,
  allergies jsonb not null default '[]'::jsonb,
  dislikes jsonb not null default '[]'::jsonb,
  preferred_cuisines jsonb not null default '[]'::jsonb,
  max_cooking_time integer not null default 30,
  spice_preference text not null default 'medium'
    check (spice_preference in ('mild', 'medium', 'hot')),
  repeat_tolerance numeric not null default 0.3
);

create table if not exists receipts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  merchant text,
  purchase_date date,
  currency text not null default 'USD',
  subtotal numeric,
  tax numeric,
  total numeric,
  image_path text,
  processing_status text not null default 'uploaded'
    check (processing_status in
      ('uploaded', 'parsing', 'parsed', 'partially_parsed', 'failed', 'confirmed')),
  parser text check (parser in ('openai', 'fixture')),
  error_message text,
  created_at timestamptz not null default now()
);

create table if not exists receipt_items (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references receipts(id) on delete cascade,
  raw_name text not null,
  normalized_name text not null,
  quantity numeric not null default 1,
  package_size text,
  price numeric,
  category text not null default 'Other',
  storage_location text not null default 'Pantry'
    check (storage_location in ('Fridge', 'Pantry', 'Freezer', 'Produce')),
  classification text not null default 'uncertain'
    check (classification in ('human_food', 'non_food', 'pet_food', 'uncertain')),
  confidence numeric not null default 0.5,
  matched_food_id text,
  included boolean not null default true,
  notes text
);

create table if not exists inventory_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  normalized_name text not null,
  raw_name text,
  category text not null default 'Other',
  storage_location text not null default 'Pantry'
    check (storage_location in ('Fridge', 'Pantry', 'Freezer', 'Produce')),
  quantity numeric not null default 1,
  package_size text,
  status text not null default 'full' check (status in ('full', 'some', 'low', 'out')),
  purchase_date date,
  estimated_expiry date,
  nutrition_food_id text,
  nutrition_source text check (nutrition_source in
    ('known_product', 'store_product', 'usda_branded', 'usda_generic',
     'builtin_generic', 'ai_generic', 'unmatched')),
  nutrition_confidence text check (nutrition_confidence in ('high', 'medium', 'low')),
  calories_per_100g numeric,
  protein_per_100g numeric,
  serving_size text,
  confidence numeric not null default 1,
  receipt_item_id uuid references receipt_items(id) on delete set null,
  receipt_id uuid references receipts(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists inventory_items_household_idx on inventory_items (household_id);
create index if not exists inventory_items_expiry_idx on inventory_items (estimated_expiry);

-- Inventory is approximate by design, so every transition is auditable.
create table if not exists inventory_events (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  inventory_item_id uuid not null references inventory_items(id) on delete cascade,
  event_type text not null check (event_type in
    ('receipt_added', 'meal_consumed', 'manual_adjustment', 'marked_low', 'marked_out', 'undo_meal')),
  from_status text,
  to_status text,
  detail text,
  created_at timestamptz not null default now()
);

create table if not exists recipes (
  id text primary key,
  title text not null,
  description text not null default '',
  cuisine text not null default 'Other',
  image_url text,
  prep_time_minutes integer not null default 0,
  cook_time_minutes integer not null default 0,
  total_time_minutes integer not null default 0,
  servings integer not null default 2,
  calories_per_serving numeric not null default 0,
  protein_per_serving numeric not null default 0,
  dietary_tags jsonb not null default '[]'::jsonb,
  source_type text not null default 'catalog'
    check (source_type in ('catalog', 'web', 'adapted', 'generated', 'user')),
  source_url text,
  instructions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists recipe_ingredients (
  id text primary key,
  recipe_id text not null references recipes(id) on delete cascade,
  ingredient_name text not null,
  quantity numeric,
  unit text,
  optional boolean not null default false
);

create index if not exists recipe_ingredients_recipe_idx on recipe_ingredients (recipe_id);

create table if not exists meal_recommendations (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  recipe_id text not null,
  meal_type text not null default 'dinner',
  recommendation_reason text not null default '',
  ranking_score numeric not null default 0,
  ranking_factors jsonb not null default '{}'::jsonb,
  availability numeric not null default 0,
  missing jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists meal_logs (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  member_id uuid not null references household_members(id) on delete cascade,
  recipe_id text not null,
  recipe_title text not null,
  meal_type text not null default 'dinner',
  servings numeric not null default 1,
  calories numeric not null default 0,
  protein numeric not null default 0,
  consumed_at timestamptz not null default now(),
  batch_id uuid not null
);

create index if not exists meal_logs_household_time_idx on meal_logs (household_id, consumed_at desc);

create table if not exists meal_feedback (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  member_id uuid not null references household_members(id) on delete cascade,
  recipe_id text not null,
  rating text not null check (rating in ('love', 'fine', 'never')),
  cuisine text,
  main_ingredients jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists weekly_plans (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  start_date date not null,
  entries jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (household_id, start_date)
);

-- Receipt images can carry payment detail, so the bucket is private and served
-- through short-lived signed URLs only.
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

-- RLS is enabled everywhere. The MVP talks to Postgres from server routes using
-- the service role, which bypasses these policies; the policies exist so that
-- adding real auth later is a matter of adding membership checks, not a rewrite.
alter table households enable row level security;
alter table household_members enable row level security;
alter table nutrition_profiles enable row level security;
alter table receipts enable row level security;
alter table receipt_items enable row level security;
alter table inventory_items enable row level security;
alter table inventory_events enable row level security;
alter table meal_recommendations enable row level security;
alter table meal_logs enable row level security;
alter table meal_feedback enable row level security;
alter table weekly_plans enable row level security;
alter table recipes enable row level security;
alter table recipe_ingredients enable row level security;

-- Recipes are not household data; any signed-in user may read the library.
create policy "recipes readable by authenticated"
  on recipes for select to authenticated using (true);
create policy "recipe ingredients readable by authenticated"
  on recipe_ingredients for select to authenticated using (true);
