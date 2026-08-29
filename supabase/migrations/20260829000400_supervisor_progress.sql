-- A supervisor could not see any progress at all, and the screens said 0%.
--
-- enrollment_progress is security_invoker, and it counts two things by
-- joining: how many activities a course has, and how many of them an
-- enrolment has completed. A supervisor could read neither table:
--
--   activities_select            admin OR trainer of the course OR ENROLLED
--   activity_completions_select  owns the enrolment OR admin OR its trainer
--
-- A supervisor is none of those, so both counts came back 0 and the view
-- divided into a zero total to produce 0%. Every cohort on the oversight
-- screen therefore read "0% avg progress" while the same cohort read 20-100%
-- on the trainer's screen — the numbers were not missing, which would have
-- been noticed, they were confidently wrong.
--
-- The oversight screens have existed since M5 and have been reporting zeros
-- for every cohort since the day they shipped.

-- What a supervisor may read is what their own trainers teach, which is the
-- same join app.supervises_course already makes for XP.
create policy activities_select_supervisor on public.activities
  for select to authenticated
  using (
    exists (
      select 1 from public.modules m
       where m.id = public.activities.module_id
         and app.supervises_course(m.course_id)
    )
  );

create policy activity_completions_select_supervisor on public.activity_completions
  for select to authenticated
  using (
    exists (
      select 1 from public.enrollments e
       where e.id = public.activity_completions.enrollment_id
         and app.supervises_course(e.course_id)
    )
  );
