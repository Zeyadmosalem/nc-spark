-- Two corrections to module_of_activity_probe from 20260823000100.
--
-- 1. It was `security invoker`, so it ran as the caller. service_role has no
--    USAGE on schema app, so the call failed with "permission denied for
--    schema app". Running it as owner is what lets a probe reach app.* at all.
--
-- 2. `revoke all ... from public` did not lock out ordinary users. Supabase
--    sets default privileges that grant EXECUTE on new public functions
--    directly to anon and authenticated, and revoking from PUBLIC leaves an
--    explicit role grant untouched. Those roles have to be named.
create or replace function public.module_of_activity_probe(activity uuid)
returns uuid
language sql stable security definer set search_path = ''
as $$ select app.module_of_activity(activity) $$;

revoke all on function public.module_of_activity_probe(uuid)
  from public, anon, authenticated;
grant execute on function public.module_of_activity_probe(uuid) to service_role;
