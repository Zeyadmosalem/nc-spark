# M4 Assessment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move quiz grading entirely server-side so an answer key never reaches a browser, and give trainers the review queue that the one-attempt and paragraph-blocking rules make mandatory.

**Architecture:** Answer keys live in their own table with no grant to `authenticated` at all. `start-quiz` opens a timed attempt and returns answer-free questions; `submit-quiz` grades against the key and records an activity completion only on a pass. A quiz containing a paragraph goes to `pending_review` and completes nothing until a trainer grades it.

**Tech Stack:** Supabase (Postgres 17, Edge Functions on Deno), `@supabase/supabase-js` v2, React 19, TanStack Query v5, Vitest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-08-23-m4-assessment-design.md`

## Corrections to the spec, found while writing this plan

Two pieces of SQL in the spec do not work as written. Fixed here, not carried forward:

1. `exclude (course_id with =) where (activity_id is null)` needs the `btree_gist` extension for uuid equality. A partial unique index does the same job with no extension: `create unique index ... on quizzes (course_id) where activity_id is null`.
2. The spec's unique index references `quiz_attempts.attempt_no`, but the table definition never declares that column. Added, defaulting to 1.

## Progress

| Task | Status | Correction found during execution |
|---|---|---|
| 1. Quiz content schema | Done | Spec's EXCLUDE constraint needed btree_gist; a partial unique index does the job with nothing installed. |
| 2. Attempts and grants | Done | Spec's unique index referenced `attempt_no`, which the table never declared. |
| 3. Helpers | Done | A vacuous `not exists` would have let a nonexistent enrollment unlock a final; guarded with a trailing `exists`. |
| 4. RLS and answer-key lockdown | Done | `app.supervises()` takes a TRAINER id; the policies passed a trainee id, so a supervisor saw nothing. Fixed with `app.quiz_trainer()`. Mutation-verified: leaking the key fails 7 red-team tests. |
| 5. `start-quiz` | Done | Mutation-verified: embedding `quiz_answer_keys` in the question select fails exactly the payload-walking test. |
| 6. `submit-quiz` | Done | Mutation-verified: making grading always-true fails 4 tests, including "records NOTHING on a fail". |
| 7. Review, retakes, superseded rule | Done | New test confirmed failing against the old deployment before deploying the fix. The M3 test for a course with no final stands unchanged. |
| 8. API and hooks | Done | Fixed a flake the code splitting introduced: `asyncUtilTimeout` was 1000ms, tuned for eager imports. |
| 9. `QuizPage` | Done | The negative is asserted from `document.body.textContent`, not from props. |
| 10. Trainer review queue | Done | Three bugs, two of them only visible after raising `testTimeout` above `asyncUtilTimeout` — they had been reported as a bare timeout. |
| 11. Migrate `q1`, strip the bundle | Done | Seeder matches courses by slug; matching the dummy id would have reported success while seeding nothing. |
| 12. Verification | Done | Mutation-verified: re-introducing one explanation into dummyData makes the bundle grep fail and the script exit non-zero. |
| 13. Notifications | **Not done** | The approved "full review queue" option said "plus notifications". The queues and actions shipped; notifications did not. Tracked, not hidden. |

**Result:** 233 frontend tests, 338 database tests, 30 live checks in
`npm run verify:m4`, all passing.

### Known and accepted

Scenario activities send `isCorrect` to the browser and grade client-side.
Same vulnerability class as the quiz leak, materially lower severity: a
scenario completes via "Mark as Complete", so correctness gates nothing — it
is formative practice, not assessment, and instant feedback requires the
answer client-side. Reviewed and deliberately left.


## Global Constraints

Everything from M1–M3 still applies. The ones that bite hardest here:

- Every `SECURITY DEFINER` function MUST declare `SET search_path = ''` and use fully qualified names.
- **A `security invoker` function cannot reach schema `app` as `service_role`.** Edge Function entry points must be `security definer`.
- **`revoke ... from public` does NOT lock out `authenticated`.** Supabase's default privileges grant EXECUTE directly to that role; name `anon` and `authenticated` explicitly.
- **Prefer column-limited grants.** A `WITH CHECK` that does not mention a column does not protect it.
- Edge Functions verify the caller by re-reading `profiles`, never by trusting a JWT claim.
- `audit_log` is append-only and cannot be cleaned between runs; scope assertions to a per-run unique value.
- Test suites delete by a prefix they own.
- Apply migrations with `npx supabase db push --db-url "$(grep '^SUPABASE_DB_URL=' .env.test | cut -d= -f2-)"`; deploy with `npx supabase functions deploy <name> --project-ref hwlsbcgvxozxsjmojgxe --use-api`.
- Arbitrary SQL against the project (for mutation testing) goes through the Management API, not a throwaway migration.
- **183 frontend and 222 database tests must pass after every task.**

---

## File Structure

**Migrations**

| File | Responsibility |
|---|---|
| `20260824000100_quiz_enums.sql` | `question_type`, `attempt_status` |
| `20260824000200_quizzes.sql` | `quizzes`, `quiz_questions`, `quiz_answer_keys` |
| `20260824000300_quiz_attempts.sql` | `quiz_attempts`, `quiz_answers`, `quiz_retake_grants` |
| `20260824000400_quiz_helpers.sql` | unlock + grant helpers, service-role entry points |
| `20260824000500_quiz_rls.sql` | policies and grants for all six tables |

**Edge Functions:** `start-quiz`, `submit-quiz`, `grade-paragraph`, `grant-retake`, plus changes to `complete-activity`.

**Frontend**

| File | Responsibility |
|---|---|
| `src/api/quizzes.js` | Start, submit, and read attempts |
| `src/hooks/useQuizzes.js` | Query and mutation wrappers |
| `src/pages/trainee/QuizPage.jsx` | Server-driven quiz run |
| `src/pages/trainer/TrainerReview.jsx` | Grade paragraphs, grant retakes |
| `src/data/dummyData.js` | Answers stripped |

---

## Task 1: Quiz content schema and the answer-key lockdown

**Files:**
- Create: `supabase/migrations/20260824000100_quiz_enums.sql`
- Create: `supabase/migrations/20260824000200_quizzes.sql`
- Create: `supabase/tests/quiz-schema.test.js`

**Interfaces:**
- Consumes: `courses`, `activities` from M2
- Produces: tables `quizzes`, `quiz_questions`, `quiz_answer_keys`

- [ ] **Step 1: Write the failing test**

Create `supabase/tests/quiz-schema.test.js`:

```javascript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { serviceClient, createUser, resetDb, uniqueEmail } from './helpers.js';

const svc = serviceClient();
const PREFIX = `qs${Date.now()}`;
let trainer, courseId, activityId, quizId;

beforeAll(async () => {
  await resetDb();
  trainer = await createUser({ email: uniqueEmail(), role: 'trainer' });
  const { data: c } = await svc.from('courses').insert({
    slug: `${PREFIX}-1`, title: 'Quiz Course', trainer_id: trainer.id, created_by: trainer.id,
  }).select().single();
  courseId = c.id;
  const { data: m } = await svc.from('modules')
    .insert({ course_id: courseId, title: 'M', position: 1 }).select().single();
  const { data: a } = await svc.from('activities')
    .insert({ module_id: m.id, type: 'quiz', title: 'Mini Quiz', position: 1, content: {} })
    .select().single();
  activityId = a.id;
});
afterAll(async () => {
  await svc.from('courses').delete().like('slug', `${PREFIX}-%`);
  await resetDb();
});

describe('quizzes', () => {
  it('creates a module quiz bound to an activity', async () => {
    const { data, error } = await svc.from('quizzes')
      .insert({ course_id: courseId, activity_id: activityId, title: 'Mini Quiz' })
      .select().single();
    expect(error).toBeNull();
    expect(Number(data.pass_mark)).toBe(0.7);
    quizId = data.id;
  });

  it('rejects a pass mark above 1', async () => {
    const { error } = await svc.from('quizzes')
      .insert({ course_id: courseId, title: 'Bad', pass_mark: 1.5 });
    expect(error).not.toBeNull();
  });

  it('allows one course final', async () => {
    const { error } = await svc.from('quizzes')
      .insert({ course_id: courseId, title: 'Final' });
    expect(error).toBeNull();
  });

  it('REJECTS a second course final', async () => {
    const { error } = await svc.from('quizzes')
      .insert({ course_id: courseId, title: 'Final Two' });
    expect(error).not.toBeNull();
  });

  it('rejects two quizzes on one activity', async () => {
    const { error } = await svc.from('quizzes')
      .insert({ course_id: courseId, activity_id: activityId, title: 'Duplicate' });
    expect(error).not.toBeNull();
  });
});

describe('quiz_questions', () => {
  it('stores an mcq with options', async () => {
    const { error } = await svc.from('quiz_questions').insert({
      quiz_id: quizId, type: 'mcq', position: 1,
      prompt: 'Which loop runs at least once?', options: ['for', 'while', 'do...while'],
    });
    expect(error).toBeNull();
  });

  it('REJECTS an mcq with fewer than two options', async () => {
    const { error } = await svc.from('quiz_questions').insert({
      quiz_id: quizId, type: 'mcq', position: 90, prompt: 'Broken', options: ['only'],
    });
    expect(error).not.toBeNull();
  });

  it('stores a truefalse with no options', async () => {
    const { error } = await svc.from('quiz_questions').insert({
      quiz_id: quizId, type: 'truefalse', position: 2, prompt: 'for...of iterates objects',
    });
    expect(error).toBeNull();
  });

  it('rejects two questions at the same position', async () => {
    const { error } = await svc.from('quiz_questions').insert({
      quiz_id: quizId, type: 'truefalse', position: 1, prompt: 'Clash',
    });
    expect(error).not.toBeNull();
  });

  it('cascades questions when the quiz is deleted', async () => {
    const { data: q } = await svc.from('quizzes')
      .insert({ course_id: courseId, title: 'Temp', activity_id: null }).select().maybeSingle();
    if (!q) return; // the one-final rule may reject this; that is covered above
    await svc.from('quizzes').delete().eq('id', q.id);
    const { data } = await svc.from('quiz_questions').select('id').eq('quiz_id', q.id);
    expect(data ?? []).toHaveLength(0);
  });
});

describe('quiz_answer_keys', () => {
  it('stores a key against a question', async () => {
    const { data: q } = await svc.from('quiz_questions')
      .select('id').eq('quiz_id', quizId).eq('position', 1).single();
    const { error } = await svc.from('quiz_answer_keys')
      .insert({ question_id: q.id, answer: { index: 2 }, explanation: 'do...while checks after.' });
    expect(error).toBeNull();
  });

  it('cascades when the question is deleted', async () => {
    const { data: q } = await svc.from('quiz_questions').insert({
      quiz_id: quizId, type: 'truefalse', position: 50, prompt: 'Temp',
    }).select().single();
    await svc.from('quiz_answer_keys').insert({ question_id: q.id, answer: { value: true } });
    await svc.from('quiz_questions').delete().eq('id', q.id);
    const { data } = await svc.from('quiz_answer_keys').select('question_id').eq('question_id', q.id);
    expect(data ?? []).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:db -- quiz-schema`
Expected: FAIL — relation `quizzes` does not exist

- [ ] **Step 3: Write the enums migration**

Create `supabase/migrations/20260824000100_quiz_enums.sql`:

```sql
create type public.question_type  as enum ('mcq','truefalse','paragraph');
create type public.attempt_status as enum ('in_progress','pending_review','passed','failed','expired');
```

- [ ] **Step 4: Write the tables migration**

Create `supabase/migrations/20260824000200_quizzes.sql`:

```sql
create table public.quizzes (
  id                 uuid primary key default gen_random_uuid(),
  course_id          uuid not null references public.courses(id) on delete cascade,
  -- A module quiz points at its activity. A course final has no activity.
  activity_id        uuid unique references public.activities(id) on delete cascade,
  title              text not null check (title <> ''),
  pass_mark          numeric(3,2) not null default 0.70
                       check (pass_mark > 0 and pass_mark <= 1),
  time_limit_seconds integer check (time_limit_seconds is null or time_limit_seconds > 0),
  created_at         timestamptz not null default now()
);

-- At most one course final per course. A partial unique index rather than the
-- EXCLUDE constraint the spec proposed: EXCLUDE with = on uuid needs btree_gist.
create unique index quizzes_one_final_per_course
  on public.quizzes (course_id) where activity_id is null;

create table public.quiz_questions (
  id       uuid primary key default gen_random_uuid(),
  quiz_id  uuid not null references public.quizzes(id) on delete cascade,
  type     public.question_type not null,
  position integer not null check (position > 0),
  prompt   text not null check (prompt <> ''),
  -- Options for mcq only, and NEVER correctness information. Nothing in this
  -- table needs filtering before it reaches a trainee.
  options  jsonb not null default '[]'::jsonb,
  points   integer not null default 1 check (points > 0),
  unique (quiz_id, position),
  constraint mcq_needs_options
    check (type <> 'mcq' or jsonb_array_length(options) >= 2)
);

-- The load-bearing table of this milestone. A separate table rather than a
-- column, so "a trainee can never read this" is enforced by the absence of a
-- grant, not by remembering to exclude a column from every select.
create table public.quiz_answer_keys (
  question_id uuid primary key references public.quiz_questions(id) on delete cascade,
  -- mcq: {"index": 2}  truefalse: {"value": true}  paragraph: {"guidance": "..."}
  answer      jsonb not null,
  explanation text
);

alter table public.quizzes          enable row level security;
alter table public.quiz_questions   enable row level security;
alter table public.quiz_answer_keys enable row level security;
```

- [ ] **Step 5: Apply and run tests**

```bash
npx supabase db push --db-url "$(grep '^SUPABASE_DB_URL=' .env.test | cut -d= -f2-)"
npm run test:db -- quiz-schema
```
Expected: PASS (12 tests)

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260824000100_quiz_enums.sql \
        supabase/migrations/20260824000200_quizzes.sql \
        supabase/tests/quiz-schema.test.js
git commit -m "feat(db): add quiz content tables with a separate answer-key table"
```

---

## Task 2: Attempts, answers and retake grants

**Files:**
- Create: `supabase/migrations/20260824000300_quiz_attempts.sql`
- Create: `supabase/tests/quiz-attempts-schema.test.js`

**Interfaces:**
- Consumes: `quizzes`, `quiz_questions` from Task 1; `enrollments`, `profiles`
- Produces: `quiz_attempts`, `quiz_answers`, `quiz_retake_grants`

- [ ] **Step 1: Write the failing test**

Create `supabase/tests/quiz-attempts-schema.test.js` covering:
- an attempt defaults to `in_progress` with `attempt_no` 1 and a `started_at`
- a second attempt at the same `attempt_no` for one trainee and quiz is rejected
- `attempt_no` 2 is allowed, so a granted retake has somewhere to live
- one answer per question per attempt (unique)
- deleting an attempt cascades its answers
- a retake grant records `granted_by` and cannot be inserted without one
- `granted_by` uses `on delete restrict`, so the grantor cannot be erased from the record

```javascript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { serviceClient, createUser, resetDb, uniqueEmail } from './helpers.js';

const svc = serviceClient();
const PREFIX = `qa${Date.now()}`;
let trainer, trainee, courseId, quizId, questionId, enrollmentId;

beforeAll(async () => {
  await resetDb();
  trainer = await createUser({ email: uniqueEmail(), role: 'trainer' });
  trainee = await createUser({ email: uniqueEmail(), role: 'trainee' });
  const { data: c } = await svc.from('courses').insert({
    slug: `${PREFIX}-1`, title: 'Attempt Course', status: 'published',
    trainer_id: trainer.id, created_by: trainer.id,
  }).select().single();
  courseId = c.id;
  const { data: qz } = await svc.from('quizzes')
    .insert({ course_id: courseId, title: 'Final' }).select().single();
  quizId = qz.id;
  const { data: qq } = await svc.from('quiz_questions').insert({
    quiz_id: quizId, type: 'truefalse', position: 1, prompt: 'True?',
  }).select().single();
  questionId = qq.id;
  const { data: e } = await svc.from('enrollments')
    .insert({ trainee_id: trainee.id, course_id: courseId, status: 'active' }).select().single();
  enrollmentId = e.id;
});
afterAll(async () => {
  await svc.from('courses').delete().like('slug', `${PREFIX}-%`);
  await resetDb();
});

const attempt = (over = {}) => ({
  quiz_id: quizId, trainee_id: trainee.id, enrollment_id: enrollmentId, ...over,
});

describe('quiz_attempts', () => {
  let firstId;

  it('defaults to in_progress, attempt 1, with a start time', async () => {
    const { data, error } = await svc.from('quiz_attempts').insert(attempt()).select().single();
    expect(error).toBeNull();
    expect(data.status).toBe('in_progress');
    expect(data.attempt_no).toBe(1);
    expect(data.started_at).not.toBeNull();
    firstId = data.id;
  });

  it('REJECTS a second attempt at the same number', async () => {
    const { error } = await svc.from('quiz_attempts').insert(attempt());
    expect(error).not.toBeNull();
  });

  it('allows attempt 2, which is where a granted retake lives', async () => {
    const { error } = await svc.from('quiz_attempts').insert(attempt({ attempt_no: 2 }));
    expect(error).toBeNull();
    await svc.from('quiz_attempts').delete().eq('quiz_id', quizId).eq('attempt_no', 2);
  });

  it('stores one answer per question', async () => {
    const { error } = await svc.from('quiz_answers')
      .insert({ attempt_id: firstId, question_id: questionId, response: { value: true } });
    expect(error).toBeNull();
  });

  it('rejects a second answer to the same question', async () => {
    const { error } = await svc.from('quiz_answers')
      .insert({ attempt_id: firstId, question_id: questionId, response: { value: false } });
    expect(error).not.toBeNull();
  });

  it('cascades answers when the attempt is deleted', async () => {
    await svc.from('quiz_attempts').delete().eq('id', firstId);
    const { data } = await svc.from('quiz_answers').select('id').eq('attempt_id', firstId);
    expect(data ?? []).toHaveLength(0);
  });
});

describe('quiz_retake_grants', () => {
  it('records who granted it', async () => {
    const { data, error } = await svc.from('quiz_retake_grants').insert({
      quiz_id: quizId, trainee_id: trainee.id, granted_by: trainer.id, reason: 'Connection dropped',
    }).select().single();
    expect(error).toBeNull();
    expect(data.granted_by).toBe(trainer.id);
    expect(data.consumed_at).toBeNull();
  });

  it('cannot be inserted without a grantor', async () => {
    const { error } = await svc.from('quiz_retake_grants')
      .insert({ quiz_id: quizId, trainee_id: trainee.id });
    expect(error).not.toBeNull();
  });

  // The grant is compliance evidence: "who let this person retake the fire
  // safety assessment" must stay answerable.
  it('REFUSES to delete the grantor while a grant survives', async () => {
    const { error } = await svc.auth.admin.deleteUser(trainer.id);
    expect(error).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:db -- quiz-attempts-schema`
Expected: FAIL — relation `quiz_attempts` does not exist

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260824000300_quiz_attempts.sql`:

```sql
create table public.quiz_attempts (
  id            uuid primary key default gen_random_uuid(),
  quiz_id       uuid not null references public.quizzes(id) on delete cascade,
  trainee_id    uuid not null references public.profiles(id) on delete cascade,
  enrollment_id uuid not null references public.enrollments(id) on delete cascade,
  -- Declared here; the spec's unique index referenced it without defining it.
  attempt_no    integer not null default 1 check (attempt_no > 0),
  status        public.attempt_status not null default 'in_progress',
  started_at    timestamptz not null default now(),
  submitted_at  timestamptz,
  graded_at     timestamptz,
  graded_by     uuid references public.profiles(id) on delete set null,
  auto_score    numeric(5,2),
  final_score   numeric(5,2),
  passed        boolean,
  unique (quiz_id, trainee_id, attempt_no)
);

create table public.quiz_answers (
  id          uuid primary key default gen_random_uuid(),
  attempt_id  uuid not null references public.quiz_attempts(id) on delete cascade,
  question_id uuid not null references public.quiz_questions(id) on delete cascade,
  response    jsonb not null,
  is_correct  boolean,   -- null while a paragraph is ungraded
  awarded     integer,
  comment     text,      -- trainer feedback on a paragraph
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

create index quiz_attempts_trainee   on public.quiz_attempts (trainee_id, quiz_id);
create index quiz_attempts_review    on public.quiz_attempts (status) where status = 'pending_review';
create index quiz_retake_unconsumed  on public.quiz_retake_grants (quiz_id, trainee_id) where consumed_at is null;

alter table public.quiz_attempts      enable row level security;
alter table public.quiz_answers       enable row level security;
alter table public.quiz_retake_grants enable row level security;
```

- [ ] **Step 4: Apply and run tests**

```bash
npx supabase db push --db-url "$(grep '^SUPABASE_DB_URL=' .env.test | cut -d= -f2-)"
npm run test:db -- quiz-attempts-schema
```
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260824000300_quiz_attempts.sql \
        supabase/tests/quiz-attempts-schema.test.js
git commit -m "feat(db): add quiz attempts, answers and retake grants"
```

---

## Task 3: Helpers and service-role entry points

**Files:**
- Create: `supabase/migrations/20260824000400_quiz_helpers.sql`
- Create: `supabase/tests/quiz-helpers.test.js`

**Interfaces:**
- Produces:
  - `app.quiz_course(quiz uuid) returns uuid`
  - `app.all_modules_complete(enrollment uuid) returns boolean`
  - `app.has_unconsumed_retake(quiz uuid, trainee uuid) returns boolean`
  - `public.all_modules_complete_for(enrollment uuid) returns boolean` — service_role only
  - `public.has_unconsumed_retake_for(quiz uuid, trainee uuid) returns boolean` — service_role only

- [ ] **Step 1: Write the failing test**

Create `supabase/tests/quiz-helpers.test.js` asserting:
- `all_modules_complete_for` is false with activities outstanding, true when every activity in every module has a completion
- it is true for a course with no activities at all (vacuous, matching `is_module_unlocked`)
- `has_unconsumed_retake_for` is false with no grant, true with one, false once `consumed_at` is set
- neither is callable by `authenticated`

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:db -- quiz-helpers`
Expected: FAIL — function does not exist

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260824000400_quiz_helpers.sql`:

```sql
create or replace function app.quiz_course(quiz uuid)
returns uuid
language sql stable security definer set search_path = ''
as $$ select q.course_id from public.quizzes q where q.id = quiz $$;

-- Gate for the course final: every activity in every module of the course has
-- a completion for THIS enrollment. `not exists` over no rows is true, so a
-- course with no activities does not become permanently un-finishable —
-- the same choice app.is_module_unlocked makes.
create or replace function app.all_modules_complete(enrollment uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select not exists (
    select 1
      from public.enrollments e
      join public.modules m    on m.course_id = e.course_id
      join public.activities a on a.module_id = m.id
     where e.id = enrollment
       and not exists (
         select 1 from public.activity_completions ac
          where ac.enrollment_id = e.id and ac.activity_id = a.id
       )
  )
  and exists (select 1 from public.enrollments e where e.id = enrollment)
$$;

create or replace function app.has_unconsumed_retake(quiz uuid, trainee uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.quiz_retake_grants g
     where g.quiz_id = quiz and g.trainee_id = trainee and g.consumed_at is null
  )
$$;

grant execute on function app.quiz_course(uuid)                to authenticated;
grant execute on function app.all_modules_complete(uuid)       to authenticated;
grant execute on function app.has_unconsumed_retake(uuid,uuid) to authenticated;

-- Service-role entry points. security definer, because a security invoker
-- function cannot reach schema app as service_role. Both name anon and
-- authenticated in the revoke: revoking from public does not remove the
-- default privilege Supabase grants those roles directly.
create or replace function public.all_modules_complete_for(enrollment uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$ select app.all_modules_complete(enrollment) $$;
revoke all on function public.all_modules_complete_for(uuid) from public, anon, authenticated;
grant execute on function public.all_modules_complete_for(uuid) to service_role;

create or replace function public.has_unconsumed_retake_for(quiz uuid, trainee uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$ select app.has_unconsumed_retake(quiz, trainee) $$;
revoke all on function public.has_unconsumed_retake_for(uuid,uuid) from public, anon, authenticated;
grant execute on function public.has_unconsumed_retake_for(uuid,uuid) to service_role;
```

- [ ] **Step 4: Apply, run tests, commit**

```bash
npx supabase db push --db-url "$(grep '^SUPABASE_DB_URL=' .env.test | cut -d= -f2-)"
npm run test:db -- quiz-helpers
git add supabase/migrations/20260824000400_quiz_helpers.sql supabase/tests/quiz-helpers.test.js
git commit -m "feat(db): add quiz unlock and retake helpers"
```

---

## Task 4: RLS — and the answer-key red team

This is the task the milestone exists for. It gets the largest test suite.

**Files:**
- Create: `supabase/migrations/20260824000500_quiz_rls.sql`
- Create: `supabase/tests/rls-quizzes.test.js`

- [ ] **Step 1: Write the failing test**

Create `supabase/tests/rls-quizzes.test.js`. It must cover, at minimum:

**RED TEAM: the answer key**
- a trainee selecting `quiz_answer_keys` gets an **error**, not an empty array — an empty array would mean a policy is filtering, which someone could later widen
- an enrolled trainee gets an error too; enrollment grants nothing here
- an embedded read (`quiz_questions?select=*,quiz_answer_keys(*)`) fails
- an unrelated trainer gets an error
- the owning trainer gets an error on direct table access as well; they read keys only through a function
- `service_role` can read it

**RED TEAM: attempts**
- a trainee cannot INSERT a `quiz_attempts` row
- a trainee cannot UPDATE `passed`, `final_score` or `auto_score` on their own attempt
- a trainee cannot INSERT into `quiz_answers` directly
- a trainee cannot INSERT a `quiz_retake_grants` row for themselves
- a trainee cannot read another trainee's attempt

**Legitimate access**
- an enrolled trainee reads `quizzes` and `quiz_questions` for their course
- an unenrolled user reads neither
- a trainee reads their own attempt and its answers
- the owning trainer reads attempts on their course
- a supervisor reads attempts for a managed trainer's course
- an admin reads every attempt

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:db -- rls-quizzes`
Expected: FAIL. **Note the vacuous-pass trap:** with RLS on and no policies, every deny test passes for the wrong reason. The deny tests only become meaningful once the allow tests pass alongside them. Do not treat a green deny suite as evidence until the legitimate-access tests are also green.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260824000500_quiz_rls.sql`:

```sql
-- ---------- quizzes ----------
revoke all on public.quizzes from anon, authenticated;
grant select on public.quizzes to authenticated;

create policy quizzes_select on public.quizzes
  for select to authenticated
  using (
    app.is_admin()
    or app.is_trainer_of(course_id)
    or app.is_enrolled(course_id)
  );

-- ---------- quiz_questions ----------
revoke all on public.quiz_questions from anon, authenticated;
grant select on public.quiz_questions to authenticated;

create policy quiz_questions_select on public.quiz_questions
  for select to authenticated
  using (
    app.is_admin()
    or app.is_trainer_of(app.quiz_course(quiz_id))
    or app.is_enrolled(app.quiz_course(quiz_id))
  );

-- ---------- quiz_answer_keys ----------
-- No grant and no policy for authenticated. Deliberately not a restrictive
-- policy: the absence of a grant means a select fails with a permission error
-- rather than returning an empty set, so a mistake here is loud.
revoke all on public.quiz_answer_keys from anon, authenticated;

-- ---------- quiz_attempts ----------
-- SELECT only. Every write goes through an Edge Function, so there is no
-- column a trainee could set on themselves.
revoke all on public.quiz_attempts from anon, authenticated;
grant select on public.quiz_attempts to authenticated;

create policy quiz_attempts_select on public.quiz_attempts
  for select to authenticated
  using (
    trainee_id = (select auth.uid())
    or app.is_admin()
    or app.is_trainer_of(app.quiz_course(quiz_id))
    or app.supervises(trainee_id)
  );

-- ---------- quiz_answers ----------
revoke all on public.quiz_answers from anon, authenticated;
grant select on public.quiz_answers to authenticated;

create policy quiz_answers_select on public.quiz_answers
  for select to authenticated
  using (exists (
    select 1 from public.quiz_attempts t
     where t.id = attempt_id
       and (
         t.trainee_id = (select auth.uid())
         or app.is_admin()
         or app.is_trainer_of(app.quiz_course(t.quiz_id))
         or app.supervises(t.trainee_id)
       )
  ));

-- ---------- quiz_retake_grants ----------
revoke all on public.quiz_retake_grants from anon, authenticated;
grant select on public.quiz_retake_grants to authenticated;

create policy quiz_retake_grants_select on public.quiz_retake_grants
  for select to authenticated
  using (
    trainee_id = (select auth.uid())
    or app.is_admin()
    or app.is_trainer_of(app.quiz_course(quiz_id))
  );
```

- [ ] **Step 4: Apply and run the full database suite**

```bash
npx supabase db push --db-url "$(grep '^SUPABASE_DB_URL=' .env.test | cut -d= -f2-)"
npm run test:db
```
Expected: all pass, including the 222 from M3.

- [ ] **Step 5: Mutation-test the answer-key lockdown**

This is the claim the milestone rests on, so prove the test would catch its
absence. Through the Management API, grant `select` on `quiz_answer_keys` to
`authenticated` and add a permissive policy, re-run `rls-quizzes`, confirm the
red-team tests FAIL, then revoke and confirm they pass again.

```
grant select on public.quiz_answer_keys to authenticated;
create policy tmp_leak on public.quiz_answer_keys for select to authenticated using (true);
-- run tests, expect failures
drop policy tmp_leak on public.quiz_answer_keys;
revoke all on public.quiz_answer_keys from authenticated;
```

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260824000500_quiz_rls.sql supabase/tests/rls-quizzes.test.js
git commit -m "feat(db): lock quiz answer keys away from every browser role"
```

---

## Task 5: `start-quiz`

**Files:**
- Create: `supabase/functions/start-quiz/index.ts`
- Create: `supabase/tests/fn-start-quiz.test.js`

**Interfaces:**
- Produces: `POST /functions/v1/start-quiz` body `{ quizId }` → `{ ok, attempt: { id, attemptNo, startedAt, deadline }, questions: [{ id, type, position, prompt, options, points }] }`

Rules the tests must pin down:
- 403 for a trainee not enrolled on the quiz's course
- 423 for a module quiz whose module is locked
- 423 for a course final when `all_modules_complete_for` is false
- 409 when an attempt already exists and no unconsumed retake grant does
- 200 with `attempt_no: 2` when a grant exists, and the grant is marked `consumed_at`
- the returned questions contain **no** `answer` and **no** `explanation` key, asserted by walking the whole JSON payload
- `deadline` is `started_at + time_limit_seconds`, and null when the quiz has no limit
- re-calling while `in_progress` returns the SAME attempt rather than creating a second

- [ ] **Steps:** write the failing test, run it (expect 404, function absent), write the function, deploy with `npx supabase functions deploy start-quiz --project-ref hwlsbcgvxozxsjmojgxe --use-api`, re-run, commit.

The function skeleton follows the established `_shared` pattern:

```typescript
import { requireRole, readJson, jsonResponse, errorResponse, HttpError } from '../_shared/auth.ts';
import { corsHeaders, handleOptions } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  try {
    const { profile: actor, service } = await requireRole(req, ['trainee']);
    const { quizId } = await readJson(req) as { quizId?: string };
    if (!quizId) throw new HttpError(400, 'quizId is required');
    // …resolve quiz, enrollment, unlock state, existing attempt, retake grant…
    // …select questions WITHOUT joining quiz_answer_keys…
  } catch (err) {
    return errorResponse(err, corsHeaders);
  }
});
```

**The question select must name its columns** — `id, type, position, prompt, options, points` — never `*`, and never an embed of `quiz_answer_keys`.

---

## Task 6: `submit-quiz`

**Files:**
- Create: `supabase/functions/submit-quiz/index.ts`
- Create: `supabase/tests/fn-submit-quiz.test.js`

**Interfaces:**
- Produces: `POST /functions/v1/submit-quiz` body `{ attemptId, answers: [{ questionId, response }] }` → `{ ok, status, score, passed, perQuestion: [{ questionId, isCorrect }] }`

Rules the tests must pin down:
- grades mcq by `answer.index` and truefalse by `answer.value`, server-side
- **the response carries no correct answer and no explanation** — asserted by walking the JSON
- a paragraph present → `status: 'pending_review'`, `passed` null, and **no** `activity_completions` row
- no paragraph → pass/fail against `pass_mark`
- passing a module quiz records the activity completion; failing records nothing
- passing a course final sets the enrollment to `completed`
- submitting after the deadline → `status: 'expired'`, graded on what arrived
- submitting an attempt that is not `in_progress` → 409
- submitting somebody else's attempt → 403
- an unanswered question scores zero rather than erroring
- a response for a question not in this quiz is ignored, not stored

- [ ] **Steps:** failing test → deploy → pass → **mutation-test the grading**: make the comparison always return true, redeploy, confirm a wrong-answer test fails, restore.

---

## Task 7: `grade-paragraph`, `grant-retake`, and the superseded completion rule

**Files:**
- Create: `supabase/functions/grade-paragraph/index.ts`
- Create: `supabase/functions/grant-retake/index.ts`
- Modify: `supabase/functions/complete-activity/index.ts`
- Create: `supabase/tests/fn-quiz-review.test.js`
- Modify: `supabase/tests/fn-complete-activity.test.js`

**The superseded rule.** M3's `complete-activity` sets an enrollment to
`completed` at 100% of activities. For a course that has a final, 100% must now
only *unlock* the final. `complete-activity` gains a check: if the course has a
row in `quizzes` with `activity_id is null`, do not complete the enrollment.

The existing M3 test `marks the enrollment completed once every activity is
done` still describes correct behaviour for a course with no final, so it stays
as-is. A new test covers a course **with** a final, asserting the enrollment
stays `active` at 100%.

Rules for the two new functions:
- `grade-paragraph`: owning trainer or admin only; 403 for an unrelated trainer; grading the last paragraph recomputes `final_score`, sets `passed`, and records the completion if passed; writes `audit_log`
- `grant-retake`: owning trainer or admin only; 409 if the trainee has no failed or expired attempt; writes `audit_log`; a trainee calling it gets 403
- **red team:** a trainee cannot grant themselves a retake through the function or the table

---

## Task 8: Frontend api and hooks

**Files:**
- Create: `src/api/quizzes.js`, `src/api/quizzes.test.js`
- Create: `src/hooks/useQuizzes.js`, `src/hooks/useQuizzes.test.jsx`

Following the M3 conventions established in the audit: `requireClient()`, shared
`unwrap`/`invokeFn` from `./helpers`, named columns, camelCase mapping in the api
layer only.

```javascript
export const startQuiz  = (quizId) => invokeFn('start-quiz',  { quizId });
export const submitQuiz = (attemptId, answers) => invokeFn('submit-quiz', { attemptId, answers });
export async function myAttempt(quizId) { /* select from quiz_attempts */ }
```

Hooks: `useQuiz(activityId)`, `useStartQuiz()`, `useSubmitQuiz()`. Submitting
invalidates `courseKeys.myEnrollments` and `['courses','outline']`, exactly as
`useCompleteActivity` does, because a pass can unlock the next module.

---

## Task 9: `QuizPage` on server data

**Files:**
- Modify: `src/pages/trainee/QuizPage.jsx`
- Create: `src/pages/trainee/QuizPage.server.test.jsx`

Phases: intro (title, question count, pass mark, time limit) → questions →
results. The results screen shows **score and per-question right/wrong only** —
no correct answer, no explanation, per decision 7.

The countdown remains, driven by the `deadline` the server returned, and is
now **display only**; the server decides what is late. When it reaches zero the
page submits what it has.

`ActivityPage` routes a `quiz` activity to `QuizPage` instead of the "not
available yet" panel added in M3.

**Tests must assert the negative:** render a completed attempt and confirm no
correct-answer text and no explanation string appears anywhere in the DOM.

---

## Task 10: Trainer review queue

**Files:**
- Modify: `src/pages/trainer/TrainerReview.jsx`
- Create: `src/pages/trainer/TrainerReview.test.jsx`
- Create: `src/api/review.js`, `src/hooks/useReview.js` (+ tests)

Two sections, because decisions 3 and 4 created exactly two blocking actions:

1. **Paragraphs awaiting grade** — trainee, course, question prompt, their answer, the key's `guidance` (trainers may see this; it is fetched through a function, never the table), award and comment.
2. **Retake requests** — failed or expired attempts on the trainer's courses, with a reason field and an *Allow retake* button.

A trainer with an empty queue sees an empty state, not a blank page. Errors
surface through the shared `QueryError` component from the audit.

---

## Task 11: Migrate `q1` and strip the bundle

**Files:**
- Create: `scripts/seed-quizzes.mjs`
- Modify: `src/data/dummyData.js`
- Modify: `src/pages/trainee/QuizPreview.jsx` if it reads removed fields

Move the prototype's `q1` (Loops & Iteration) into `quizzes`, `quiz_questions`
and `quiz_answer_keys`, then **remove `correct` and `explanation` from
`dummyData.js`**. This is the audit finding S3 being closed.

Anything still reading those fields must be updated or the build will silently
render `undefined`; grep for `\.correct` and `\.explanation` across `src/`
before declaring this done.

---

## Task 12: Verification and docs

**Files:**
- Create: `scripts/verify-m4.mjs`
- Modify: `package.json`, `README.md`, this plan's progress table

`npm run verify:m4` runs live against the project and, critically, **greps the
built bundle**:

```javascript
// The audit found the leak by reading dist/, not by reading source. This is
// the check that would have caught it, so it is the check that runs.
const bundle = readFileSync(newest('dist/assets/*.js'), 'utf8');
check('no isCorrect in the bundle', !bundle.includes('isCorrect'));
check('no seeded explanation text in the bundle',
      !bundle.includes('A do...while loop checks its condition AFTER'));
```

Plus the live loop: seed a quiz → start → submit a wrong answer → confirm fail
and no completion → trainer grants a retake → pass → confirm completion → a
paragraph quiz stays `pending_review` until graded → confirm the trainee never
receives an answer key in any response.

---

## Verification checklist

- [ ] A trainee selecting `quiz_answer_keys` receives a permission **error**, not an empty set
- [ ] No endpoint response contains a correct answer or an explanation
- [ ] The built bundle contains no `isCorrect` and no seeded explanation text
- [ ] A trainee cannot insert an attempt, an answer, or a retake grant
- [ ] A trainee cannot set `passed`, `auto_score` or `final_score`
- [ ] A second attempt is refused without a grant, and allowed with one
- [ ] A grant is consumed exactly once
- [ ] A late submission is graded as `expired` on what arrived
- [ ] A paragraph holds the attempt at `pending_review` and records no completion
- [ ] Failing a module quiz records no completion, so the next module stays locked
- [ ] A course with a final does not complete at 100% of activities
- [ ] Passing the final completes the enrollment
- [ ] Only the owning trainer or an admin can grade or grant
- [ ] The 183 frontend and 222 database tests from M3 still pass

## Deferred

Trainer quiz authoring (M4b). Question pooling and shuffling. XP awarding and
gamification. Realtime chat (M5). Certificates. Assessment analytics.
