-- XP: the thing the product has been promising since M1 and never paid.
--
-- `trainee_stats(xp, streak, last_active_on)` and `activities.xp` have both
-- existed since the first milestone, the course builder lets a trainer set the
-- points on every activity, and every activity page shows "+10 XP" — while
-- nothing anywhere increments a single point. This closes that.
--
-- WHY THIS IS ALL TRIGGERS, and not two lines added to the Edge Functions:
--
-- Awarding from the functions would mean every future path that completes an
-- activity has to remember to award, and the day one forgets, the score
-- silently stops matching the work. Awarding from the database means the
-- points follow the FACT — a completion row, a passed attempt, a message —
-- so there is no path that can skip it, including a service-role script and
-- including anything written next year.
--
-- It also means a client can never award itself: trainee_stats has no insert
-- or update grant for `authenticated` and neither does xp_events, so points
-- only ever move under a definer function the browser cannot call.

create type public.xp_kind as enum ('activity', 'quiz', 'participation');

-- ------------------------------------------------------------- the ledger --
--
-- Every award is a row, rather than only a running total on trainee_stats.
-- A total answers "how much" and nothing else; the ledger answers "from what,
-- and when", which is what a progress chart over time needs and what makes a
-- wrong total something you can investigate rather than just correct.
create table public.xp_events (
  id         uuid primary key default gen_random_uuid(),
  trainee_id uuid not null references public.profiles(id) on delete cascade,
  -- Null only if the course is later deleted; the points stay earned.
  course_id  uuid references public.courses(id) on delete set null,
  kind       public.xp_kind not null,
  -- The activity, quiz or message the points came from.
  source_id  uuid,
  points     integer not null check (points > 0),
  created_at timestamptz not null default now()
);

alter table public.xp_events enable row level security;

create index xp_events_trainee_idx on public.xp_events(trainee_id, created_at desc);
create index xp_events_course_idx  on public.xp_events(course_id);

-- One award per thing, forever. Re-completing an activity, or passing a quiz
-- again on a retake, must not pay twice — otherwise the leaderboard measures
-- persistence at clicking rather than learning.
create unique index xp_events_once
  on public.xp_events (trainee_id, kind, source_id)
  where source_id is not null;

-- Participation is capped at one award per course per day. Without this,
-- "being active in class" is a button that prints points.
create unique index xp_events_participation_daily
  on public.xp_events (trainee_id, course_id, ((created_at at time zone 'utc')::date))
  where kind = 'participation';

-- --------------------------------------------------------------- awarding --

create or replace function app.award_xp(
  trainee uuid, course uuid, k public.xp_kind, source uuid, pts integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- An activity worth zero points is a legitimate thing for a trainer to
  -- author; it simply earns nothing.
  if trainee is null or pts is null or pts <= 0 then return; end if;

  -- The unique indexes above are the idempotency, so a second attempt at the
  -- same award is a no-op rather than an error the caller has to handle.
  insert into public.xp_events (trainee_id, course_id, kind, source_id, points)
  values (trainee, course, k, source, pts)
  on conflict do nothing;
end;
$$;

-- Keeps the running total and the streak in step with the ledger, so the two
-- cannot drift: trainee_stats is derived, and this is the only thing that
-- writes it.
create or replace function app.apply_xp_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_last date;
begin
  select ts.last_active_on into v_last
    from public.trainee_stats ts where ts.profile_id = new.trainee_id;

  insert into public.trainee_stats (profile_id, xp, streak, last_active_on)
  values (new.trainee_id, new.points, 1, current_date)
  on conflict (profile_id) do update
    set xp = public.trainee_stats.xp + new.points,
        streak = case
          -- Already counted today: the streak is a run of days, not of awards.
          when v_last = current_date     then public.trainee_stats.streak
          when v_last = current_date - 1 then public.trainee_stats.streak + 1
          -- A gap, or the first ever award, restarts at one.
          else 1
        end,
        last_active_on = current_date;

  return new;
end;
$$;

create trigger xp_events_apply
  after insert on public.xp_events
  for each row execute function app.apply_xp_event();

-- ---------------------------------------------------------- where it comes --
-- ---------------------------------------------------------------- from -----

-- Finishing an activity pays what the trainer set on it.
create or replace function app.xp_for_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trainee uuid;
  v_course  uuid;
  v_xp      integer;
begin
  select e.trainee_id, e.course_id into v_trainee, v_course
    from public.enrollments e where e.id = new.enrollment_id;

  select a.xp into v_xp
    from public.activities a where a.id = new.activity_id;

  perform app.award_xp(v_trainee, v_course, 'activity', new.activity_id, v_xp);
  return new;
end;
$$;

create trigger activity_completions_xp
  after insert on public.activity_completions
  for each row execute function app.xp_for_activity();

-- Passing a quiz pays in proportion to the score, so a bare pass and a perfect
-- paper are not worth the same. Keyed on the quiz rather than the attempt: a
-- retake improves the trainee's record, it does not pay a second time.
create or replace function app.xp_for_quiz()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_course uuid;
  v_xp     integer;
  v_score  numeric;
  v_points integer;
begin
  -- Only the transition into passed, and only once.
  if new.passed is not true or coalesce(old.passed, false) then
    return new;
  end if;

  select q.course_id, coalesce(a.xp, 20) into v_course, v_xp
    from public.quizzes q
    left join public.activities a on a.id = q.activity_id
   where q.id = new.quiz_id;

  v_score  := coalesce(new.final_score, new.auto_score, 0);
  -- A pass is always worth at least a point, however the rounding falls.
  v_points := greatest(1, round(v_xp * v_score / 100.0)::int);

  perform app.award_xp(new.trainee_id, v_course, 'quiz', new.quiz_id, v_points);
  return new;
end;
$$;

create trigger quiz_attempts_xp
  after update on public.quiz_attempts
  for each row execute function app.xp_for_quiz();

-- Taking part in the course conversation. Small, and capped at once per course
-- per day by the index above, because the alternative is a chat full of "ok".
create or replace function app.xp_for_participation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Trainees only. A trainer answering questions is doing their job, not
  -- collecting points, and a leaderboard with staff on it is not a
  -- leaderboard.
  if exists (
    select 1 from public.profiles p
     where p.id = new.user_id and p.role = 'trainee'
  ) then
    perform app.award_xp(new.user_id, new.course_id, 'participation', null, 2);
  end if;
  return new;
end;
$$;

create trigger messages_xp
  after insert on public.messages
  for each row execute function app.xp_for_participation();

-- ------------------------------------------------------------------- who --
-- ------------------------------------------------------------- may read ---

-- A supervisor oversees trainers, so they reach a trainee's record through the
-- course that trainee is on. app.supervises() takes a TRAINER id and is the
-- wrong shape for this.
create or replace function app.supervises_course(course uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.courses c
      join public.supervisor_trainers st on st.trainer_id = c.trainer_id
     where c.id = course
       and st.supervisor_id = (select auth.uid())
  )
$$;

grant execute on function app.supervises_course(uuid) to authenticated;

-- Read-only for every browser role. Points move only through the triggers
-- above, which run as definer — there is no grant that would let a client
-- write its own score.
revoke all on public.xp_events from anon, authenticated;
grant select on public.xp_events to authenticated;

create policy xp_events_select_self on public.xp_events
  for select to authenticated
  using (trainee_id = (select auth.uid()));

create policy xp_events_select_staff on public.xp_events
  for select to authenticated
  using (
    app.is_admin()
    or (course_id is not null and app.is_trainer_of(course_id))
    or (course_id is not null and app.supervises_course(course_id))
  );

-- trainee_stats could be read by the trainee and by an admin, and by nobody
-- else — so a trainer could not show a class its own standing and a
-- supervisor could not see the team they oversee. Both are the point of the
-- screens they run.
create policy trainee_stats_select_staff on public.trainee_stats
  for select to authenticated
  using (
    exists (
      select 1
        from public.enrollments e
        join public.courses c on c.id = e.course_id
       where e.trainee_id = public.trainee_stats.profile_id
         and (app.is_trainer_of(c.id) or app.supervises_course(c.id))
    )
  );
