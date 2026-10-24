-- Hold the Deck: Rankings (Abyss depth leaderboard + friends board)
-- Run once in the Supabase SQL Editor (or `supabase db push`).
-- Players sign in anonymously; every write goes through the functions below, never straight into the tables.

-- ------------------------------------------------------------------ tables
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  name        text not null check (name ~ '^[A-Za-z0-9 _-]{3,16}$'),
  friend_code text not null unique check (friend_code ~ '^[A-Z2-9]{6}$'),
  created_at  timestamptz not null default now()
);

create table if not exists public.abyss_scores (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  best_depth int  not null default 0 check (best_depth between 0 and 100000),
  updated_at timestamptz not null default now()
);
create index if not exists abyss_scores_rank_idx on public.abyss_scores (best_depth desc, updated_at asc);

create table if not exists public.friendships (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  friend_id  uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id),
  check (user_id <> friend_id)
);

-- ------------------------------------------------------------------ access rules
alter table public.profiles     enable row level security;
alter table public.abyss_scores enable row level security;
alter table public.friendships  enable row level security;

-- Anyone signed in may read names and scores; nobody may write directly (no insert/update/delete policies).
drop policy if exists "read profiles" on public.profiles;
create policy "read profiles" on public.profiles for select to authenticated using (true);
drop policy if exists "read scores" on public.abyss_scores;
create policy "read scores" on public.abyss_scores for select to authenticated using (true);
drop policy if exists "read own friendships" on public.friendships;
create policy "read own friendships" on public.friendships for select to authenticated using (user_id = auth.uid());

-- Friend codes stay private: other players can see id + name only.
revoke all on public.profiles, public.abyss_scores, public.friendships from anon, authenticated;
grant select (id, name, created_at) on public.profiles to authenticated;
grant select on public.abyss_scores to authenticated;
grant select on public.friendships to authenticated;

-- ------------------------------------------------------------------ helpers
create or replace function public.gen_friend_code()
returns text language plpgsql set search_path = public as $$
declare
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   -- no 0/O/1/I, easy to read aloud
  code  text;
begin
  loop
    code := '';
    for i in 1..6 loop
      code := code || substr(chars, 1 + floor(random() * length(chars))::int, 1);
    end loop;
    exit when not exists (select 1 from public.profiles where friend_code = code);
  end loop;
  return code;
end $$;

-- ------------------------------------------------------------------ player functions
-- Create or rename the captain. Returns the name and the player's own friend code.
create or replace function public.set_captain_name(p_name text)
returns table (captain_name text, code text, best int)
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  n   text := btrim(coalesce(p_name, ''));
begin
  if uid is null then raise exception 'not signed in'; end if;
  if n !~ '^[A-Za-z0-9 _-]{3,16}$' then
    raise exception 'Names are 3-16 letters, numbers, spaces, _ or -';
  end if;
  insert into profiles (id, name, friend_code) values (uid, n, gen_friend_code())
  on conflict (id) do update set name = excluded.name;
  insert into abyss_scores (user_id) values (uid) on conflict (user_id) do nothing;
  return query
    select p.name, p.friend_code, s.best_depth
    from profiles p join abyss_scores s on s.user_id = p.id
    where p.id = uid;
end $$;

create or replace function public.my_profile()
returns table (captain_name text, code text, best int)
language sql security definer set search_path = public stable as $$
  select p.name, p.friend_code, s.best_depth
  from profiles p join abyss_scores s on s.user_id = p.id
  where p.id = auth.uid();
$$;

-- Submit a new best Abyss depth. Light cheat check for a friends-and-testers board:
--   * the score can only go up;
--   * it can rise at most FIRST_ALLOW on the first submission (veterans joining late),
--     then at most SLACK + one depth per SEC_PER_DEPTH seconds since the last accepted score.
-- Anything above the limit is clamped (not rejected); the client re-submits its true best later
-- and it climbs as time passes. Returns the stored best.
create or replace function public.submit_abyss_depth(p_depth int)
returns int
language plpgsql security definer set search_path = public as $$
declare
  uid           uuid := auth.uid();
  FIRST_ALLOW   constant int := 200;
  SLACK         constant int := 10;
  SEC_PER_DEPTH constant numeric := 15;   -- tune: about half the fastest legit pace measured in the sim
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

-- Add a friend by code. Friendship is mutual: both players see each other.
create or replace function public.add_friend(p_code text)
returns table (friend_id uuid, captain_name text)
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  fid uuid;
  fname text;
begin
  if uid is null then raise exception 'not signed in'; end if;
  if not exists (select 1 from profiles where id = uid) then raise exception 'no captain yet'; end if;
  select p.id, p.name into fid, fname from profiles p where p.friend_code = upper(btrim(coalesce(p_code, '')));
  if fid is null then raise exception 'No captain has that code'; end if;
  if fid = uid then raise exception 'That is your own code'; end if;
  if (select count(*) from friendships f where f.user_id = uid) >= 50 then
    raise exception 'Your crew list is full (50)';
  end if;
  insert into friendships (user_id, friend_id) values (uid, fid), (fid, uid) on conflict do nothing;
  return query select fid, fname;
end $$;

create or replace function public.remove_friend(p_friend uuid)
returns void
language sql security definer set search_path = public as $$
  delete from friendships
  where (user_id = auth.uid() and friend_id = p_friend)
     or (user_id = p_friend and friend_id = auth.uid());
$$;

-- ------------------------------------------------------------------ boards
-- Top N, ties broken by who got there first.
create or replace function public.world_top(p_limit int default 50)
returns table (rank bigint, captain_name text, best int, is_me boolean)
language sql security invoker set search_path = public stable as $$
  select rank() over (order by s.best_depth desc, s.updated_at asc), p.name, s.best_depth, s.user_id = auth.uid()
  from abyss_scores s join profiles p on p.id = s.user_id
  where s.best_depth > 0
  order by s.best_depth desc, s.updated_at asc
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
$$;

-- The caller's own world rank (null until they have a depth).
create or replace function public.my_rank()
returns table (rank bigint, best int, total bigint)
language sql security invoker set search_path = public stable as $$
  with me as (select best_depth, updated_at from abyss_scores where user_id = auth.uid())
  select (select count(*) from abyss_scores s, me
           where s.best_depth > me.best_depth
              or (s.best_depth = me.best_depth and s.updated_at < me.updated_at)) + 1,
         me.best_depth,
         (select count(*) from abyss_scores where best_depth > 0)
  from me where me.best_depth > 0;
$$;

-- The caller plus everyone on their crew list.
create or replace function public.friends_board()
returns table (rank bigint, friend_id uuid, captain_name text, best int, is_me boolean)
language sql security invoker set search_path = public stable as $$
  with ids as (
    select auth.uid() as id
    union
    select f.friend_id from friendships f where f.user_id = auth.uid()
  )
  select rank() over (order by s.best_depth desc, s.updated_at asc), p.id, p.name, s.best_depth, p.id = auth.uid()
  from ids join profiles p on p.id = ids.id join abyss_scores s on s.user_id = p.id
  order by s.best_depth desc, s.updated_at asc;
$$;

-- ------------------------------------------------------------------ function permissions
revoke all on function public.gen_friend_code()            from public, anon, authenticated;
revoke all on function public.set_captain_name(text)       from public, anon;
revoke all on function public.my_profile()                 from public, anon;
revoke all on function public.submit_abyss_depth(int)      from public, anon;
revoke all on function public.add_friend(text)             from public, anon;
revoke all on function public.remove_friend(uuid)          from public, anon;
revoke all on function public.world_top(int)               from public, anon;
revoke all on function public.my_rank()                    from public, anon;
revoke all on function public.friends_board()              from public, anon;
grant execute on function public.set_captain_name(text), public.my_profile(), public.submit_abyss_depth(int),
  public.add_friend(text), public.remove_friend(uuid), public.world_top(int), public.my_rank(),
  public.friends_board() to authenticated;
