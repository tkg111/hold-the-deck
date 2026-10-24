-- Hold the Deck: Rankings, tuning submit_abyss_depth's speed limit.
-- Run once in the Supabase SQL Editor, after 001_rankings.sql.
--
-- The sim's fastest fair pace through the Abyss (strongest crews, x4 battle
-- speed, auto-continue's 2 s between depths) is about 9 s per depth on
-- quick depths, and about 3.4 depths a minute over ten in a row. With 15 s
-- per depth, a strong player diving offline (no submissions) for more than
-- a few minutes would be clamped. SEC_PER_DEPTH is now 4.5 s, about half
-- the fastest fair time per depth. Everything else is as in 001.
-- (create or replace keeps the function's grants.)

create or replace function public.submit_abyss_depth(p_depth int)
returns int
language plpgsql security definer set search_path = public as $$
declare
  uid           uuid := auth.uid();
  FIRST_ALLOW   constant int := 200;
  SLACK         constant int := 10;
  SEC_PER_DEPTH constant numeric := 4.5;   -- about half the fastest fair time per depth (9 s, sim)
  cur  int;
  last timestamptz;
  lim  int;
begin
  if uid is null then raise exception 'not signed in'; end if;
  if p_depth is null or p_depth < 0 or p_depth > 100000 then raise exception 'bad depth'; end if;
  select best_depth, updated_at into cur, last from abyss_scores where user_id = uid for update;
  if not found then raise exception 'no captain yet'; end if;
  if p_depth <= cur then return cur; end if;
  if cur = 0 then
    lim := FIRST_ALLOW;
  else
    lim := cur + SLACK + floor(extract(epoch from (now() - last)) / SEC_PER_DEPTH)::int;
  end if;
  update abyss_scores set best_depth = least(p_depth, lim), updated_at = now() where user_id = uid;
  return least(p_depth, lim);
end $$;
