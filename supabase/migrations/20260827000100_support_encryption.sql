-- Envelope encryption for support message bodies, and per-participant unread
-- state for the inbox.
--
-- WHAT THIS PROTECTS AGAINST, precisely, so nobody mistakes it for more:
--
-- Every message body is encrypted with a data key that is unique to its
-- thread. That data key is itself encrypted ("wrapped") with a master key that
-- lives in the Edge Function's secrets and is NEVER stored in this database.
-- A stolen database dump — a leaked backup, a compromised read replica, an
-- over-broad service-role token — therefore contains no readable message text.
--
-- It is NOT end-to-end encryption. The server can decrypt, by design, because
-- three things in this product require it:
--
--   1. Requests route to "whoever teaches this course", which is a role and
--      not a person. `courses.trainer_id` changes. E2EE encrypts to a specific
--      key at send time, so a reassigned trainer could never read the history
--      they have just inherited.
--   2. There is no native client. Keys would live in browser storage, so
--      clearing site data or signing in on a second device would destroy every
--      past message with no way back.
--   3. These threads are business records for a compliance programme. An
--      administrator has to be able to recover one.
--
-- An attacker holding BOTH the database and the function's secrets can read
-- everything. That is the definition of envelope encryption and the honest
-- limit of it.

-- ------------------------------------------------------------ thread keys --
--
-- One wrapped data key per thread. Rotating the master key means rewrapping
-- these rows and nothing else, which is the whole point of the indirection —
-- the alternative is re-encrypting every message ever sent.
create table public.support_thread_keys (
  request_id  uuid primary key references public.support_requests(id) on delete cascade,
  wrapped_key text not null,
  -- The AES-GCM initialisation vector used to wrap the data key. Unique per
  -- row: reusing an IV with the same key is the classic way to lose GCM's
  -- security properties entirely.
  wrap_iv     text not null,
  -- Which master key wrapped it, so a rotation can be done incrementally
  -- rather than in one transaction across every thread.
  key_version integer not null default 1,
  created_at  timestamptz not null default now()
);

alter table public.support_thread_keys enable row level security;

-- No grant to anon or authenticated at all, and no policy. Only the service
-- role reaches this, from inside the Edge Function. Same reasoning as
-- quiz_answer_keys: "a browser can never read this" is a property of the
-- grant table, not of every future query remembering to exclude a column.
revoke all on public.support_thread_keys from anon, authenticated;

-- -------------------------------------------------------- message bodies --
--
-- The plaintext column is replaced rather than kept alongside. A nullable
-- `body` next to a `body_cipher` is a column somebody will write to by
-- accident, and then half the table is in the clear.
alter table public.support_messages
  add column body_cipher text,
  add column body_iv     text;

-- Existing rows are migrated by the deploy script rather than here: encrypting
-- them needs the master key, which by design this database does not have.
-- Until then a row has plaintext OR ciphertext, never neither.
alter table public.support_messages
  add constraint support_messages_has_body
  check (
    (body is not null and body <> '')
    or (body_cipher is not null and body_iv is not null)
  );

alter table public.support_messages alter column body drop not null;

-- The insert grant loses `body` and gains the encrypted pair, so a client
-- cannot write plaintext even if it tries.
revoke insert on public.support_messages from authenticated;
grant insert (request_id, author_id, body_cipher, body_iv) on public.support_messages to authenticated;

-- --------------------------------------------------------- unread state --
--
-- Per participant, not per thread: a trainer having read something says
-- nothing about whether the trainee has, and an inbox that cannot tell the
-- difference is one nobody trusts.
create table public.support_reads (
  request_id   uuid not null references public.support_requests(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (request_id, user_id)
);

alter table public.support_reads enable row level security;
create index support_reads_user_idx on public.support_reads(user_id);

revoke all on public.support_reads from anon, authenticated;
grant select on public.support_reads to authenticated;
grant insert (request_id, user_id, last_read_at) on public.support_reads to authenticated;
grant update (last_read_at) on public.support_reads to authenticated;

-- You may only mark your own reading, and only on a thread you can see.
create policy support_reads_select on public.support_reads
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy support_reads_insert on public.support_reads
  for insert to authenticated
  with check (user_id = (select auth.uid()) and app.can_see_support(request_id));

create policy support_reads_update on public.support_reads
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ------------------------------------------------------------------ view --
--
-- Extends support_request_state with what the inbox needs: how many messages
-- the caller has not seen. security_invoker keeps the caller's own RLS in
-- force, so this can only ever count threads they are allowed to see.
create or replace view public.support_inbox
with (security_invoker = true)
as
  select
    r.id                                as request_id,
    r.author_id,
    r.course_id,
    r.subject,
    r.status,
    r.created_at,
    r.updated_at,
    count(m.id)                         as message_count,
    max(m.created_at)                   as last_message_at,
    bool_or(m.author_id <> r.author_id) as has_reply,
    (
      select m2.author_id = r.author_id
        from public.support_messages m2
       where m2.request_id = r.id
       order by m2.created_at desc
       limit 1
    )                                   as awaiting_staff,
    -- Messages somebody else wrote since the caller last opened the thread.
    -- Your own messages are never unread to you, which is why author_id is
    -- excluded rather than just comparing timestamps.
    count(m.id) filter (
      where m.author_id <> (select auth.uid())
        and m.created_at > coalesce(
          (select rd.last_read_at
             from public.support_reads rd
            where rd.request_id = r.id and rd.user_id = (select auth.uid())),
          '-infinity'::timestamptz)
    )                                   as unread_count
    from public.support_requests r
    left join public.support_messages m on m.request_id = r.id
   group by r.id;

revoke all on public.support_inbox from anon, authenticated;
grant select on public.support_inbox to authenticated;

-- support_request_state is superseded by support_inbox, which carries
-- everything it did plus the unread count.
drop view if exists public.support_request_state;
