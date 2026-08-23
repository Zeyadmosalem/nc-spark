# M4 Assessment — Design

**Status:** approved by decision session 2026-08-23
**Builds on:** M1 Identity, M2 Catalog, M3 Learning & Progress (all merged)

## 1. The problem

Quiz answers ship in the production bundle. Confirmed during the audit:
13 `isCorrect` occurrences and the full explanation text are present in
`dist/assets/index-*.js`. Grading happens in the browser, so a trainee can read
the key before answering, or set their own score.

Today that only exposes prototype seed data. The moment real NC Spark
assessment content is loaded, the same path leaks it. M4 exists to close this.

**The governing rule:** an answer key must never be sent to a trainee's browser,
in any form, at any time — not to render a question, not to show feedback, not
after passing.

## 2. Decisions

Every one of these was chosen deliberately in the decision session; the
consequences column records what each costs, so nothing here is a surprise later.

| # | Decision | Consequence accepted |
|---|---|---|
| 1 | **Grade only on submit.** No per-question feedback. | Loses the prototype's immediate teaching moment. One request per attempt. |
| 2 | **Both module quizzes and a course-level final.** | Two unlock rules and two completion semantics to build and test. |
| 3 | **A paragraph answer blocks completion until a trainer grades it.** | A trainee is blocked on trainer availability. |
| 4 | **One attempt; a trainer must grant a retake.** | A failed trainee is hard-blocked until a trainer acts. |
| 5 | **Server-enforced time limit.** | Needs an attempt-in-progress record and a start endpoint. |
| 6 | **Full trainer review queue in M4.** | Substantial UI slice, but decisions 3 and 4 make it mandatory. |
| 7 | **Trainee sees score and per-question right/wrong only.** | No correct answers, no explanations, ever. Weaker as teaching. |
| 8 | **All modules complete → final unlocks → passing it completes the course.** | Changes M3's rule that 100% of activities completes an enrollment. |
| 9 | **Quizzes seeded by admin in M4;** trainer authoring is M4b. | `CreateQuiz` keeps its dummy-data behaviour for now. |
| 10 | **Fixed question set,** no pooling or shuffling. | Questions leak slowly by word of mouth. Poolable later. |
| 11 | **XP still not awarded.** Gamification stays deferred. | XP remains cosmetic. |
| 12 | **Migrate the prototype's `q1` into the database** and strip its answers from `dummyData`. | Closes the audit finding in this milestone. |

### 2.1 The blocking chain, stated plainly

Decisions 3, 4 and the must-pass rule compose into something worth seeing whole:

```
trainee fails a module quiz
  └─ activity does NOT complete
      └─ module never reaches 100%
          └─ next module stays locked
              └─ course cannot complete
                  └─ unblocked ONLY by a trainer granting a retake
```

The same chain applies while a paragraph awaits grading. This is correct for
compliance training, where an unearned pass is the worse failure — but it means
**trainer responsiveness is now a hard dependency of trainee progress.** The
review queue (decision 6) is therefore part of the milestone, not an extra.

## 3. Schema

### 3.1 Where a quiz lives

A **module quiz** is an existing `activities` row of type `quiz`. It already
counts toward `enrollment_progress` and already respects `is_module_unlocked`.
No new unlock logic is needed for it.

A **course final** is a `quizzes` row with `course_id` set and `activity_id`
null. It is not an activity, so it does not count toward module progress, and
it has its own unlock rule (§5.2).

```sql
create type public.question_type   as enum ('mcq','truefalse','paragraph');
create type public.attempt_status  as enum ('in_progress','pending_review','passed','failed','expired');

create table public.quizzes (
  id                 uuid primary key default gen_random_uuid(),
  course_id          uuid not null references public.courses(id) on delete cascade,
  activity_id        uuid unique references public.activities(id) on delete cascade,
  title              text not null check (title <> ''),
  pass_mark          numeric(3,2) not null default 0.70
                       check (pass_mark > 0 and pass_mark <= 1),
  time_limit_seconds integer check (time_limit_seconds is null or time_limit_seconds > 0),
  created_at         timestamptz not null default now(),
  -- A course final is the quiz with no activity. At most one per course.
  constraint quizzes_one_final_per_course exclude (course_id with =) where (activity_id is null)
);

create table public.quiz_questions (
  id         uuid primary key default gen_random_uuid(),
  quiz_id    uuid not null references public.quizzes(id) on delete cascade,
  type       public.question_type not null,
  position   integer not null check (position > 0),
  prompt     text not null check (prompt <> ''),
  -- Options for mcq only. NEVER contains correctness information.
  options    jsonb not null default '[]'::jsonb,
  points     integer not null default 1 check (points > 0),
  unique (quiz_id, position),
  constraint mcq_needs_options check (type <> 'mcq' or jsonb_array_length(options) >= 2)
);
```

### 3.2 The answer key

A separate table, not a column, so that "never readable by a trainee" is
enforced by the absence of a grant rather than by remembering to exclude a
column from every `select`.

```sql
create table public.quiz_answer_keys (
  question_id uuid primary key references public.quiz_questions(id) on delete cascade,
  -- mcq: {"index": 2}   truefalse: {"value": true}   paragraph: {"guidance": "..."}
  answer      jsonb not null,
  explanation text
);

alter table public.quiz_answer_keys enable row level security;
revoke all on public.quiz_answer_keys from anon, authenticated;
-- No policy for `authenticated` at all. Not a restrictive one — none.
-- service_role reaches it; the owning trainer and admins read it through a
-- SECURITY DEFINER function, never directly.
```

**This is the load-bearing table of the milestone.** Its red-team suite asserts
that a trainee cannot select it, cannot join to it, cannot reach it through a
view, and that it never appears in any response the client receives.

### 3.3 Attempts

```sql
create table public.quiz_attempts (
  id            uuid primary key default gen_random_uuid(),
  quiz_id       uuid not null references public.quizzes(id) on delete cascade,
  trainee_id    uuid not null references public.profiles(id) on delete cascade,
  enrollment_id uuid not null references public.enrollments(id) on delete cascade,
  status        public.attempt_status not null default 'in_progress',
  started_at    timestamptz not null default now(),
  submitted_at  timestamptz,
  graded_at     timestamptz,
  graded_by     uuid references public.profiles(id) on delete set null,
  auto_score    numeric(5,2),   -- mcq + truefalse only
  final_score   numeric(5,2),   -- after paragraph grading
  passed        boolean
);

create table public.quiz_answers (
  id          uuid primary key default gen_random_uuid(),
  attempt_id  uuid not null references public.quiz_attempts(id) on delete cascade,
  question_id uuid not null references public.quiz_questions(id) on delete cascade,
  response    jsonb not null,          -- {"index":2} | {"value":true} | {"text":"..."}
  is_correct  boolean,                 -- null for an ungraded paragraph
  awarded     integer,
  unique (attempt_id, question_id)
);

-- One attempt per trainee per quiz. A retake is granted by deleting nothing:
-- the trainer inserts a grant, which this partial index tolerates.
create unique index quiz_attempts_one_per_trainee
  on public.quiz_attempts (quiz_id, trainee_id, attempt_no);
```

Retakes are modelled with an explicit `attempt_no`, defaulting to 1, and a
`quiz_retake_grants` table recording who allowed what and why — the grant is
compliance evidence in its own right.

```sql
create table public.quiz_retake_grants (
  id          uuid primary key default gen_random_uuid(),
  quiz_id     uuid not null references public.quizzes(id) on delete cascade,
  trainee_id  uuid not null references public.profiles(id) on delete cascade,
  granted_by  uuid not null references public.profiles(id) on delete restrict,
  reason      text,
  consumed_at timestamptz,
  created_at  timestamptz not null default now()
);
```

## 4. Authorization

| Actor | quizzes / quiz_questions | quiz_answer_keys | own attempts | others' attempts |
|---|---|---|---|---|
| trainee, enrolled | read (no answers) | **none** | read own | none |
| trainee, unenrolled | none | **none** | none | none |
| trainer, owns course | read | read via function | read | read for their courses |
| supervisor | read | none | read for managed trainers | read |
| admin | read/write | read via function | read | read |
| anon | none | **none** | none | none |

`quiz_questions.options` is deliberately answer-free, so the question read path
needs no filtering — there is nothing to filter out.

## 5. Flow

### 5.1 Taking a quiz

```
POST /start-quiz    { quizId }
  → verifies enrollment, unlock state, and that no attempt exists
    (or that an unconsumed retake grant does)
  → creates quiz_attempts { status: in_progress, started_at }
  → returns questions WITHOUT answers, plus deadline

POST /submit-quiz   { attemptId, answers: [{questionId, response}] }
  → rejects if the attempt is not in_progress
  → if now > started_at + time_limit → status: expired, graded on what arrived
  → grades mcq + truefalse against quiz_answer_keys, server-side
  → if the quiz has paragraphs → status: pending_review, NO completion recorded
  → else pass/fail against pass_mark
      → passed → records the activity completion (module quiz)
      → failed → records nothing; the module stays locked
  → returns { score, passed, perQuestion: [{questionId, isCorrect}] }
                                  ^ no correct answer, no explanation
```

### 5.2 The course final

Unlocks when every activity in every module of the course has a completion for
this enrollment. Passing it sets the enrollment to `completed`.

This **supersedes M3's rule** that reaching 100% of activities completes an
enrollment. For a course with a final, 100% of activities unlocks the final;
completion comes from passing it. For a course without one, M3's rule stands
unchanged. `complete-activity` must be updated accordingly, and the existing
M3 test that asserts the old behaviour must be updated with it, not deleted.

### 5.3 Trainer actions

```
POST /grade-paragraph { attemptId, questionId, awarded, comment }
  → owning trainer or admin only
  → when the last paragraph is graded: recompute final_score,
    set passed, and record the completion if passed

POST /grant-retake    { quizId, traineeId, reason }
  → owning trainer or admin only
  → inserts a grant; the next start-quiz consumes it
  → audited
```

Both write to `audit_log`, because "who let this person retake the fire-safety
assessment" is exactly the question an auditor asks.

## 6. What the client never receives

Stated as testable claims, because this is the milestone's whole point:

1. No response from any endpoint contains a correct answer, for any question type.
2. No response contains an explanation.
3. `quiz_answer_keys` returns a permission error for `authenticated`, not an empty set — an empty set would mean a policy is silently filtering, which could change.
4. The built bundle contains no `isCorrect`, no answer indices, and no explanation strings from real content.
5. A trainee cannot insert or update `quiz_attempts`, `quiz_answers`, or `quiz_retake_grants` directly.
6. A trainee cannot set their own `auto_score`, `final_score`, or `passed`.

Claim 4 is checked against `dist/` by the verification script, not by reading
code — the audit found the leak that way, and that is the check that would have
caught it.

## 7. Out of scope

Trainer quiz authoring (M4b). Question pooling and shuffling. XP awarding and
the rest of gamification. Realtime chat (M5). Certificates. Supervisor
analytics over assessment results.
