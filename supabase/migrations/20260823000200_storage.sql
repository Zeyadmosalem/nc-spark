-- Both buckets are PRIVATE. Access is granted per object by the policies
-- below, keyed off the path prefix, which is the standard Supabase pattern.
insert into storage.buckets (id, name, public)
values ('course-materials', 'course-materials', false),
       ('submissions',      'submissions',      false)
on conflict (id) do nothing;

-- course-materials: {course_id}/…
-- The first path segment is the course id, so authorisation is a lookup on it.
create policy course_materials_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'course-materials'
    and (
      app.is_admin()
      or app.is_trainer_of(((storage.foldername(name))[1])::uuid)
      or app.is_enrolled(((storage.foldername(name))[1])::uuid)
    )
  );

create policy course_materials_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'course-materials'
    and (app.is_admin() or app.is_trainer_of(((storage.foldername(name))[1])::uuid))
  );

-- WITH CHECK here is documentation, not a fix. Postgres already applies USING
-- to the new row when WITH CHECK is omitted from an UPDATE policy, so a move
-- into another trainer's course was blocked either way. Stating it explicitly
-- means the guarantee survives someone later widening USING for a read reason
-- without realising it also governs writes.
create policy course_materials_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'course-materials'
    and (app.is_admin() or app.is_trainer_of(((storage.foldername(name))[1])::uuid))
  )
  with check (
    bucket_id = 'course-materials'
    and (app.is_admin() or app.is_trainer_of(((storage.foldername(name))[1])::uuid))
  );

create policy course_materials_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'course-materials'
    and (app.is_admin() or app.is_trainer_of(((storage.foldername(name))[1])::uuid))
  );

-- submissions: {course_id}/{trainee_id}/…
-- A trainee may only write beneath their own id, so one trainee cannot
-- overwrite or forge another's work.
create policy submissions_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'submissions'
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and app.is_enrolled(((storage.foldername(name))[1])::uuid)
  );

-- Here WITH CHECK does change behaviour, in exactly one case. The USING
-- fallback only asserts that the folder is yours, which stays true after you
-- leave the course. WITH CHECK adds is_enrolled, so a withdrawn trainee can no
-- longer rename the work their assessment was based on. Renaming into someone
-- else's folder was already blocked by the fallback.
create policy submissions_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'submissions'
    and (storage.foldername(name))[2] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'submissions'
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and app.is_enrolled(((storage.foldername(name))[1])::uuid)
  );

create policy submissions_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'submissions'
    and (
      (storage.foldername(name))[2] = (select auth.uid())::text
      or app.is_admin()
      or app.is_trainer_of(((storage.foldername(name))[1])::uuid)
    )
  );

-- Deliberately no delete policy on submissions. A submitted assignment is
-- compliance evidence; nobody removes one through the API. Retiring a
-- submission is a service_role operation, done knowingly.
