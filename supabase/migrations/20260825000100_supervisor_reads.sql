-- Backlog B5, and the same gap on courses.
--
-- A supervisor could already read quiz ATTEMPTS for a managed trainer, and the
-- ENROLMENTS on that trainer's courses, but neither the quiz nor the course
-- those rows point at. Any oversight screen would render "attempt on <unknown
-- quiz>" and "enrolled in <unknown course>". Same shape as the M2 gap where a
-- trainer could not read an applicant's name.
--
-- B5 said to fix this when a supervisor view existed rather than
-- speculatively. One does now, so this is that fix.
--
-- Both additions are SELECT only, and scoped by app.supervises, which already
-- requires the caller to be an active supervisor linked to that trainer.
-- Nothing here exposes an answer: quiz_answer_keys has no grant and no policy
-- for authenticated, and that is untouched.

-- courses.trainer_id is readable directly inside a policy ON courses, but a
-- policy on quizzes has only course_id. Reaching courses with a plain subquery
-- there would be RLS-filtered and return NULL for a draft course, which is the
-- trap this codebase has hit before, so it goes through a definer helper.
create or replace function app.course_trainer(course uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select c.trainer_id from public.courses c where c.id = course
$$;

grant execute on function app.course_trainer(uuid) to authenticated;

-- Includes drafts on purpose. enrollments_select_supervisor does not filter on
-- course status, so without this a supervisor can see an enrolment on a draft
-- course and be unable to name the course.
create policy courses_select_supervisor on public.courses
  for select to authenticated
  using (app.supervises(trainer_id));

drop policy quizzes_select on public.quizzes;
create policy quizzes_select on public.quizzes
  for select to authenticated
  using (
    app.is_admin()
    or app.is_trainer_of(course_id)
    or app.is_enrolled(course_id)
    or app.supervises(app.course_trainer(course_id))
  );
