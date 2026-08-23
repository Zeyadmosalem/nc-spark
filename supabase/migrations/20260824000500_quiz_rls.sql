-- ---------------------------------------------------------------- quizzes --
revoke all on public.quizzes from anon, authenticated;
grant select on public.quizzes to authenticated;

create policy quizzes_select on public.quizzes
  for select to authenticated
  using (
    app.is_admin()
    or app.is_trainer_of(course_id)
    or app.is_enrolled(course_id)
  );

-- --------------------------------------------------------- quiz_questions --
revoke all on public.quiz_questions from anon, authenticated;
grant select on public.quiz_questions to authenticated;

create policy quiz_questions_select on public.quiz_questions
  for select to authenticated
  using (
    app.is_admin()
    or app.is_trainer_of(app.quiz_course(quiz_id))
    or app.is_enrolled(app.quiz_course(quiz_id))
  );

-- ------------------------------------------------------- quiz_answer_keys --
-- No grant, and deliberately no policy of any kind for authenticated.
--
-- The difference matters. RLS with a SELECT grant and no policy returns an
-- EMPTY SET: a silent, plausible-looking result that a later permissive policy
-- could quietly turn into a leak. Revoking the grant makes the same query fail
-- with "permission denied", which is loud and cannot be widened by accident.
-- The red-team suite asserts the error, not the empty set, for exactly this
-- reason. anon and authenticated are named because revoking from public does
-- not remove Supabase's direct default grant to them.
revoke all on public.quiz_answer_keys from anon, authenticated;

-- ---------------------------------------------------------- quiz_attempts --
-- SELECT only. Every write goes through an Edge Function, so there is no
-- column a trainee could set on themselves and nothing for a WITH CHECK to
-- have to guard.
revoke all on public.quiz_attempts from anon, authenticated;
grant select on public.quiz_attempts to authenticated;

create policy quiz_attempts_select on public.quiz_attempts
  for select to authenticated
  using (
    trainee_id = (select auth.uid())
    or app.is_admin()
    or app.is_trainer_of(app.quiz_course(quiz_id))
    or app.supervises(trainee_id)
  );

-- ----------------------------------------------------------- quiz_answers --
revoke all on public.quiz_answers from anon, authenticated;
grant select on public.quiz_answers to authenticated;

create policy quiz_answers_select on public.quiz_answers
  for select to authenticated
  using (exists (
    select 1 from public.quiz_attempts t
     where t.id = attempt_id
       and (
         t.trainee_id = (select auth.uid())
         or app.is_admin()
         or app.is_trainer_of(app.quiz_course(t.quiz_id))
         or app.supervises(t.trainee_id)
       )
  ));

-- ---------------------------------------------------- quiz_retake_grants --
revoke all on public.quiz_retake_grants from anon, authenticated;
grant select on public.quiz_retake_grants to authenticated;

create policy quiz_retake_grants_select on public.quiz_retake_grants
  for select to authenticated
  using (
    trainee_id = (select auth.uid())
    or app.is_admin()
    or app.is_trainer_of(app.quiz_course(quiz_id))
  );
