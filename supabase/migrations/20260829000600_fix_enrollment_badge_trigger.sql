-- The enrolment badge trigger raised on every completion.
--
-- `coalesce(old.status, '')` compares an enrollment_status against an empty
-- string, which Postgres resolves by casting '' to the enum — and there is no
-- such member, so it raised "invalid input value for enum". The trigger is
-- AFTER UPDATE, so the raise took the whole UPDATE with it: marking an
-- enrolment complete failed outright.
--
-- Worth noting how it presented. The test that caught it asserted the badge
-- appeared and did not check that the UPDATE succeeded, so a write that never
-- landed looked exactly like a badge rule that did not fire.
create or replace function app.xp_for_enrollment_complete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'completed'::public.enrollment_status
     and old.status is distinct from 'completed'::public.enrollment_status then
    perform app.evaluate_badges(new.trainee_id);
  end if;
  return new;
end;
$$;
