-- An UPDATE with a WHERE clause has to scan rows, and Postgres applies SELECT
-- policies to that scan as well as the UPDATE policy's USING clause. With no
-- SELECT policy in place, a self-update matched zero rows and silently did
-- nothing: HTTP 200, empty result, no error.
--
-- This is the minimal read policy needed for self-service. The admin and
-- supervisor read policies arrive with the rest of the visibility rules.

create policy profiles_select_self on public.profiles
  for select to authenticated
  using ((select auth.uid()) = id);

create policy trainee_stats_select_self on public.trainee_stats
  for select to authenticated
  using ((select auth.uid()) = profile_id);
