-- Support is the platform-wide channel to administrators.
-- Course conversations belong in course chat, so course-linked support
-- requests must not also appear in a trainer's queue.

create or replace function app.can_see_support(request uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.support_requests r
     where r.id = request
       and (r.author_id = (select auth.uid()) or app.is_admin())
  )
$$;

drop policy if exists support_requests_select on public.support_requests;
create policy support_requests_select on public.support_requests
  for select to authenticated
  using (author_id = (select auth.uid()) or app.is_admin());

drop policy if exists support_requests_update on public.support_requests;
create policy support_requests_update on public.support_requests
  for update to authenticated
  using (author_id = (select auth.uid()) or app.is_admin())
  with check (author_id = (select auth.uid()) or app.is_admin());
