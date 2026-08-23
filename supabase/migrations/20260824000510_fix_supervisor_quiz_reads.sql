-- app.supervises() takes a TRAINER id: a supervisor manages trainers and
-- reaches trainees only through those trainers' courses. The policies in
-- 20260824000500 passed a trainee id, which is never a supervisor_trainers
-- row, so a supervisor could see no attempts at all.
--
-- This is the shape M2 already uses for enrollments: resolve the course, then
-- ask whether the caller supervises its trainer.
create or replace function app.quiz_trainer(quiz uuid)
returns uuid
language sql stable security definer set search_path = ''
as $$
  select c.trainer_id
    from public.quizzes q
    join public.courses c on c.id = q.course_id
   where q.id = quiz
$$;
grant execute on function app.quiz_trainer(uuid) to authenticated;

drop policy quiz_attempts_select on public.quiz_attempts;
create policy quiz_attempts_select on public.quiz_attempts
  for select to authenticated
  using (
    trainee_id = (select auth.uid())
    or app.is_admin()
    or app.is_trainer_of(app.quiz_course(quiz_id))
    or app.supervises(app.quiz_trainer(quiz_id))
  );

drop policy quiz_answers_select on public.quiz_answers;
create policy quiz_answers_select on public.quiz_answers
  for select to authenticated
  using (exists (
    select 1 from public.quiz_attempts t
     where t.id = attempt_id
       and (
         t.trainee_id = (select auth.uid())
         or app.is_admin()
         or app.is_trainer_of(app.quiz_course(t.quiz_id))
         or app.supervises(app.quiz_trainer(t.quiz_id))
       )
  ));
