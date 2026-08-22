-- Normalised from the prototype's managedTrainers text array: array
-- containment inside RLS policies is awkward and defeats the indexes the
-- three-hop supervisor check needs.
create table public.supervisor_trainers (
  supervisor_id uuid not null references public.profiles(id) on delete cascade,
  trainer_id    uuid not null references public.profiles(id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (supervisor_id, trainer_id)
);

alter table public.supervisor_trainers enable row level security;

create index supervisor_trainers_trainer_idx on public.supervisor_trainers(trainer_id);

-- Read-only for clients. Assignments are made by an admin through an Edge
-- Function, never by a supervisor claiming trainers for themselves.
revoke all on public.supervisor_trainers from authenticated, anon;
grant select on public.supervisor_trainers to authenticated;

create policy supervisor_trainers_select_own on public.supervisor_trainers
  for select to authenticated
  using ((select auth.uid()) = supervisor_id);

-- A policy on profiles that needed the caller's role would itself query
-- profiles, recursing forever. SECURITY DEFINER bypasses RLS inside the
-- function and breaks the cycle. search_path is pinned to close the
-- SECURITY DEFINER search-path injection hole.
--
-- app.my_role() and app.my_status() already exist from the migration that
-- fixed the self-update policy; this adds the rest of the library.

create or replace function app.is_active()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.status = 'active' from public.profiles p where p.id = (select auth.uid())),
    false)
$$;

create or replace function app.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.role = 'admin' and p.status = 'active'
       from public.profiles p where p.id = (select auth.uid())),
    false)
$$;

-- Three-hop check: is the caller an active supervisor who manages this trainer?
create or replace function app.supervises(target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.supervisor_trainers st
      join public.profiles p on p.id = st.supervisor_id
     where st.supervisor_id = (select auth.uid())
       and st.trainer_id    = target
       and p.status = 'active'
  )
$$;

grant execute on function app.is_active()      to authenticated;
grant execute on function app.is_admin()       to authenticated;
grant execute on function app.supervises(uuid) to authenticated;

-- The app schema is not exposed through PostgREST, so these thin public
-- wrappers exist purely so the test suite can exercise the helpers by RPC.
create or replace function public.my_role_probe() returns public.app_role
  language sql stable security invoker set search_path = '' as $$ select app.my_role() $$;

create or replace function public.is_active_probe() returns boolean
  language sql stable security invoker set search_path = '' as $$ select app.is_active() $$;

create or replace function public.is_admin_probe() returns boolean
  language sql stable security invoker set search_path = '' as $$ select app.is_admin() $$;

create or replace function public.supervises_probe(target uuid) returns boolean
  language sql stable security invoker set search_path = '' as $$ select app.supervises(target) $$;
