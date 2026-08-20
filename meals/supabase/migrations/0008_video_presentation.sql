-- What the video card says about the video.
--
-- The card wants "8 min · 640K views" next to the creator's name. Both were
-- known at the moment the source was chosen and then thrown away, so drawing
-- the card meant either omitting the line or searching YouTube again to render
-- text — which would put a network round trip back in front of a screen that
-- Milestone 2 deliberately freed from one.
--
-- Additive and nullable: recipes resolved before this show the creator alone
-- until their source is next re-checked, which is the honest degradation.
alter table recipes
  add column if not exists video_duration_seconds integer,
  add column if not exists video_view_count bigint;
