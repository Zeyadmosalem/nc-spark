create table public.enrollments (
  id           uuid primary key default gen_random_uuid(),
  trainee_id   uuid not null references public.profiles(id) on delete cascade,
  course_id    uuid not null references public.courses(id) on delete cascade,
  status       public.enrollment_status not null default 'pending',
  decided_by   uuid references public.profiles(id) on delete set null,
  decided_at   timestamptz,
  completed_at timestamptz,
  created_at   timestamptz not null default now(),
  unique (trainee_id, course_id)
);

alter table public.enrollments enable row level security;
create index enrollments_course_idx  on public.enrollments(course_id);
create index enrollments_trainee_idx on public.enrollments(trainee_id);

-- Completion is an append-only event, not a flag. payload records HOW the
-- activity was completed (scenario choices, matching score), which is what
-- makes a training record auditable rather than merely a tick.
create table public.activity_completions (
  id            uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.enrollments(id) on delete cascade,
  activity_id   uuid not null references public.activities(id) on delete cascade,
  completed_at  timestamptz not null default now(),
  payload       jsonb not null default '{}'::jsonb,
  unique (enrollment_id, activity_id)
);

alter table public.activity_completions enable row level security;
create index activity_completions_enrollment_idx on public.activity_completions(enrollment_id);

create table public.teaching_requests (
  id         uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references public.profiles(id) on delete cascade,
  course_id  uuid not null references public.courses(id) on delete cascade,
  status     public.request_status not null default 'pending',
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.teaching_requests enable row level security;
create index teaching_requests_course_idx on public.teaching_requests(course_id);

-- Only one OPEN request per trainer and course. A denied request may be
-- retried later, so the constraint is partial rather than a plain unique.
create unique index teaching_requests_one_open
  on public.teaching_requests(trainer_id, course_id)
  where status = 'pending';
