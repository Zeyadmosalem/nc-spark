-- Support requests: the one screen in the product that still lied.
--
-- /trainee/support has been in the navigation since the prototype. It rendered
-- a name, an email and a message field, and its submit handler was
-- `alert('Support request submitted! (prototype only)')`. Nothing was stored
-- and nobody was told, so a trainee blocked on a course could fill it in,
-- read a confirmation, and wait for an answer that was never coming.
--
-- The shape here is a request plus a thread of messages rather than a single
-- body and a single reply. A trainee whose first answer does not unblock them
-- has to be able to say so; a form that allows exactly one round trip is the
-- same dead end one message later.

create type public.support_status as enum ('open', 'closed');

create table public.support_requests (
  id         uuid primary key default gen_random_uuid(),
  author_id  uuid not null references public.profiles(id) on delete cascade,
  -- Optional, and the reason trainers can answer at all: a request about a
  -- specific course reaches the person who teaches it. Left null it is for
  -- administrators. ON DELETE SET NULL rather than CASCADE — deleting a course
  -- must not destroy the record of somebody asking for help with it.
  course_id  uuid references public.courses(id) on delete set null,
  subject    text not null check (subject <> '' and length(subject) <= 200),
  status     public.support_status not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.support_requests enable row level security;
create index support_requests_author_idx on public.support_requests(author_id);
create index support_requests_course_idx on public.support_requests(course_id);
create index support_requests_status_idx on public.support_requests(status);

create trigger support_requests_touch_updated_at
  before update on public.support_requests
  for each row execute function public.touch_updated_at();

create table public.support_messages (
  id         uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.support_requests(id) on delete cascade,
  author_id  uuid not null references public.profiles(id) on delete cascade,
  body       text not null check (body <> '' and length(body) <= 4000),
  created_at timestamptz not null default now()
);

alter table public.support_messages enable row level security;
create index support_messages_request_idx on public.support_messages(request_id, created_at);

-- ----------------------------------------------------------------- helper --
--
-- Who may see a request. SECURITY DEFINER for the same reason every other
-- helper here is: the policy on support_messages has to ask about a row in
-- support_requests, and that table's own RLS would filter the answer.
--
-- A supervisor is deliberately absent. They oversee trainers and cannot
-- resolve a trainee id to a name anywhere else in the product; a support
-- thread is the most personal thing in it.
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
       and (
         r.author_id = (select auth.uid())
         or app.is_admin()
         or (r.course_id is not null and app.is_trainer_of(r.course_id))
       )
  )
$$;

grant execute on function app.can_see_support(uuid) to authenticated;

-- --------------------------------------------------------- support_requests --
revoke all on public.support_requests from anon, authenticated;
grant select on public.support_requests to authenticated;
-- author_id is NOT grantable: it is set from auth.uid() by the WITH CHECK
-- below, so a request cannot be filed in somebody else's name.
grant insert (author_id, course_id, subject) on public.support_requests to authenticated;
-- Only the status. Nobody edits a subject after the fact, and nobody but the
-- trigger touches updated_at.
grant update (status) on public.support_requests to authenticated;

create policy support_requests_select on public.support_requests
  for select to authenticated
  using (
    author_id = (select auth.uid())
    or app.is_admin()
    or (course_id is not null and app.is_trainer_of(course_id))
  );

create policy support_requests_insert on public.support_requests
  for insert to authenticated
  with check (author_id = (select auth.uid()) and app.is_active());

-- Either side can close a thread: the person who asked, once they are
-- unblocked, or whoever answered it.
create policy support_requests_update on public.support_requests
  for update to authenticated
  using (
    author_id = (select auth.uid())
    or app.is_admin()
    or (course_id is not null and app.is_trainer_of(course_id))
  )
  with check (
    author_id = (select auth.uid())
    or app.is_admin()
    or (course_id is not null and app.is_trainer_of(course_id))
  );

-- --------------------------------------------------------- support_messages --
revoke all on public.support_messages from anon, authenticated;
grant select on public.support_messages to authenticated;
grant insert (request_id, author_id, body) on public.support_messages to authenticated;

create policy support_messages_select on public.support_messages
  for select to authenticated
  using (app.can_see_support(request_id));

-- Anyone who can see the thread can add to it, as themselves. A closed thread
-- is checked here rather than in the UI: reopening is a deliberate act, and
-- without this a reply could land where nobody is looking.
create policy support_messages_insert on public.support_messages
  for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and app.is_active()
    and app.can_see_support(request_id)
    and exists (
      select 1 from public.support_requests r
       where r.id = request_id and r.status = 'open'
    )
  );

-- No UPDATE and no DELETE grant on messages at all. A support thread is a
-- record of what was asked and what was answered; being able to edit it after
-- the fact makes it worth less than not having one.

-- ------------------------------------------------------------------- view --
--
-- Answers "which threads are waiting on staff" without every caller
-- reimplementing it. A request needs an answer when its most recent message
-- came from the person who filed it.
create or replace view public.support_request_state
with (security_invoker = true)
as
  select
    r.id                                  as request_id,
    count(m.id)                           as message_count,
    max(m.created_at)                     as last_message_at,
    -- Left join lateral is avoided on purpose: enrollment_progress uses one
    -- and PostgREST cannot embed it, which cost this project a milestone of
    -- a broken My Courses page. A plain aggregate stays embeddable.
    bool_or(m.author_id <> r.author_id)   as has_reply,
    (
      select m2.author_id = r.author_id
        from public.support_messages m2
       where m2.request_id = r.id
       order by m2.created_at desc
       limit 1
    )                                     as awaiting_staff
    from public.support_requests r
    left join public.support_messages m on m.request_id = r.id
   group by r.id, r.author_id;

grant select on public.support_request_state to authenticated;

-- Supabase grants INSERT/UPDATE/REFERENCES on any new object in `public` to
-- anon and authenticated by default, and `grant select` above does not undo
-- them. Migration 20260823000110 learned this the hard way about a function;
-- it is true of views too. An aggregate view is not insertable, so nothing
-- could have come of it — but a grant nobody meant to make is exactly the
-- kind of thing that stops being harmless when the view is later rewritten.
revoke all on public.support_request_state from anon, authenticated;
grant select on public.support_request_state to authenticated;
