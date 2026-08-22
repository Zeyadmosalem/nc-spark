-- Courses ---------------------------------------------------------------
revoke all on public.courses from anon, authenticated;
grant select on public.courses to authenticated;
-- Trainers may edit content columns only. status and trainer_id are excluded,
-- so publishing and reassignment cannot happen through a direct table write.
grant update (title, subtitle, description, color, icon) on public.courses to authenticated;
-- Column-limited INSERT too: a table-wide grant would let even an admin create
-- a course already marked published, bypassing the content check in
-- publish-course. status and trainer_id fall to their defaults.
grant insert (slug, title, subtitle, description, color, icon) on public.courses to authenticated;
grant delete on public.courses to authenticated;

create policy courses_select_published on public.courses
  for select to authenticated using (status = 'published');

create policy courses_select_own on public.courses
  for select to authenticated using (app.is_trainer_of(id));

create policy courses_select_admin on public.courses
  for select to authenticated using (app.is_admin());

create policy courses_insert_admin on public.courses
  for insert to authenticated with check (app.is_admin());

create policy courses_update_owner on public.courses
  for update to authenticated
  using (app.is_trainer_of(id) or app.is_admin())
  with check (app.is_trainer_of(id) or app.is_admin());

create policy courses_delete_admin on public.courses
  for delete to authenticated using (app.is_admin());

-- Modules ---------------------------------------------------------------
revoke all on public.modules from anon, authenticated;
grant select, insert, update, delete on public.modules to authenticated;

-- Visible with the course, so the catalog can show an outline before enrolling.
create policy modules_select on public.modules
  for select to authenticated
  using (
    app.is_admin()
    or app.is_trainer_of(course_id)
    or exists (select 1 from public.courses c where c.id = course_id and c.status = 'published')
  );

create policy modules_write on public.modules
  for all to authenticated
  using (app.is_admin() or app.is_trainer_of(course_id))
  with check (app.is_admin() or app.is_trainer_of(course_id));

-- Activities ------------------------------------------------------------
revoke all on public.activities from anon, authenticated;
grant select, insert, update, delete on public.activities to authenticated;

-- Content is gated on enrolment: a published course advertises its outline,
-- but the material itself is for enrolled trainees and course staff.
create policy activities_select on public.activities
  for select to authenticated
  using (
    exists (
      select 1 from public.modules m
       where m.id = module_id
         and (app.is_admin() or app.is_trainer_of(m.course_id) or app.is_enrolled(m.course_id))
    )
  );

create policy activities_write on public.activities
  for all to authenticated
  using (
    exists (select 1 from public.modules m
             where m.id = module_id and (app.is_admin() or app.is_trainer_of(m.course_id)))
  )
  with check (
    exists (select 1 from public.modules m
             where m.id = module_id and (app.is_admin() or app.is_trainer_of(m.course_id)))
  );

-- Course materials ------------------------------------------------------
revoke all on public.course_materials from anon, authenticated;
grant select, insert, update, delete on public.course_materials to authenticated;

create policy course_materials_select on public.course_materials
  for select to authenticated
  using (app.is_admin() or app.is_trainer_of(course_id) or app.is_enrolled(course_id));

create policy course_materials_write on public.course_materials
  for all to authenticated
  using (app.is_admin() or app.is_trainer_of(course_id))
  with check (app.is_admin() or app.is_trainer_of(course_id));
