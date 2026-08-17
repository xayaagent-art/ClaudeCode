-- Gemini as a receipt parser, and recipe memory.
--
-- Two unrelated-looking changes that ship together because both are needed for
-- the dynamic meal loop to persist anything.

-- 1. receipts.parser was constrained to ('openai','fixture') in 0001, so a
--    Gemini parse would have been rejected at insert time — after the model
--    call had already been paid for.
alter table receipts drop constraint if exists receipts_parser_check;
alter table receipts add constraint receipts_parser_check
  check (parser is null or parser in ('openai', 'gemini', 'fixture'));

-- 2. Recipe memory. A dish that was generated, sourced and actually cooked is
--    worth more than one that was generated yesterday, and reusing it costs no
--    model call and no video search. These columns are what makes a discovery
--    promotable to a proven household recipe.
alter table recipes
  add column if not exists times_cooked integer not null default 0,
  add column if not exists last_cooked_at date,
  -- Stable identity for de-duplication, so "Palak Paneer" discovered twice does
  -- not become two rows with two video lookups.
  add column if not exists canonical_key text;

create unique index if not exists recipes_canonical_key_idx
  on recipes (canonical_key)
  where canonical_key is not null;

comment on column recipes.canonical_key is
  'Normalised title+cuisine identity. Unique so a rediscovered dish updates rather than duplicates.';
comment on column recipes.times_cooked is
  'Incremented on Ate This. Distinguishes a proven recipe from an untried suggestion.';
