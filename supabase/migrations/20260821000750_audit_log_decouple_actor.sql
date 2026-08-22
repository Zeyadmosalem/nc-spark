-- audit_log.actor_id was a foreign key with ON DELETE SET NULL. Deleting a
-- user cascades profiles -> audit_log, and SET NULL is an UPDATE, which the
-- append-only trigger refuses. The result: any user who had ever performed an
-- audited action could not be deleted at all, and the failure surfaced as an
-- empty error object rather than anything diagnosable.
--
-- An audit record is an immutable snapshot, not a view over live rows. Drop
-- the foreign key and denormalise the actor's email so the entry stays
-- meaningful after the account is gone.

alter table public.audit_log
  drop constraint if exists audit_log_actor_id_fkey;

alter table public.audit_log
  add column if not exists actor_email text;

comment on column public.audit_log.actor_id is
  'Snapshot of the acting profile id. Deliberately NOT a foreign key: the record must outlive the account.';
comment on column public.audit_log.actor_email is
  'Snapshot of the actor email at the time of the action, so the entry is readable after deletion.';
