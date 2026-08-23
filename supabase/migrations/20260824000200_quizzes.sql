create table public.quizzes (
  id                 uuid primary key default gen_random_uuid(),
  course_id          uuid not null references public.courses(id) on delete cascade,
  -- A module quiz points at its activity, so it inherits M3's unlocking and
  -- progress counting for free. A course final has no activity and is gated
  -- by app.all_modules_complete instead.
  activity_id        uuid unique references public.activities(id) on delete cascade,
  title              text not null check (title <> ''),
  pass_mark          numeric(3,2) not null default 0.70
                       check (pass_mark > 0 and pass_mark <= 1),
  time_limit_seconds integer check (time_limit_seconds is null or time_limit_seconds > 0),
  created_at         timestamptz not null default now()
);

-- At most one course final per course. A partial unique index rather than the
-- EXCLUDE constraint the spec proposed: EXCLUDE with = on uuid needs the
-- btree_gist extension, and this needs nothing installed.
create unique index quizzes_one_final_per_course
  on public.quizzes (course_id) where activity_id is null;

create table public.quiz_questions (
  id       uuid primary key default gen_random_uuid(),
  quiz_id  uuid not null references public.quizzes(id) on delete cascade,
  type     public.question_type not null,
  position integer not null check (position > 0),
  prompt   text not null check (prompt <> ''),
  -- Options are for mcq only, and hold NO correctness information. Nothing in
  -- this table has to be filtered before it reaches a trainee.
  options  jsonb not null default '[]'::jsonb,
  points   integer not null default 1 check (points > 0),
  unique (quiz_id, position),
  constraint mcq_needs_options
    check (type <> 'mcq' or jsonb_array_length(options) >= 2)
);

-- The load-bearing table of this milestone.
--
-- A separate table rather than a column on quiz_questions, so that "a trainee
-- can never read this" is enforced by the absence of a grant rather than by
-- remembering to exclude a column from every select, every view and every
-- embedded read for the rest of the project's life.
create table public.quiz_answer_keys (
  question_id uuid primary key references public.quiz_questions(id) on delete cascade,
  -- mcq: {"index": 2}  truefalse: {"value": true}  paragraph: {"guidance": "..."}
  answer      jsonb not null,
  explanation text
);

alter table public.quizzes          enable row level security;
alter table public.quiz_questions   enable row level security;
alter table public.quiz_answer_keys enable row level security;
