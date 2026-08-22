create table public.audit_log (
  id          bigserial primary key,
  actor_id    uuid references public.profiles(id) on delete set null,
  action      text not null,
  entity_type text not null,
  entity_id   text,
  before      jsonb,
  after       jsonb,
  created_at  timestamptz not null default now()
);

alter table public.audit_log enable row level security;

create index audit_log_actor_idx   on public.audit_log(actor_id);
create index audit_log_entity_idx  on public.audit_log(entity_type, entity_id);
create index audit_log_created_idx on public.audit_log(created_at desc);

revoke all on public.audit_log from anon, authenticated;
grant select on public.audit_log to authenticated;

create policy audit_log_select_admin on public.audit_log
  for select to authenticated
  using (app.is_admin());

-- Append-only, enforced for EVERY role including service_role. An audit trail
-- that the application's own credentials can rewrite is not an audit trail:
-- the Edge Functions run as service_role, so exempting it would leave the log
-- editable by exactly the code it is meant to hold accountable.
--
-- Deliberate consequence: correcting a bad entry means appending a
-- compensating one, never editing history.
create or replace function public.audit_log_is_immutable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'audit_log is append-only';
end;
$$;

create trigger audit_log_no_update
  before update or delete on public.audit_log
  for each row execute function public.audit_log_is_immutable();

-- actor_id is ON DELETE SET NULL rather than CASCADE: deleting a user must
-- never erase the record of what they did.
