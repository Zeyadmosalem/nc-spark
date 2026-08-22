create or replace function app.module_of_activity(activity uuid)
returns uuid
language sql stable security definer set search_path = ''
as $$ select a.module_id from public.activities a where a.id = activity $$;

-- The single source of truth for prerequisites. The prototype decided this in
-- the browser, where a trainee could skip ahead with devtools.
--
-- A module is unlocked when it has no prerequisite, or when every activity in
-- its prerequisite has a completion row for THIS enrollment. An empty
-- prerequisite counts as satisfied: `not exists` over no rows is true, which
-- is the behaviour we want rather than an accidental permanent lock.
--
-- Returns NULL for a module that does not exist. Callers must treat NULL as
-- locked; `complete-activity` does.
create or replace function app.is_module_unlocked(enrollment uuid, module uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select case
    when m.unlock_after_module_id is null then true
    else not exists (
      select 1
        from public.activities a
       where a.module_id = m.unlock_after_module_id
         and not exists (
           select 1 from public.activity_completions ac
            where ac.enrollment_id = enrollment
              and ac.activity_id   = a.id
         )
    )
  end
  from public.modules m
  where m.id = module
$$;

grant execute on function app.module_of_activity(uuid)      to authenticated;
grant execute on function app.is_module_unlocked(uuid,uuid) to authenticated;

-- Every other probe takes a course id and lets the underlying helper derive
-- the caller from auth.uid(), so it can only ever report on the caller. This
-- one takes an enrollment id, so it needs the ownership check spelled out:
-- without it any signed-in user could enumerate another trainee's progress.
create or replace function public.is_module_unlocked_probe(enrollment uuid, module uuid)
returns boolean
language sql stable security invoker set search_path = ''
as $$
  select case
    when app.owns_enrollment(enrollment) then app.is_module_unlocked(enrollment, module)
  end
$$;

-- Test support only: this one answers about course structure rather than a
-- caller, so it is not reachable by ordinary users at all.
create or replace function public.module_of_activity_probe(activity uuid)
returns uuid
language sql stable security invoker set search_path = ''
as $$ select app.module_of_activity(activity) $$;

revoke all on function public.module_of_activity_probe(uuid) from public;
grant execute on function public.module_of_activity_probe(uuid) to service_role;
