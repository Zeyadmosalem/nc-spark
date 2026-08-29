-- Badges and the course leaderboard.
--
-- Both were promised on the Achievements page from M1 and neither existed.
-- They are built on the XP ledger rather than beside it, so there is one
-- record of what somebody did and everything else is derived from it.

-- ---------------------------------------------------------------- badges --
--
-- A catalog table rather than an enum: an administrator adding a badge should
-- not be a migration, and the UI needs a name and a description to render
-- anyway. The CODE is the stable identity; the wording can change.
create table public.badges (
  code        text primary key,
  name        text not null,
  description text not null,
  icon        text not null,
  -- What has to be true. Read by app.evaluate_badges below, which is the only
  -- thing that interprets it.
  sort_order  integer not null default 0
);

alter table public.badges enable row level security;
revoke all on public.badges from anon, authenticated;
grant select on public.badges to authenticated;

-- Everyone may read the catalog: a badge you have not earned yet is the point
-- of having badges, and there is nothing private in a name and a description.
create policy badges_select on public.badges
  for select to authenticated using (true);

insert into public.badges (code, name, description, icon, sort_order) values
  ('first_steps',  'First steps',    'Finished your first activity.',              'spark',        1),
  ('contributor',  'Contributor',    'Joined a course conversation.',              'support',      2),
  ('century',      'Century',        'Earned 100 XP.',                             'achievements', 3),
  ('quiz_ace',     'Quiz ace',       'Scored full marks on a quiz.',               'quiz',         4),
  ('finisher',     'Finisher',       'Completed a whole course.',                  'complete',     5),
  ('week_streak',  'Seven days',     'Earned something seven days running.',       'trend',        6),
  ('five_hundred', 'Five hundred',   'Earned 500 XP.',                             'target',       7);

create table public.trainee_badges (
  trainee_id uuid not null references public.profiles(id) on delete cascade,
  badge_code text not null references public.badges(code) on delete cascade,
  earned_at  timestamptz not null default now(),
  primary key (trainee_id, badge_code)
);

alter table public.trainee_badges enable row level security;
create index trainee_badges_trainee_idx on public.trainee_badges(trainee_id);

-- Read-only for browsers, like xp_events: badges are awarded by the function
-- below and by nothing else.
revoke all on public.trainee_badges from anon, authenticated;
grant select on public.trainee_badges to authenticated;

create policy trainee_badges_select_self on public.trainee_badges
  for select to authenticated
  using (trainee_id = (select auth.uid()));

-- Staff who can already see somebody's XP can see the badges derived from it.
create policy trainee_badges_select_staff on public.trainee_badges
  for select to authenticated
  using (
    app.is_admin()
    or exists (
      select 1
        from public.enrollments e
       where e.trainee_id = public.trainee_badges.trainee_id
         and (app.is_trainer_of(e.course_id) or app.supervises_course(e.course_id))
    )
  );

/**
 * Works out which badges a trainee has earned and records the new ones.
 *
 * Every rule is a question about data that already exists, so a badge can
 * never disagree with the record it came from — and re-running this is
 * harmless, which matters because it runs on every XP award.
 */
create or replace function app.evaluate_badges(trainee uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_xp     integer;
  v_streak integer;
begin
  if trainee is null then return; end if;

  select ts.xp, ts.streak into v_xp, v_streak
    from public.trainee_stats ts where ts.profile_id = trainee;

  insert into public.trainee_badges (trainee_id, badge_code)
  select trainee, code from (
    select 'first_steps' as code
     where exists (select 1 from public.xp_events x
                    where x.trainee_id = trainee and x.kind = 'activity')
    union all
    select 'contributor'
     where exists (select 1 from public.xp_events x
                    where x.trainee_id = trainee and x.kind = 'participation')
    union all
    select 'century'      where coalesce(v_xp, 0) >= 100
    union all
    select 'five_hundred' where coalesce(v_xp, 0) >= 500
    union all
    select 'week_streak'  where coalesce(v_streak, 0) >= 7
    union all
    select 'quiz_ace'
     where exists (
       select 1 from public.quiz_attempts a
        where a.trainee_id = trainee
          and a.passed is true
          and coalesce(a.final_score, a.auto_score, 0) >= 100)
    union all
    select 'finisher'
     where exists (select 1 from public.enrollments e
                    where e.trainee_id = trainee and e.status = 'completed')
  ) earned
  on conflict do nothing;
end;
$$;

-- Hung off the XP ledger, which is the one place that already knows something
-- happened. Awarding badges from each of the three source triggers instead
-- would be three places to keep in step.
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
          when v_last = current_date     then public.trainee_stats.streak
          when v_last = current_date - 1 then public.trainee_stats.streak + 1
          else 1
        end,
        last_active_on = current_date;

  perform app.evaluate_badges(new.trainee_id);
  return new;
end;
$$;

-- Finishing a course is not an XP award, so it needs its own hook or the
-- 'finisher' badge would only arrive on the trainee's NEXT award — which for
-- somebody who has just finished their last course may be never.
create or replace function app.xp_for_enrollment_complete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'completed' and coalesce(old.status, '') <> 'completed' then
    perform app.evaluate_badges(new.trainee_id);
  end if;
  return new;
end;
$$;

create trigger enrollments_badges
  after update on public.enrollments
  for each row execute function app.xp_for_enrollment_complete();

-- ----------------------------------------------------------- leaderboard --
--
-- Standing among the people on one course.
--
-- SECURITY DEFINER on purpose, and the filter is inside the view. xp_events is
-- readable only by its owner and by staff, so an invoker view would show a
-- trainee a leaderboard of one — themselves — which is not a leaderboard. The
-- view therefore reads past RLS and decides for itself who may see what: you
-- must be ON the course, teach it, oversee it, or be an admin.
--
-- What it exposes is a display name, an avatar letter and a total. It joins
-- public_profiles rather than profiles, so no email can leak through it, and
-- it carries no per-award detail — a peer sees that you are ahead, never what
-- you did.
create or replace view public.course_leaderboard
with (security_invoker = false)
as
  select
    e.course_id,
    p.id     as trainee_id,
    p.name,
    p.avatar,
    coalesce(sum(x.points), 0)::int as xp,
    rank() over (
      partition by e.course_id
      order by coalesce(sum(x.points), 0) desc
    )::int as position
    from public.enrollments e
    join public.public_profiles p on p.id = e.trainee_id
    left join public.xp_events x
      on x.trainee_id = e.trainee_id and x.course_id = e.course_id
   where e.status in ('active', 'completed')
     and (
       app.is_admin()
       or app.is_enrolled(e.course_id)
       or app.is_trainer_of(e.course_id)
       or app.supervises_course(e.course_id)
     )
   group by e.course_id, p.id, p.name, p.avatar;

revoke all on public.course_leaderboard from anon, authenticated;
grant select on public.course_leaderboard to authenticated;
