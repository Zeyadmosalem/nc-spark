-- Edge Functions need to ask about an enrollment that is not their own.
--
-- is_module_unlocked_probe cannot serve them: it derives the caller from
-- auth.uid(), which is NULL for service_role, and service_role has no USAGE on
-- schema app, so the call fails outright with "permission denied for schema
-- app". Without this entry point complete-activity would 500 on every request.
--
-- Skipping the ownership check is correct here rather than lax: an Edge
-- Function authorises the caller itself, by re-reading profiles and confirming
-- the enrollment, before it ever asks whether the module is unlocked. The
-- grant is what keeps this honest — no browser role can reach it.
create or replace function public.is_module_unlocked_for(enrollment uuid, module uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$ select app.is_module_unlocked(enrollment, module) $$;

revoke all on function public.is_module_unlocked_for(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.is_module_unlocked_for(uuid, uuid) to service_role;
