-- Who is actually using the platform, and when.
--
-- Nothing recorded this. `audit_log` records privileged WRITES — a role
-- changed, a course published — which is a different question: it tells you
-- what was done to the system, never that somebody signed in and read a
-- course. An administrator asking "is this training being used" had nothing to
-- read at all.
--
-- WHAT IS DELIBERATELY NOT COLLECTED: no page paths, no IP addresses, no user
-- agents, no per-request rows. A count of visits per person per day answers
-- "who is using it, how often, and when did they stop" — which is the
-- administrative question — while being poor material for anyone who wanted to
-- reconstruct an individual's day. Recording less is the point, not an
-- oversight.

create table public.user_activity (
  user_id      uuid not null references public.profiles(id) on delete cascade,
  day          date not null default current_date,
  -- Visits, not seconds. A "time on page" figure from a browser is mostly a
  -- record of tabs left open, and it would be a stronger claim than the data
  -- supports.
  hits         integer not null default 0 check (hits >= 0),
  last_seen_at timestamptz not null default now(),
  primary key (user_id, day)
);

alter table public.user_activity enable row level security;
create index user_activity_day_idx on public.user_activity(day desc);

-- No write grant for any browser role: rows only move through the definer
-- function below, so a client cannot invent activity for somebody else or
-- backdate its own.
revoke all on public.user_activity from anon, authenticated;
grant select on public.user_activity to authenticated;

create policy user_activity_select_self on public.user_activity
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy user_activity_select_admin on public.user_activity
  for select to authenticated
  using (app.is_admin());

/**
 * Records that the caller is here, today.
 *
 * Always the CALLER: the row is keyed on auth.uid() and the function takes no
 * user argument, so there is no version of this call that writes somebody
 * else's activity.
 */
create or replace function public.touch_activity()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := (select auth.uid());
begin
  if v_id is null then return; end if;

  insert into public.user_activity (user_id, day, hits, last_seen_at)
  values (v_id, current_date, 1, now())
  on conflict (user_id, day) do update
    set hits = public.user_activity.hits + 1,
        last_seen_at = now();
end;
$$;

revoke all on function public.touch_activity() from public;
grant execute on function public.touch_activity() to authenticated;

/**
 * The administrator's usage view: one row per person, with when they were last
 * seen and how much they have used it recently.
 *
 * A view rather than a query in the app because "active" needs one definition.
 * security_invoker keeps the admin policy above in force, so this is readable
 * by an admin and returns a single row — their own — to anybody else.
 */
create or replace view public.user_activity_summary
with (security_invoker = true)
as
  select
    p.id            as user_id,
    p.name,
    p.email,
    p.role,
    p.status,
    p.created_at,
    max(a.last_seen_at)                                            as last_seen_at,
    count(a.day) filter (where a.day > current_date - 30)::int      as days_active_30,
    coalesce(sum(a.hits) filter (where a.day > current_date - 30), 0)::int as visits_30,
    coalesce(sum(a.hits), 0)::int                                   as visits_total
    from public.profiles p
    left join public.user_activity a on a.user_id = p.id
   group by p.id;

revoke all on public.user_activity_summary from anon, authenticated;
grant select on public.user_activity_summary to authenticated;
