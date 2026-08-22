-- Plain text rather than citext: this table is read inside a SECURITY DEFINER
-- function pinned to an empty search_path, where the citext type and its
-- operators (which live in the extensions schema) cannot be resolved. Storing
-- lowercase and comparing with lower() keeps the function dependent only on
-- pg_catalog, which is always reachable.
create table public.allowed_domains (
  domain     text primary key check (domain = lower(domain)),
  created_at timestamptz not null default now()
);

alter table public.allowed_domains enable row level security;

-- No policy is defined, so with RLS enabled nothing is readable by anon or
-- authenticated. Only the service role, which bypasses RLS, can see it.

-- Creates the profile for a newly registered auth user. Deliberately reads
-- ONLY the name from client metadata: role and status are decided here, never
-- by the client. This closes the privilege-escalation vector at source rather
-- than trying to filter a client-supplied role after the fact.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_domain  text;
  v_allowed boolean;
  v_status  public.profile_status;
  v_name    text;
begin
  v_domain := lower(split_part(new.email, '@', 2));

  select exists (select 1 from public.allowed_domains d where d.domain = v_domain)
    into v_allowed;

  v_status := case when v_allowed then 'active' else 'pending' end::public.profile_status;
  v_name   := coalesce(
                nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
                split_part(new.email, '@', 1)
              );

  insert into public.profiles (id, role, status, name, email)
  values (new.id, 'trainee', v_status, v_name, new.email);

  insert into public.trainee_stats (profile_id) values (new.id);

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
