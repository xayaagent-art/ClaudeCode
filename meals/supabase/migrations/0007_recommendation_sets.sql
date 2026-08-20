-- A recommendation set needs an identity of its own.
--
-- Recommendations were written as loose rows and read back by guessing which
-- of them belonged together, from how close their timestamps were. That guess
-- has no safe threshold: press "show me three others" twice quickly and two
-- sets merge into six cards on a screen that offers three; widen the gap and
-- separate sittings join up instead. The set is a real thing the product talks
-- about — "the meals you are looking at now" — so it gets a real key.

alter table meal_recommendations
  add column if not exists batch_id uuid;

-- Existing rows predate the column. They were written one set per statement,
-- so rows sharing a household and an exact created_at are exactly one set —
-- true here in a way it is not for arbitrary nearby timestamps, because
-- now() is transaction-scoped.
update meal_recommendations r
set batch_id = g.batch_id
from (
  select household_id, created_at, gen_random_uuid() as batch_id
  from meal_recommendations
  group by household_id, created_at
) g
where r.household_id = g.household_id
  and r.created_at = g.created_at
  and r.batch_id is null;

alter table meal_recommendations
  alter column batch_id set default gen_random_uuid();

-- Reading the current set is "newest batch for this household", so index it
-- the way it is read.
create index if not exists meal_recommendations_household_created_idx
  on meal_recommendations (household_id, created_at desc);
