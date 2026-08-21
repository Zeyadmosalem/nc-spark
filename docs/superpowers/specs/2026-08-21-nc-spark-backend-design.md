# NC Spark — Backend Design

**Date:** 2026-08-21
**Status:** Draft for review
**Scope:** Backend architecture for NC Spark, treating the existing React prototype as the product specification.

---

## 1. Context

NC Spark is a role-based learning management platform. The React prototype is feature-complete as a *vision*: four role portals, six activity types, quizzes with a second-attempt approval workflow, gamification, course chat, and admin CRUD. All of it runs on in-memory mock data in a single React context.

This document designs the backend that replaces that mock, targeting **real trainees in production**.

### What the prototype gets wrong

Three modelling errors in the mock data must not be carried into the schema:

1. **Per-course state that belongs to an enrollment.** `course.stages[].status` and `course.progress` live on the course, so all trainees share one progress value.
2. **Two competing progression models.** Courses carry an 11-item `stages[]` array; learning paths separately carry `modules[] → activities[]`. They have already drifted — `c1` claims `totalModules: 11` while its path has 3.
3. **Client-side authority.** Quiz grading, module unlocking, and XP awards all happen in the browser, where a trainee can alter them.

### Security findings this design closes

| Finding | Resolution |
|---|---|
| Role picker login, no password | Real Supabase Auth (§5) |
| Hardcoded `'Password123!'` + client self-signup with client-supplied role | Trigger-created profiles ignoring client role (§5.2) |
| `profiles` UPDATE policy with no `WITH CHECK` — any user can set `role='admin'` | Three-layer defence (§5.3) |
| `profiles`/`messages` SELECT `using (true)` — all emails public | Base-table restriction + `public_profiles` view (§5.4) |
| Quiz answers shipped to browser, client-side grading | Separate answer-key table, service-role-only (§8.1) |
| No INSERT policy on `profiles` — signup upsert silently fails | Replaced by trigger (§5.2) |

---

## 2. Goals and non-goals

**Goals.** Server-authoritative correctness for anything that affects a training record. Authorization that is auditable and testable. An append-only audit trail. A schema that supports the full prototype vision without requiring rework per milestone.

**Non-goals for the first release.** Gamification automation (XP/badge/streak awarding) — storage exists, logic deferred. Supervisor reports and admin analytics. SSO. Multi-tenancy. Offline support. Native mobile.

---

## 3. Architecture

**Vercel (frontend) + Supabase (Postgres, Auth, Storage, Realtime, Edge Functions).**

The trust boundary is **RLS as a baseline on every table, plus Edge Functions owning every privileged write**. Defence in depth: a mistake in one layer is not a breach.

### 3.1 When to use which

| Use | For |
|---|---|
| **RLS alone** | "Is this row mine?" — a trainee reading their own enrollment, applying to a course (`WITH CHECK` forcing `status='pending'` and `trainee_id = auth.uid()`) |
| **Edge Function** | Cross-entity authorization, state transitions, anything needing an audit entry, anything the client must not be able to compute — grading, approvals, role changes |

Applying this rule keeps the Edge Function surface small and the RLS policies simple.

### 3.2 JWT claims

`role` is published into a JWT custom claim via an access-token hook, so RLS checks do not query `profiles` on every request. A role change therefore does not take effect until token refresh (~1 hour). Mitigation: privileged Edge Functions re-read role from the database, so the stale window affects read visibility only, never a privileged write.

---

## 4. Data model

Naming is `snake_case`; the frontend maps to `camelCase` at the API layer. All tables carry `created_at timestamptz not null default now()`.

### 4.1 Enums

```sql
create type app_role       as enum ('admin','supervisor','trainer','trainee');
create type profile_status as enum ('pending','active','suspended','rejected');
create type course_status  as enum ('draft','published','archived');
create type enrollment_status as enum ('pending','active','completed','withdrawn');
create type request_status as enum ('pending','approved','denied');
create type activity_type  as enum ('video','reading','flashcards','matching','scenario','submission','quiz');
create type question_type  as enum ('mcq','truefalse','paragraph');
create type attempt_status as enum ('in_progress','submitted','pending_review','graded');
```

Enums over `CHECK` constraints: invalid values are rejected by the type system and the set is discoverable.

### 4.2 Identity

```
profiles          id → auth.users, role app_role, status profile_status,
                  name, email citext unique, avatar, updated_at
trainee_stats     profile_id → profiles, xp int, streak int, last_active_on date
supervisor_trainers  supervisor_id → profiles, trainer_id → profiles  (PK both)
allowed_domains   domain citext primary key, created_by
audit_log         id bigserial, actor_id, action, entity_type, entity_id,
                  before jsonb, after jsonb, created_at
```

`profiles` stays identity-only. Gamification state lives in `trainee_stats` so the deferred milestone never alters the identity table.

`supervisor_trainers` replaces the `managedTrainers` text array — array containment inside RLS policies is awkward and defeats the indexes the 3-hop supervisor check needs.

### 4.3 Catalog

```
courses           id, slug unique, title, subtitle, description,
                  trainer_id → profiles, color, icon, status course_status, created_by
modules           id, course_id → courses, title, position int,
                  unlock_after_module_id → modules,
                  unique(course_id, position)
activities        id, module_id → modules, type activity_type, title,
                  position int, xp int, content jsonb,
                  unique(module_id, position)
course_materials  id, course_id → courses, name, kind, storage_path,
                  external_url, size_bytes, uploaded_by
```

**Learning paths are collapsed into courses.** The prototype's paths are already 1:1 with courses. A future cross-course curriculum is an additive migration.

**`activities.content jsonb`** carries the per-type payload, guarded by a `CHECK` validating required keys per type:

```sql
check (
  case type
    when 'flashcards' then content ? 'cards'
    when 'matching'   then content ? 'pairs'
    when 'scenario'   then content ? 'steps'
    when 'reading'    then content ? 'body'
    when 'video'      then content ? 'videoId'
    else true
  end
)
```

One table and one query path, but a malformed deck cannot be inserted.

### 4.4 Enrollment and progress

```
enrollments          id, trainee_id → profiles, course_id → courses,
                     status enrollment_status, decided_by, decided_at,
                     completed_at, unique(trainee_id, course_id)
activity_completions id, enrollment_id → enrollments, activity_id → activities,
                     completed_at, payload jsonb,
                     unique(enrollment_id, activity_id)
teaching_requests    id, trainer_id, course_id, status request_status,
                     decided_by, decided_at
```

**Completion is an append-only event, not a flag.** `payload` records *how* it was completed (scenario choices, matching score), which is what makes a training record auditable.

**Progress is derived, never stored** — a view over completions ÷ total activities. This deletes the prototype's `progress + 15` magic number and makes drift structurally impossible.

### 4.5 Assessment

```
quizzes           id, activity_id → activities unique, title,
                  time_limit_seconds, pass_mark numeric, max_attempts int
quiz_questions    id, quiz_id, type question_type, prompt, position,
                  options jsonb, guidance
quiz_answer_keys  question_id primary key → quiz_questions,
                  correct jsonb, explanation text
quiz_attempts     id, quiz_id, trainee_id, attempt_no int, started_at,
                  submitted_at, score numeric, passed bool,
                  status attempt_status, unique(quiz_id, trainee_id, attempt_no)
quiz_responses    id, attempt_id, question_id, response jsonb,
                  is_correct bool, points numeric, reviewed_by, feedback
second_attempt_requests  id, quiz_id, trainee_id, status request_status,
                  decided_by, decided_at
submissions       id, activity_id, trainee_id, storage_path,
                  status, feedback, reviewed_by, reviewed_at
```

**`quiz_answer_keys` is a separate table with RLS denying `authenticated` entirely.** Only the grading function's service role reads it. The browser cannot fetch answers because it holds no grant — not because a field was remembered to be stripped.

Attempts and responses are append-only. A second attempt is a new row, never a mutation.

A quiz is an activity (`activities.type = 'quiz'`) with exactly one `quizzes` row. `quizzes` carries no `course_id`; the course is derived through `activity → module → course`, so the two can never disagree.

**Completing a quiz activity means passing it.** `submit-quiz` writes the `activity_completions` row only when the attempt passes, so progress and module unlocking treat a failed quiz as incomplete. Quizzes containing paragraph questions therefore complete on grading, not on submission.

### 4.6 Chat

```
messages  id, course_id → courses, user_id → profiles, body text, created_at
```

Sender identity comes from `auth.uid()` server-side. The prototype trusts client-supplied `name`/`role`/`isTrainer`, which is spoofable.

---

## 5. Identity and access

### 5.1 Authentication

Supabase Auth, email + password, email confirmation required.

### 5.2 Provisioning

A trigger on `auth.users` creates the profile and **ignores any client-supplied role**, which removes the escalation vector at its source:

| Email domain | Outcome |
|---|---|
| In `allowed_domains` | `role='trainee'`, `status='active'` |
| Anything else | `role='trainee'`, `status='pending'` (admin queue) |

Elevated roles are granted only by an existing admin, afterward, via `admin-set-role`.

### 5.3 Three layers against privilege escalation

1. **Column-level grants** — `REVOKE UPDATE ON profiles FROM authenticated`, then `GRANT UPDATE (name, avatar)`. A trainee lacks the Postgres privilege to write `role`, whatever the query says.
2. **RLS `WITH CHECK`** asserting `role` and `status` are unchanged.
3. **`BEFORE UPDATE` trigger** raising if `role`/`status` changed outside `service_role`.

### 5.4 Read visibility

Base-table `SELECT` on `profiles` is restricted to self, admins, and legitimate hierarchy. A `public_profiles` view exposes only `(id, name, avatar, role)` for chat and rosters, so display names work without leaking contact details.

### 5.5 RLS helper functions

Policies needing the caller's role would query `profiles`, causing infinite recursion. `SECURITY DEFINER` helpers break the cycle:

```
app.current_role()            app.is_admin()
app.is_active()               app.supervises(trainer uuid)
app.is_trainer_of(course uuid)  app.is_enrolled(course uuid)
app.is_module_unlocked(enrollment uuid, module uuid)
```

Each is `STABLE` and declared `SET search_path = ''` to close the `SECURITY DEFINER` search-path injection hole.

### 5.6 Authorization matrix

| Action | admin | supervisor | trainer | trainee |
|---|---|---|---|---|
| View published course | ✓ | ✓ | ✓ | ✓ |
| View draft course | ✓ | — | own | — |
| Create / delete course | ✓ | — | — | — |
| Edit course content | ✓ | — | own | — |
| Assign trainer to course | ✓ | — | — | — |
| Request to teach | — | — | ✓ | — |
| Approve teaching request | ✓ | — | — | — |
| Apply to enroll | — | — | — | ✓ |
| Approve enrollment | ✓ | — | own courses | — |
| View enrollment records | ✓ | supervised | own courses | own |
| View quiz answer keys | — | — | — | — |
| Grade paragraph answers | ✓ | — | own courses | — |
| Approve second attempt | ✓ | — | own courses | — |
| Change a role | ✓ | — | — | — |

Nobody reads `quiz_answer_keys` through the API; only the grading function's service role does.

---

## 6. Edge Functions

| Function | Guard | Audited |
|---|---|---|
| `admin-set-role` | active admin; refuses to demote the last admin | ✓ |
| `admin-review-signup` | active admin | ✓ |
| `admin-suspend-user` | active admin | ✓ |
| `approve-enrollment` | admin or owning trainer | ✓ |
| `approve-teaching-request` | admin | ✓ |
| `publish-course` | admin or owning trainer; requires ≥1 module with ≥1 activity | ✓ |
| `complete-activity` | enrolled trainee; **rejects locked modules** | — |
| `start-quiz-attempt` | enrolled trainee; enforces `max_attempts`; stamps `started_at` | — |
| `submit-quiz` | owning trainee; grades server-side | ✓ |
| `review-submission` | admin or owning trainer | ✓ |
| `approve-second-attempt` | admin or owning trainer | ✓ |

`audit_log` is append-only: `UPDATE`/`DELETE` revoked from all roles, `SELECT` for admins.

---

## 7. Learning and progress

Module unlocking moves server-side. `app.is_module_unlocked()` is the single source of truth, and `complete-activity` rejects completions for locked modules rather than trusting the client's `isModuleUnlocked()`.

### 7.1 Storage

Two buckets, with RLS keyed off the path prefix:

| Bucket | Path | Read | Write |
|---|---|---|---|
| `course-materials` | `{course_id}/…` | enrolled trainees, course staff | owning trainer, admin |
| `submissions` | `{course_id}/{trainee_id}/…` | owning trainee, course trainer, admin | owning trainee |

Uploads go direct to Storage via signed URLs; files never transit an Edge Function.

---

## 8. Assessment

### 8.1 Grading

`submit-quiz` runs entirely server-side:

1. Verify the attempt belongs to the caller and is `in_progress`.
2. Compare `now() - started_at` against `time_limit_seconds`; flag overruns.
3. Read `quiz_answer_keys` via service role, score objective questions.
4. Mark `paragraph` questions `pending_review` and exclude them from the pass calculation.
5. Persist `quiz_responses`, set attempt status, write the audit entry.
6. Return score and per-question correctness — **never the answer key for unattempted questions**.

Because paragraph questions await a trainer, the returned result is **provisional** until graded.

### 8.2 Second attempts

A trainee whose attempt failed may request a second attempt. Approval by admin or the owning trainer raises the effective `max_attempts` for that trainee/quiz pair. `start-quiz-attempt` enforces it.

---

## 9. Frontend integration

The 598-line `AppContext` is replaced incrementally by `src/api/` (thin Supabase wrappers) plus **TanStack Query** for caching, invalidation, and loading/error states. Introduced in M1, migrated per milestone. No big-bang rewrite.

Auth screens replace the role picker: login, signup, pending-approval, password reset.

**Known follow-up:** the app has ~750 inline `style={{}}` objects bypassing the existing design tokens. Out of scope here; worth its own workstream.

---

## 10. Testing

| Layer | Approach |
|---|---|
| RLS policies | **Red-team suite** — for each role, attempt to read another user's email, set own role to admin, read `quiz_answer_keys`, write another user's profile. Assert denial. Non-negotiable per milestone. |
| Edge Functions | Vitest against a local Supabase instance; auth guards and audit writes asserted |
| Database functions | pgTAP for `is_module_unlocked`, `supervises`, progress views |
| Frontend | Existing Vitest + Testing Library suite (56 tests) extended per milestone |
| CI | lint + tests + build on every push |

RLS bugs are silent and catastrophic; they get tested first, not last.

---

## 11. Migration

A seed script converts `dummyData.js` into real rows: courses, modules from `LEARNING_PATHS[].modules`, activities from `stages[]` and `ACTIVITIES`, quizzes with answers split into `quiz_answer_keys`, materials uploaded to Storage.

`improvementAreas` is **dropped** — it is computed analytics, and will be derived from real `quiz_responses` in the reporting milestone rather than hand-authored.

---

## 12. Milestones

| | Milestone | Contents |
|---|---|---|
| M0 | ✅ Complete | Crash fixes, XSS sanitization, error boundaries, correctness bugs, dependency advisories, 56 tests |
| M1 | Identity & Access | Auth, profiles, roles, provisioning, RLS foundation, audit log, `src/api/` + TanStack Query, auth screens |
| M2 | Catalog & Enrollment | Courses, modules, activities, enrollment and teaching-request approvals |
| M3 | Learning & Progress | Six activity types, completions, server-side unlocking, file uploads |
| M4 | Assessment | Quizzes, server-side grading, second attempts, trainer review |
| M5 | Collaboration | Realtime course chat |
| Later | Gamification & Reporting | XP/badge/streak automation, supervisor reports, admin analytics |

---

## 13. Risks

| Risk | Mitigation |
|---|---|
| RLS policy error exposes data | Red-team suite per milestone; three-layer defence on the highest-value target |
| Role change stale for ~1h via JWT claim | Privileged writes re-read role from DB |
| Scope: the vision is ~5 subsystems | Milestone sequencing; each ships independently |
| `AppContext` rewrite destabilises working UI | Incremental migration behind `src/api/`, existing tests as the safety net |
| Supabase lock-in | Core is standard Postgres + RLS; Auth and Storage are the coupled pieces |

---

## 14. Decisions taken

1. Vercel + Supabase — confirmed from the existing hosting plan.
2. RLS + Edge Functions rather than pure RLS or a dedicated API server.
3. Self-signup for allowlisted domains; approval queue otherwise.
4. Learning paths collapsed into courses.
5. Progress derived, not stored.
6. Gamification storage now, automation deferred.
7. Suspend rather than delete users, preserving training records.
8. `role` in a JWT claim, with privileged writes re-reading from the database.
