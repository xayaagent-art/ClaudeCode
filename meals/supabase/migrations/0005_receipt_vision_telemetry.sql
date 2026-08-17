-- Real receipt vision parsing: parse-quality and cost telemetry.
--
-- Item counts alone can't distinguish a clean read from a marginal one, and
-- without an attempt count a retried call looks the same as a first-try success
-- while costing twice as much. These columns make both visible.
--
-- Additive and idempotent: existing rows keep their values and default to zero.

alter table receipt_telemetry
  add column if not exists confidence_high integer not null default 0,
  add column if not exists confidence_medium integer not null default 0,
  add column if not exists confidence_low integer not null default 0,
  -- Nullable: a parse with no items has no meaningful mean, and 0 would read
  -- as "the model was certain of nothing" rather than "there was nothing".
  add column if not exists mean_confidence numeric,
  add column if not exists mapping_hit_count integer not null default 0,
  add column if not exists dropped_item_count integer not null default 0,
  add column if not exists attempts integer not null default 1;

comment on column receipt_telemetry.attempts is
  'Provider calls made including retries; spend scales with this, not with row count.';
comment on column receipt_telemetry.error_kind is
  'Typed failure kind (rate_limit, timeout, unreadable, ...). Never a provider message.';
