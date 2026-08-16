-- Inventory intelligence.
--
-- Adds the probabilistic layer: how confident we are in an item's status, how
-- that status was arrived at, and when a human last confirmed it. Also widens
-- the inventory event vocabulary so state remains fully explainable.
--
-- Additive and idempotent. No drops, no type changes, safe to re-run.
-- Requires 0001. Independent of 0002 and 0003.

-- --------------------------------------------------------------------------
-- Probabilistic status on inventory items
-- --------------------------------------------------------------------------

alter table inventory_items
  -- 0–1 belief that `status` matches reality. Decays with time in application
  -- code rather than here, so the stored value records the observation itself.
  add column if not exists status_confidence numeric not null default 0.8,
  -- Last time a human told us the truth, as opposed to us inferring it.
  add column if not exists last_confirmed_at timestamptz,
  add column if not exists status_source text not null default 'seed'
    check (status_source in ('receipt', 'user', 'inferred', 'seed'));

comment on column inventory_items.status_confidence is
  'Confidence at the moment of observation; application code decays it by age.';

-- Surfacing "what needs confirming" is a hot path for the Kitchen screen.
create index if not exists inventory_items_confidence_idx
  on inventory_items (household_id, status_confidence);

-- --------------------------------------------------------------------------
-- Wider event vocabulary
-- --------------------------------------------------------------------------
-- 0001 allowed six event types. Inventory is now event-sourced, so restocks,
-- expiry and system inferences need to be recordable rather than applied
-- silently. Replacing the CHECK constraint is additive in effect: every value
-- previously allowed is still allowed.

alter table inventory_events
  drop constraint if exists inventory_events_event_type_check;

alter table inventory_events
  add constraint inventory_events_event_type_check
  check (event_type in (
    'receipt_added',
    'meal_consumed',
    'manual_adjustment',
    'restocked',
    'marked_low',
    'marked_out',
    'expired',
    'undo_meal',
    'system_inference',
    'user_confirmation'
  ));

-- Replaying one item's history should not scan the whole table.
create index if not exists inventory_events_item_time_idx
  on inventory_events (inventory_item_id, created_at desc);
