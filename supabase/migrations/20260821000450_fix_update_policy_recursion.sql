-- The WITH CHECK in 20260821000400 compared role/status against a subquery
-- over public.profiles. That subquery is itself subject to RLS, and since no
-- SELECT policy exists yet it returned NULL, so the comparison evaluated to
-- NULL and every self-update was rejected - including legitimate name changes.
--
-- SECURITY DEFINER helpers bypass RLS and break the cycle. This is the same
-- pattern the rest of the policy helpers use.

create schema if not exists app;

create or replace function app.my_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$ select p.role from public.profiles p where p.id = (select auth.uid()) $$;

create or replace function app.my_status()
returns public.profile_status
language sql
stable
security definer
set search_path = ''
as $$ select p.status from public.profiles p where p.id = (select auth.uid()) $$;

grant usage on schema app to authenticated;
grant execute on function app.my_role()   to authenticated;
grant execute on function app.my_status() to authenticated;

drop policy if exists profiles_update_self on public.profiles;

create policy profiles_update_self on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check (
    (select auth.uid()) = id
    and role   = app.my_role()
    and status = app.my_status()
  );
