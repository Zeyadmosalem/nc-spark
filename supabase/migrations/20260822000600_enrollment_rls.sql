-- Enrollments -----------------------------------------------------------
revoke all on public.enrollments from anon, authenticated;
grant select on public.enrollments to authenticated;
-- Column-limited INSERT. A table-wide grant would let a trainee apply with
-- status already set to 'active' — the WITH CHECK below does not constrain
-- status, so the grant is what forces it to the 'pending' default.
grant insert (trainee_id, course_id) on public.enrollments to authenticated;

create policy enrollments_select_own on public.enrollments
  for select to authenticated using ((select auth.uid()) = trainee_id);

create policy enrollments_select_course_staff on public.enrollments
  for select to authenticated using (app.is_admin() or app.is_trainer_of(course_id));

-- Three hops: supervisor -> managed trainer -> their course -> its enrollments.
create policy enrollments_select_supervisor on public.enrollments
  for select to authenticated
  using (
    exists (select 1 from public.courses c
             where c.id = course_id and app.supervises(c.trainer_id))
  );

-- Applications are only for published courses, only for yourself.
create policy enrollments_insert_self on public.enrollments
  for insert to authenticated
  with check (
    (select auth.uid()) = trainee_id
    and exists (select 1 from public.courses c where c.id = course_id and c.status = 'published')
  );

-- Activity completions ---------------------------------------------------
revoke all on public.activity_completions from anon, authenticated;
grant select on public.activity_completions to authenticated;

create policy activity_completions_select on public.activity_completions
  for select to authenticated
  using (
    app.owns_enrollment(enrollment_id)
    or exists (select 1 from public.enrollments e
                where e.id = enrollment_id
                  and (app.is_admin() or app.is_trainer_of(e.course_id)))
  );

-- No INSERT grant: completions are written by the complete-activity Edge
-- Function, which checks module unlocking server-side. A client-written
-- completion could skip prerequisites.

-- Teaching requests ------------------------------------------------------
revoke all on public.teaching_requests from anon, authenticated;
grant select on public.teaching_requests to authenticated;
-- Column-limited for the same reason: a trainer must not be able to open a
-- request that is already approved.
grant insert (trainer_id, course_id) on public.teaching_requests to authenticated;

create policy teaching_requests_select on public.teaching_requests
  for select to authenticated
  using ((select auth.uid()) = trainer_id or app.is_admin());

create policy teaching_requests_insert_self on public.teaching_requests
  for insert to authenticated
  with check (
    (select auth.uid()) = trainer_id
    and app.my_role() = 'trainer'
  );

-- Profile visibility along the enrolment chain -----------------------------
-- M1 restricted profiles to self, admins and managed trainers, noting that
-- trainee visibility "follows the enrolment chain and arrives with the catalog
-- milestone". This is that policy: without it a trainer cannot read the name
-- of a trainee applying to their own course, and the approval queue would show
-- "Unknown" for every row.
create policy profiles_select_my_trainees on public.profiles
  for select to authenticated
  using (
    exists (
      select 1 from public.enrollments e
       where e.trainee_id = profiles.id
         and app.is_trainer_of(e.course_id)
    )
  );
