create or replace function app.quiz_course(quiz uuid)
returns uuid
language sql stable security definer set search_path = ''
as $$ select q.course_id from public.quizzes q where q.id = quiz $$;

-- The gate for a course final: every activity in every module of the course
-- has a completion for THIS enrollment.
--
-- `not exists` over no rows is true, so a course with no activities counts as
-- complete rather than becoming permanently un-finishable — the same choice
-- app.is_module_unlocked makes for an empty prerequisite. The trailing
-- `exists` on the enrollment stops that vacuous truth from also applying to an
-- enrollment id that does not exist at all.
create or replace function app.all_modules_complete(enrollment uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select
    exists (select 1 from public.enrollments e where e.id = enrollment)
    and not exists (
      select 1
        from public.enrollments e
        join public.modules m    on m.course_id = e.course_id
        join public.activities a on a.module_id = m.id
       where e.id = enrollment
         and not exists (
           select 1 from public.activity_completions ac
            where ac.enrollment_id = e.id and ac.activity_id = a.id
         )
    )
$$;

create or replace function app.has_unconsumed_retake(quiz uuid, trainee uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.quiz_retake_grants g
     where g.quiz_id = quiz and g.trainee_id = trainee and g.consumed_at is null
  )
$$;

grant execute on function app.quiz_course(uuid)                to authenticated;
grant execute on function app.all_modules_complete(uuid)       to authenticated;
grant execute on function app.has_unconsumed_retake(uuid,uuid) to authenticated;

-- Service-role entry points for the Edge Functions.
--
-- security definer, because a security invoker function cannot reach schema
-- app as service_role. The revoke names anon and authenticated explicitly:
-- revoking from public leaves untouched the EXECUTE that Supabase's default
-- privileges grant those roles directly.
create or replace function public.all_modules_complete_for(enrollment uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$ select app.all_modules_complete(enrollment) $$;
revoke all on function public.all_modules_complete_for(uuid) from public, anon, authenticated;
grant execute on function public.all_modules_complete_for(uuid) to service_role;

create or replace function public.has_unconsumed_retake_for(quiz uuid, trainee uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$ select app.has_unconsumed_retake(quiz, trainee) $$;
revoke all on function public.has_unconsumed_retake_for(uuid,uuid) from public, anon, authenticated;
grant execute on function public.has_unconsumed_retake_for(uuid,uuid) to service_role;
