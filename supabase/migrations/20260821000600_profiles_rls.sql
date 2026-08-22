-- The prototype schema used `using (true)` on profiles, publishing every
-- user's email address to anyone holding the anon key - which ships inside the
-- browser bundle. These policies replace that with least privilege.
--
-- profiles_select_self and trainee_stats_select_self already exist; they had
-- to land earlier so self-service updates could match a row at all.

create policy profiles_select_admin on public.profiles
  for select to authenticated
  using (app.is_admin());

-- A supervisor sees the trainers they manage. Trainee visibility follows the
-- enrolment chain and arrives with the catalog milestone.
create policy profiles_select_supervised on public.profiles
  for select to authenticated
  using (app.supervises(id));

create policy trainee_stats_select_admin on public.trainee_stats
  for select to authenticated
  using (app.is_admin());

-- Display identity for chat rosters and leaderboards, without contact details.
-- security_invoker is deliberately off so the view returns all active profiles
-- regardless of the base-table policies; it is safe because the view exposes
-- no email, no status history and no gamification state. Suspended and pending
-- accounts are filtered out so they cannot be discovered.
create view public.public_profiles
  with (security_invoker = off)
  as select id, name, avatar, role
       from public.profiles
      where status = 'active';

revoke all on public.public_profiles from anon, authenticated;
grant select on public.public_profiles to authenticated;
