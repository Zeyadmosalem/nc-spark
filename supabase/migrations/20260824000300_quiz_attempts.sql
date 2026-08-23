create table public.quiz_attempts (
  id            uuid primary key default gen_random_uuid(),
  quiz_id       uuid not null references public.quizzes(id) on delete cascade,
  trainee_id    uuid not null references public.profiles(id) on delete cascade,
  enrollment_id uuid not null references public.enrollments(id) on delete cascade,
  -- Declared here. The spec's unique index referenced attempt_no without the
  -- table ever defining it. One attempt is the rule; a granted retake becomes
  -- attempt 2, so the history of both survives rather than being overwritten.
  attempt_no    integer not null default 1 check (attempt_no > 0),
  status        public.attempt_status not null default 'in_progress',
  started_at    timestamptz not null default now(),
  submitted_at  timestamptz,
  graded_at     timestamptz,
  graded_by     uuid references public.profiles(id) on delete set null,
  auto_score    numeric(5,2),   -- mcq + truefalse only
  final_score   numeric(5,2),   -- after any paragraph grading
  passed        boolean,
  unique (quiz_id, trainee_id, attempt_no)
);

create table public.quiz_answers (
  id          uuid primary key default gen_random_uuid(),
  attempt_id  uuid not null references public.quiz_attempts(id) on delete cascade,
  question_id uuid not null references public.quiz_questions(id) on delete cascade,
  response    jsonb not null,
  -- null while a paragraph is ungraded, so "not yet marked" stays
  -- distinguishable from "marked wrong".
  is_correct  boolean,
  awarded     integer,
  comment     text,
  unique (attempt_id, question_id)
);

-- A retake is evidence, not a flag. on delete restrict on granted_by means the
-- person who authorised it cannot be erased from the record.
create table public.quiz_retake_grants (
  id          uuid primary key default gen_random_uuid(),
  quiz_id     uuid not null references public.quizzes(id) on delete cascade,
  trainee_id  uuid not null references public.profiles(id) on delete cascade,
  granted_by  uuid not null references public.profiles(id) on delete restrict,
  reason      text,
  consumed_at timestamptz,
  created_at  timestamptz not null default now()
);

create index quiz_attempts_trainee  on public.quiz_attempts (trainee_id, quiz_id);
create index quiz_attempts_review   on public.quiz_attempts (status) where status = 'pending_review';
create index quiz_retake_unconsumed on public.quiz_retake_grants (quiz_id, trainee_id)
  where consumed_at is null;

alter table public.quiz_attempts      enable row level security;
alter table public.quiz_answers       enable row level security;
alter table public.quiz_retake_grants enable row level security;
