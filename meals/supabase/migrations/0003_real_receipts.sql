-- Real receipt intelligence.
--
-- Additive only. Nothing is dropped, no column changes type, and every statement
-- is idempotent, so this is safe to re-run and safe against existing data.
-- Requires 0001_init.sql; independent of 0002_recipe_sources.sql.

-- --------------------------------------------------------------------------
-- Receipts: image identity + price detail
-- --------------------------------------------------------------------------

-- sha256 of the uploaded bytes. Lets a re-upload of the same photo be
-- recognised before a model call is made.
alter table receipts
  add column if not exists image_hash text;

create index if not exists receipts_image_hash_idx on receipts (household_id, image_hash);

-- 0001 stored a single `price`. That column keeps its meaning (line total) so
-- existing rows stay correct; unit_price is new and nullable.
alter table receipt_items
  add column if not exists unit_price numeric;

comment on column receipt_items.price is 'Line total charged. See unit_price for per-unit.';

-- --------------------------------------------------------------------------
-- Store-specific product mappings
-- --------------------------------------------------------------------------
-- "HERB GOAT LOG" at Trader Joe's means Herbed Goat Cheese. Learned from user
-- corrections and reused on later receipts, which avoids both the model call and
-- asking the same question twice. merchant is null for store-agnostic mappings.

create table if not exists product_mappings (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  merchant text,
  raw_name text not null,
  normalized_name text not null,
  category text,
  storage_location text
    check (storage_location is null or storage_location in ('Fridge', 'Pantry', 'Freezer', 'Produce')),
  classification text not null default 'human_food'
    check (classification in ('human_food', 'non_food', 'pet_food', 'uncertain')),
  confidence numeric not null default 1,
  source text not null default 'user_correction'
    check (source in ('user_correction', 'model')),
  times_seen integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One mapping per (household, merchant, raw line). Postgres treats NULLs as
-- distinct in unique indexes, so store-agnostic rows need their own index.
create unique index if not exists product_mappings_scoped_key
  on product_mappings (household_id, merchant, raw_name)
  where merchant is not null;

create unique index if not exists product_mappings_global_key
  on product_mappings (household_id, raw_name)
  where merchant is null;

-- Upsert that strengthens rather than resets: a repeated correction increments
-- times_seen instead of overwriting the history of the mapping.
create or replace function upsert_product_mapping(
  p_household_id uuid,
  p_merchant text,
  p_raw_name text,
  p_normalized_name text,
  p_category text,
  p_storage_location text,
  p_classification text,
  p_confidence numeric,
  p_source text
) returns product_mappings
language plpgsql
as $$
declare
  result product_mappings;
begin
  update product_mappings
     set normalized_name = p_normalized_name,
         category        = coalesce(p_category, category),
         storage_location = coalesce(p_storage_location, storage_location),
         classification  = p_classification,
         confidence      = p_confidence,
         source          = p_source,
         times_seen      = times_seen + 1,
         updated_at      = now()
   where household_id = p_household_id
     and raw_name = p_raw_name
     and merchant is not distinct from p_merchant
  returning * into result;

  if not found then
    insert into product_mappings (
      household_id, merchant, raw_name, normalized_name, category,
      storage_location, classification, confidence, source
    ) values (
      p_household_id, p_merchant, p_raw_name, p_normalized_name, p_category,
      p_storage_location, p_classification, p_confidence, p_source
    )
    returning * into result;
  end if;

  return result;
end;
$$;

-- --------------------------------------------------------------------------
-- Receipt parse telemetry
-- --------------------------------------------------------------------------
-- Cost and quality tracking for real parses. Deliberately holds no prompt text
-- and no image content — only what the parse cost and how well it went.

create table if not exists receipt_telemetry (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  receipt_id uuid references receipts(id) on delete set null,
  provider text not null,
  model text not null,
  latency_ms integer not null default 0,
  input_tokens integer,
  output_tokens integer,
  total_tokens integer,
  estimated_cost_usd numeric,
  item_count integer not null default 0,
  high_confidence_count integer not null default 0,
  needs_review_count integer not null default 0,
  excluded_count integer not null default 0,
  success boolean not null default true,
  -- Error class name only, never a message that could carry receipt contents.
  error_kind text,
  created_at timestamptz not null default now()
);

create index if not exists receipt_telemetry_household_idx
  on receipt_telemetry (household_id, created_at desc);

alter table product_mappings enable row level security;
alter table receipt_telemetry enable row level security;
