create or replace function app.is_trainer_of(course uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.courses c
     where c.id = course
       and c.trainer_id = (select auth.uid())
  )
$$;

-- Deliberately requires an ACTIVE (or completed) enrollment. A pending
-- application must not unlock course content while it waits for approval.
create or replace function app.is_enrolled(course uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.enrollments e
     where e.course_id  = course
       and e.trainee_id = (select auth.uid())
       and e.status in ('active','completed')
  )
$$;

create or replace function app.owns_enrollment(enrollment uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.enrollments e
     where e.id = enrollment
       and e.trainee_id = (select auth.uid())
  )
$$;

grant execute on function app.is_trainer_of(uuid)   to authenticated;
grant execute on function app.is_enrolled(uuid)     to authenticated;
grant execute on function app.owns_enrollment(uuid) to authenticated;

create or replace function public.is_trainer_of_probe(course uuid) returns boolean
  language sql stable security invoker set search_path = '' as $$ select app.is_trainer_of(course) $$;

create or replace function public.is_enrolled_probe(course uuid) returns boolean
  language sql stable security invoker set search_path = '' as $$ select app.is_enrolled(course) $$;

-- Progress is DERIVED, never stored. The prototype kept a progress column and
-- nudged it by a magic +15 on completion; a view cannot drift from reality
-- because it is computed from it.
create view public.enrollment_progress
  with (security_invoker = on)
  as
select
  e.id         as enrollment_id,
  e.trainee_id,
  e.course_id,
  coalesce(t.total, 0) as total_activities,
  coalesce(d.done, 0)  as completed_activities,
  case
    when coalesce(t.total, 0) = 0 then 0
    else round(100.0 * coalesce(d.done, 0) / t.total)::int
  end as percent
from public.enrollments e
left join lateral (
  select count(*)::int as total
    from public.activities a
    join public.modules m on m.id = a.module_id
   where m.course_id = e.course_id
) t on true
left join lateral (
  select count(*)::int as done
    from public.activity_completions ac
   where ac.enrollment_id = e.id
) d on true;

grant select on public.enrollment_progress to authenticated;
