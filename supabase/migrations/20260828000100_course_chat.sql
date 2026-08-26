-- Real course chat for enrolled trainees and their trainer/admin staff.
--
-- The prototype kept it in local state and lost everything on reload. Real
-- chat needs a message table, a membership check, and RLS that prevents the
-- wrong people from reading or writing into a course thread.

create table public.messages (
  id         uuid primary key default gen_random_uuid(),
  course_id  uuid not null references public.courses(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  body       text not null check (body <> '' and length(body) <= 4000),
  created_at timestamptz not null default now()
);

alter table public.messages enable row level security;
create index messages_course_idx on public.messages(course_id, created_at);
create index messages_user_idx on public.messages(user_id);

-- Always read the sender from auth.uid() rather than trusting a client field.
-- The profile row is the identity source; a client-supplied name is spoofable.
create or replace function app.can_view_course_chat(course uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.courses c
     where c.id = course
       and (
         app.is_admin()
         or app.is_trainer_of(course)
         or app.is_enrolled(course)
       )
  )
$$;

grant execute on function app.can_view_course_chat(uuid) to authenticated;

revoke all on public.messages from anon, authenticated;
grant select on public.messages to authenticated;
grant insert (course_id, user_id, body) on public.messages to authenticated;

create policy messages_select on public.messages
  for select to authenticated
  using (app.can_view_course_chat(course_id));

create policy messages_insert on public.messages
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and app.is_active()
    and app.can_view_course_chat(course_id)
  );

-- No UPDATE/DELETE. Message threads are a record of conversation; editing a
-- message after sending it is a policy and audit problem, not a UI feature.

-- The display layer wants the sender's name and role without leaking contacts.
create or replace view public.course_chat_view
with (security_invoker = true)
as
  select
    m.id,
    m.course_id,
    m.user_id,
    m.body,
    m.created_at,
    p.name,
    p.role,
    p.avatar
    from public.messages m
    join public.public_profiles p on p.id = m.user_id;

grant select on public.course_chat_view to authenticated;
revoke all on public.course_chat_view from anon, authenticated;
grant select on public.course_chat_view to authenticated;
