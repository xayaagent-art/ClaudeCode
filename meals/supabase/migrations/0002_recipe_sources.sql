-- Recipe discovery + recipe experience.
-- Adds the real-source fields (video, thumbnail, attribution, quality) and a
-- household preference signal log. Additive only: nothing existing changes type
-- or drops, so a database on 0001 keeps working while these stay null.

alter table recipes
  add column if not exists source_name text,
  add column if not exists video_url text,
  add column if not exists video_platform text
    check (video_platform is null or video_platform in ('youtube', 'other')),
  add column if not exists thumbnail_url text,
  add column if not exists attribution text,
  -- {score, reasons[], checked_at} — internal debugging record of why this
  -- source was chosen. Never rendered to the user as a score.
  add column if not exists source_quality jsonb,
  add column if not exists discovered_at timestamptz,
  add column if not exists cooking_summary text;

-- Lets the discovery service find recipes still missing a source cheaply.
create index if not exists recipes_discovered_at_idx on recipes (discovered_at);

alter table recipe_ingredients
  add column if not exists normalized_name text;

-- Household learning signals. Persisted only; no model reads these yet.
create table if not exists preference_signals (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  member_id uuid references household_members(id) on delete set null,
  event text not null check (event in (
    'recommendation_seen',
    'recommendation_selected',
    'recipe_viewed',
    'recipe_video_opened',
    'external_source_opened',
    'meal_logged',
    'recommendation_regenerated',
    'meal_disliked'
  )),
  recipe_id text,
  cuisine text,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists preference_signals_household_idx
  on preference_signals (household_id, created_at desc);
create index if not exists preference_signals_recipe_idx on preference_signals (recipe_id);

alter table preference_signals enable row level security;
