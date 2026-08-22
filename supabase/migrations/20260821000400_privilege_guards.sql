-- Three independent layers stop a user changing their own role or status.
-- Any one of them suffices; all three mean a mistake in one is not a breach.

-- LAYER 1: column-level grants. A trainee lacks the Postgres privilege to
-- write role/status at all, whatever their query says.
revoke all on public.profiles from authenticated;
grant select on public.profiles to authenticated;
grant update (name, avatar) on public.profiles to authenticated;

revoke all on public.trainee_stats from authenticated;
grant select on public.trainee_stats to authenticated;

revoke all on public.allowed_domains from authenticated, anon;

-- LAYER 2: RLS. Row ownership, plus WITH CHECK asserting the privileged
-- columns are unchanged. The original prototype schema had no WITH CHECK at
-- all, which is what allowed a trainee to set role = 'admin'.
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (auth.uid() = id)
  with check (
    auth.uid() = id
    and role   = (select p.role   from public.profiles p where p.id = auth.uid())
    and status = (select p.status from public.profiles p where p.id = auth.uid())
  );

-- LAYER 3: a trigger, so even a mistake in layers 1 or 2 is not a breach.
create or replace function public.prevent_role_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if current_setting('role', true) = 'service_role' then
    return new;
  end if;
  if new.role is distinct from old.role then
    raise exception 'role may only be changed by an administrator';
  end if;
  if new.status is distinct from old.status then
    raise exception 'status may only be changed by an administrator';
  end if;
  return new;
end;
$$;

create trigger profiles_prevent_role_change
  before update on public.profiles
  for each row execute function public.prevent_role_change();
