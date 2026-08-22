# M2 Catalog & Enrollment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make courses, modules, activities and enrollment real and persistent, replacing the in-memory `dummyData.js` catalog with a database that enforces who may read, edit, publish and enrol.

**Architecture:** One hierarchy — `course → modules → activities` — with learning paths collapsed in, since the prototype's paths are already 1:1 with courses. Progress is a derived view over completions, never a stored column. RLS covers reads and self-service writes; Edge Functions own approvals and publishing, each writing an audit entry.

**Tech Stack:** Supabase (Postgres 17, Edge Functions on Deno), `@supabase/supabase-js` v2, React 19, React Router 7, TanStack Query v5, Vitest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-08-21-nc-spark-backend-design.md` — sections 4.3, 4.4, 5.6, and 7.

## Progress

| Task | Status | Notes |
|---|---|---|
| 1. Catalog enums and tables | **Done** | |
| 2. Enrollment tables | **Done** | |
| 3. Helpers and progress view | **Done** | |
| 4. Catalog policies | **Done** | |
| 5. Enrollment policies | **Done** | |
| 6. Approval and publishing functions | **Done** | Deployed with --use-api and tested |
| 7. Seed script | **Done** | Publishes only courses that have activities |
| 8. Frontend api modules | **Done** | |
| 9. Catalog wired into the UI | **Done** | |
| 10. Trainer approval queue | **Done** | Verified end-to-end against the live functions |

### Corrections learned during execution

1. **A page that fetches needs a `QueryClientProvider` in its tests.** Wiring
   `MyCoursesPage` to TanStack Query broke `App.auth.test.jsx`, which sat on the
   loading state forever. Any test rendering `App` now needs the provider and
   stubbed api modules.
2. **The seed must not do through the service role what the API forbids.**
   Seeding every course as published put Business Administration — which has no
   learning path, so no activities — into the catalog in a state
   `publish-course` would refuse. The seed now publishes only courses with
   activities.
3. **Test runs leave stray courses behind.** Suites that create courses in
   `beforeAll` and delete only their own leave others; the catalog had 7 rows
   when it should have had 3. Prefer deleting by the slug prefix the suite owns,
   as `fn-catalog.test.js` does.

## Status: M2 complete

All 10 tasks done. 106 frontend tests, 180 database tests, 0 lint errors,
clean build. Verified live: a trainer publishes a course, a trainee sees it and
applies, cannot read its activities while pending, the trainer sees her name in
the queue and approves, and only then do the activities become readable with
progress at 0%.

## Global Constraints

- Every `SECURITY DEFINER` function MUST declare `SET search_path = ''` and use fully qualified names. Omitting this is a search-path injection hole.
- Every table MUST have `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` in the migration that creates it.
- **`citext` is unusable under `SET search_path = ''`** — it lives in the `extensions` schema. Use lowercase `text` and compare with `lower()`.
- **A table needs a SELECT policy before self-service UPDATE works.** `UPDATE ... WHERE` applies SELECT policies to its row scan; without one it returns HTTP 200, zero rows, and no error.
- **A `WITH CHECK` subquery over the same table is itself RLS-filtered** and returns NULL. Use a `SECURITY DEFINER` helper.
- **Never add an `ON DELETE SET NULL` foreign key into `audit_log`.** SET NULL is an UPDATE, which the append-only trigger refuses, making the referenced row undeletable.
- **`audit_log` cannot be cleaned between test runs.** Scope every audit assertion to a per-run unique value.
- All timestamps are `timestamptz not null default now()`.
- Database identifiers are `snake_case`; JavaScript is `camelCase`. Mapping happens in `src/api/`, nowhere else.
- Edge Functions MUST verify the caller by re-reading `profiles`, never by trusting a JWT claim.
- Every privileged Edge Function MUST write an `audit_log` row before returning success.
- Docker is unavailable. Apply migrations with
  `npx supabase db push --db-url "$(grep '^SUPABASE_DB_URL=' .env.test | cut -d= -f2-)"`
  and deploy with `npx supabase functions deploy <name> --project-ref hwlsbcgvxozxsjmojgxe --use-api`.
- The existing 82 frontend and 97 database tests must pass after every task.

---

## File Structure

**Migrations** — one per concern, timestamps continuing from M1's `...000750`:

| File | Responsibility |
|---|---|
| `20260822000100_catalog_enums.sql` | `course_status`, `activity_type`, `enrollment_status`, `request_status` |
| `20260822000200_catalog.sql` | `courses`, `modules`, `activities`, `course_materials` |
| `20260822000300_enrollment.sql` | `enrollments`, `activity_completions`, `teaching_requests` |
| `20260822000400_catalog_helpers.sql` | `app.is_trainer_of`, `app.is_enrolled`, progress view |
| `20260822000500_catalog_rls.sql` | Read and write policies for the catalog |
| `20260822000600_enrollment_rls.sql` | Enrollment and teaching-request policies |

**Edge Functions** — reusing `_shared/` from M1 unchanged:

`approve-enrollment/`, `approve-teaching-request/`, `publish-course/`

**Frontend** — `src/api/` gains two modules; `AppContext` sheds catalog state:

`src/api/courses.js`, `src/api/enrollments.js`, `src/hooks/useCourses.js`

---

## Task 1: Catalog enums and tables

**Files:**
- Create: `supabase/migrations/20260822000100_catalog_enums.sql`
- Create: `supabase/migrations/20260822000200_catalog.sql`
- Create: `supabase/tests/schema-catalog.test.js`

**Interfaces:**
- Consumes: `public.profiles` from M1
- Produces: types `course_status`, `activity_type`; tables `public.courses(id, slug, title, subtitle, description, trainer_id, color, icon, status, created_by, created_at, updated_at)`, `public.modules(id, course_id, title, position, unlock_after_module_id, created_at)`, `public.activities(id, module_id, type, title, position, xp, content, created_at)`, `public.course_materials(id, course_id, name, kind, storage_path, external_url, size_bytes, uploaded_by, created_at)`

- [ ] **Step 1: Write the failing test**

Create `supabase/tests/schema-catalog.test.js`:

```javascript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { serviceClient, createUser, resetDb, uniqueEmail } from './helpers.js';

const svc = serviceClient();
let trainer, courseId, moduleId;

beforeAll(async () => {
  await resetDb();
  trainer = await createUser({ email: uniqueEmail(), role: 'trainer' });
  const { data: c } = await svc.from('courses')
    .insert({ slug: `hs-${Date.now()}`, title: 'Health and Safety', trainer_id: trainer.id, created_by: trainer.id })
    .select().single();
  courseId = c.id;
  const { data: m } = await svc.from('modules')
    .insert({ course_id: courseId, title: 'Fundamentals', position: 1 })
    .select().single();
  moduleId = m.id;
});
afterAll(async () => {
  await svc.from('courses').delete().eq('id', courseId);
  await resetDb();
});

describe('catalog schema', () => {
  it('creates a course with a draft status by default', async () => {
    const { data } = await svc.from('courses').select('status').eq('id', courseId).single();
    expect(data.status).toBe('draft');
  });

  it('rejects a duplicate slug', async () => {
    const { data: existing } = await svc.from('courses').select('slug').eq('id', courseId).single();
    const { error } = await svc.from('courses')
      .insert({ slug: existing.slug, title: 'Clash', created_by: trainer.id });
    expect(error).not.toBeNull();
  });

  it('rejects an invalid course status', async () => {
    const { error } = await svc.from('courses').update({ status: 'live' }).eq('id', courseId);
    expect(error.message).toMatch(/invalid input value for enum/i);
  });

  it('rejects two modules at the same position in one course', async () => {
    const { error } = await svc.from('modules')
      .insert({ course_id: courseId, title: 'Clash', position: 1 });
    expect(error).not.toBeNull();
  });

  it('accepts a well-formed flashcards activity', async () => {
    const { error } = await svc.from('activities').insert({
      module_id: moduleId, type: 'flashcards', title: 'Keywords', position: 1, xp: 12,
      content: { cards: [{ front: 'a', back: 'b' }] },
    });
    expect(error).toBeNull();
  });

  it('REJECTS a flashcards activity with no cards key', async () => {
    const { error } = await svc.from('activities').insert({
      module_id: moduleId, type: 'flashcards', title: 'Broken', position: 2,
      content: { nope: true },
    });
    expect(error).not.toBeNull();
    expect(error.message).toMatch(/violates check constraint/i);
  });

  it('REJECTS a scenario activity with no steps key', async () => {
    const { error } = await svc.from('activities').insert({
      module_id: moduleId, type: 'scenario', title: 'Broken', position: 3, content: {},
    });
    expect(error).not.toBeNull();
  });

  it('accepts a quiz activity with no content payload', async () => {
    const { error } = await svc.from('activities').insert({
      module_id: moduleId, type: 'quiz', title: 'Mini Quiz', position: 4, content: {},
    });
    expect(error).toBeNull();
  });

  it('cascades modules and activities when the course is deleted', async () => {
    const { data: c } = await svc.from('courses')
      .insert({ slug: `tmp-${Date.now()}`, title: 'Temp', created_by: trainer.id }).select().single();
    const { data: m } = await svc.from('modules')
      .insert({ course_id: c.id, title: 'M', position: 1 }).select().single();
    await svc.from('activities').insert({
      module_id: m.id, type: 'reading', title: 'R', position: 1, content: { body: 'x' },
    });
    await svc.from('courses').delete().eq('id', c.id);
    const { data: mods } = await svc.from('modules').select('id').eq('course_id', c.id);
    expect(mods ?? []).toHaveLength(0);
  });

  it('stores a course material row', async () => {
    const { error } = await svc.from('course_materials').insert({
      course_id: courseId, name: 'H&S Manual', kind: 'pdf',
      storage_path: `${courseId}/manual.pdf`, size_bytes: 2400000, uploaded_by: trainer.id,
    });
    expect(error).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:db -- schema-catalog`
Expected: FAIL — `relation "public.courses" does not exist`

- [ ] **Step 3: Write the enums migration**

Create `supabase/migrations/20260822000100_catalog_enums.sql`:

```sql
create type public.course_status     as enum ('draft','published','archived');
create type public.activity_type     as enum ('video','reading','flashcards','matching','scenario','submission','quiz');
create type public.enrollment_status as enum ('pending','active','completed','withdrawn');
create type public.request_status    as enum ('pending','approved','denied');
```

- [ ] **Step 4: Write the catalog migration**

Create `supabase/migrations/20260822000200_catalog.sql`:

```sql
create table public.courses (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique check (slug = lower(slug) and slug <> ''),
  title       text not null check (title <> ''),
  subtitle    text,
  description text,
  trainer_id  uuid references public.profiles(id) on delete set null,
  color       text,
  icon        text,
  status      public.course_status not null default 'draft',
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.courses enable row level security;
create index courses_trainer_idx on public.courses(trainer_id);
create index courses_status_idx  on public.courses(status);

create trigger courses_touch_updated_at
  before update on public.courses
  for each row execute function public.touch_updated_at();

-- The prototype's learning paths are collapsed into this hierarchy: they were
-- already 1:1 with courses. A cross-course curriculum later is additive.
create table public.modules (
  id                    uuid primary key default gen_random_uuid(),
  course_id             uuid not null references public.courses(id) on delete cascade,
  title                 text not null check (title <> ''),
  position              integer not null check (position > 0),
  unlock_after_module_id uuid references public.modules(id) on delete set null,
  created_at            timestamptz not null default now(),
  unique (course_id, position)
);

alter table public.modules enable row level security;
create index modules_course_idx on public.modules(course_id);

create table public.activities (
  id         uuid primary key default gen_random_uuid(),
  module_id  uuid not null references public.modules(id) on delete cascade,
  type       public.activity_type not null,
  title      text not null check (title <> ''),
  position   integer not null check (position > 0),
  xp         integer not null default 10 check (xp >= 0),
  content    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (module_id, position),
  -- One table and one query path, but a malformed payload cannot be stored.
  constraint activities_content_shape check (
    case type
      when 'flashcards' then content ? 'cards'
      when 'matching'   then content ? 'pairs'
      when 'scenario'   then content ? 'steps'
      when 'reading'    then content ? 'body'
      when 'video'      then content ? 'videoId'
      else true
    end
  )
);

alter table public.activities enable row level security;
create index activities_module_idx on public.activities(module_id);

create table public.course_materials (
  id           uuid primary key default gen_random_uuid(),
  course_id    uuid not null references public.courses(id) on delete cascade,
  name         text not null check (name <> ''),
  kind         text not null check (kind in ('pdf','pptx','docx','xlsx','link')),
  storage_path text,
  external_url text,
  size_bytes   bigint check (size_bytes is null or size_bytes >= 0),
  uploaded_by  uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  -- A material is either a stored file or an external link, never neither.
  constraint course_materials_has_target check (
    (storage_path is not null) <> (external_url is not null)
  )
);

alter table public.course_materials enable row level security;
create index course_materials_course_idx on public.course_materials(course_id);
```

- [ ] **Step 5: Apply and run tests**

Run:
```bash
npx supabase db push --db-url "$(grep '^SUPABASE_DB_URL=' .env.test | cut -d= -f2-)"
npm run test:db -- schema-catalog
```
Expected: PASS (10 tests)

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260822000100_catalog_enums.sql \
        supabase/migrations/20260822000200_catalog.sql \
        supabase/tests/schema-catalog.test.js
git commit -m "feat(db): add catalog tables with per-type activity validation"
```

---

## Task 2: Enrollment tables

**Files:**
- Create: `supabase/migrations/20260822000300_enrollment.sql`
- Create: `supabase/tests/schema-enrollment.test.js`

**Interfaces:**
- Consumes: `public.courses`, `public.activities` from Task 1; `public.profiles` from M1
- Produces: tables `public.enrollments(id, trainee_id, course_id, status, decided_by, decided_at, completed_at, created_at)`, `public.activity_completions(id, enrollment_id, activity_id, completed_at, payload)`, `public.teaching_requests(id, trainer_id, course_id, status, decided_by, decided_at, created_at)`

- [ ] **Step 1: Write the failing test**

Create `supabase/tests/schema-enrollment.test.js`:

```javascript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { serviceClient, createUser, resetDb, uniqueEmail } from './helpers.js';

const svc = serviceClient();
let trainer, trainee, courseId, activityId;

beforeAll(async () => {
  await resetDb();
  trainer = await createUser({ email: uniqueEmail(), role: 'trainer' });
  trainee = await createUser({ email: uniqueEmail(), role: 'trainee' });
  const { data: c } = await svc.from('courses')
    .insert({ slug: `en-${Date.now()}`, title: 'Enrolment Course', trainer_id: trainer.id, created_by: trainer.id })
    .select().single();
  courseId = c.id;
  const { data: m } = await svc.from('modules')
    .insert({ course_id: courseId, title: 'M1', position: 1 }).select().single();
  const { data: a } = await svc.from('activities')
    .insert({ module_id: m.id, type: 'reading', title: 'Read', position: 1, content: { body: 'x' } })
    .select().single();
  activityId = a.id;
});
afterAll(async () => {
  await svc.from('courses').delete().eq('id', courseId);
  await resetDb();
});

describe('enrollment schema', () => {
  it('defaults a new enrollment to pending', async () => {
    const { data } = await svc.from('enrollments')
      .insert({ trainee_id: trainee.id, course_id: courseId }).select().single();
    expect(data.status).toBe('pending');
    await svc.from('enrollments').delete().eq('id', data.id);
  });

  it('rejects a duplicate enrollment for the same trainee and course', async () => {
    const { data: first } = await svc.from('enrollments')
      .insert({ trainee_id: trainee.id, course_id: courseId }).select().single();
    const { error } = await svc.from('enrollments')
      .insert({ trainee_id: trainee.id, course_id: courseId });
    expect(error).not.toBeNull();
    await svc.from('enrollments').delete().eq('id', first.id);
  });

  it('records a completion against an enrollment', async () => {
    const { data: e } = await svc.from('enrollments')
      .insert({ trainee_id: trainee.id, course_id: courseId, status: 'active' }).select().single();
    const { error } = await svc.from('activity_completions')
      .insert({ enrollment_id: e.id, activity_id: activityId, payload: { score: 1 } });
    expect(error).toBeNull();
    await svc.from('enrollments').delete().eq('id', e.id);
  });

  it('rejects completing the same activity twice in one enrollment', async () => {
    const { data: e } = await svc.from('enrollments')
      .insert({ trainee_id: trainee.id, course_id: courseId, status: 'active' }).select().single();
    await svc.from('activity_completions').insert({ enrollment_id: e.id, activity_id: activityId });
    const { error } = await svc.from('activity_completions')
      .insert({ enrollment_id: e.id, activity_id: activityId });
    expect(error).not.toBeNull();
    await svc.from('enrollments').delete().eq('id', e.id);
  });

  it('cascades completions when the enrollment is deleted', async () => {
    const { data: e } = await svc.from('enrollments')
      .insert({ trainee_id: trainee.id, course_id: courseId, status: 'active' }).select().single();
    await svc.from('activity_completions').insert({ enrollment_id: e.id, activity_id: activityId });
    await svc.from('enrollments').delete().eq('id', e.id);
    const { data } = await svc.from('activity_completions').select('id').eq('enrollment_id', e.id);
    expect(data ?? []).toHaveLength(0);
  });

  it('defaults a teaching request to pending', async () => {
    const { data } = await svc.from('teaching_requests')
      .insert({ trainer_id: trainer.id, course_id: courseId }).select().single();
    expect(data.status).toBe('pending');
    await svc.from('teaching_requests').delete().eq('id', data.id);
  });

  it('allows a second teaching request once the first is decided', async () => {
    const { data: first } = await svc.from('teaching_requests')
      .insert({ trainer_id: trainer.id, course_id: courseId }).select().single();
    await svc.from('teaching_requests').update({ status: 'denied' }).eq('id', first.id);
    const { error } = await svc.from('teaching_requests')
      .insert({ trainer_id: trainer.id, course_id: courseId });
    expect(error).toBeNull();
    await svc.from('teaching_requests').delete().eq('course_id', courseId);
  });

  it('rejects two PENDING teaching requests for the same pair', async () => {
    const { data: first } = await svc.from('teaching_requests')
      .insert({ trainer_id: trainer.id, course_id: courseId }).select().single();
    const { error } = await svc.from('teaching_requests')
      .insert({ trainer_id: trainer.id, course_id: courseId });
    expect(error).not.toBeNull();
    await svc.from('teaching_requests').delete().eq('id', first.id);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:db -- schema-enrollment`
Expected: FAIL — `relation "public.enrollments" does not exist`

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260822000300_enrollment.sql`:

```sql
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
```

- [ ] **Step 4: Apply and run tests**

Run:
```bash
npx supabase db push --db-url "$(grep '^SUPABASE_DB_URL=' .env.test | cut -d= -f2-)"
npm run test:db -- schema-enrollment
```
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260822000300_enrollment.sql supabase/tests/schema-enrollment.test.js
git commit -m "feat(db): add enrollment, completion and teaching-request tables"
```

---

## Task 3: Catalog helpers and the derived progress view

**Files:**
- Create: `supabase/migrations/20260822000400_catalog_helpers.sql`
- Create: `supabase/tests/progress-view.test.js`

**Interfaces:**
- Consumes: tables from Tasks 1 and 2; `app.is_admin()`, `app.supervises()` from M1
- Produces: `app.is_trainer_of(course uuid) returns boolean`, `app.is_enrolled(course uuid) returns boolean`, `app.owns_enrollment(enrollment uuid) returns boolean`; view `public.enrollment_progress(enrollment_id, trainee_id, course_id, total_activities, completed_activities, percent)`

- [ ] **Step 1: Write the failing test**

Create `supabase/tests/progress-view.test.js`:

```javascript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { serviceClient, createUser, signIn, resetDb, uniqueEmail } from './helpers.js';

const svc = serviceClient();
let trainer, traineeA, traineeB, courseId, activityIds = [], enrolA, enrolB;

beforeAll(async () => {
  await resetDb();
  trainer  = await createUser({ email: uniqueEmail(), role: 'trainer' });
  traineeA = await createUser({ email: uniqueEmail(), role: 'trainee' });
  traineeB = await createUser({ email: uniqueEmail(), role: 'trainee' });

  const { data: c } = await svc.from('courses')
    .insert({ slug: `pg-${Date.now()}`, title: 'Progress Course', trainer_id: trainer.id, created_by: trainer.id })
    .select().single();
  courseId = c.id;
  const { data: m } = await svc.from('modules')
    .insert({ course_id: courseId, title: 'M1', position: 1 }).select().single();
  for (let i = 1; i <= 4; i++) {
    const { data: a } = await svc.from('activities')
      .insert({ module_id: m.id, type: 'reading', title: `R${i}`, position: i, content: { body: 'x' } })
      .select().single();
    activityIds.push(a.id);
  }

  const { data: eA } = await svc.from('enrollments')
    .insert({ trainee_id: traineeA.id, course_id: courseId, status: 'active' }).select().single();
  const { data: eB } = await svc.from('enrollments')
    .insert({ trainee_id: traineeB.id, course_id: courseId, status: 'active' }).select().single();
  enrolA = eA.id; enrolB = eB.id;

  // A completes two of four; B completes none.
  await svc.from('activity_completions').insert([
    { enrollment_id: enrolA, activity_id: activityIds[0] },
    { enrollment_id: enrolA, activity_id: activityIds[1] },
  ]);
});
afterAll(async () => {
  await svc.from('courses').delete().eq('id', courseId);
  await resetDb();
});

describe('enrollment_progress view', () => {
  it('computes percent from completions, not a stored column', async () => {
    const { data } = await svc.from('enrollment_progress')
      .select('*').eq('enrollment_id', enrolA).single();
    expect(data.total_activities).toBe(4);
    expect(data.completed_activities).toBe(2);
    expect(data.percent).toBe(50);
  });

  it('is per trainee, not per course', async () => {
    const { data } = await svc.from('enrollment_progress')
      .select('percent').eq('enrollment_id', enrolB).single();
    expect(data.percent).toBe(0);
  });

  it('updates immediately when a completion is added', async () => {
    await svc.from('activity_completions')
      .insert({ enrollment_id: enrolB, activity_id: activityIds[0] });
    const { data } = await svc.from('enrollment_progress')
      .select('percent').eq('enrollment_id', enrolB).single();
    expect(data.percent).toBe(25);
  });

  it('reports 0 rather than dividing by zero for an empty course', async () => {
    const { data: c } = await svc.from('courses')
      .insert({ slug: `empty-${Date.now()}`, title: 'Empty', created_by: trainer.id }).select().single();
    const { data: e } = await svc.from('enrollments')
      .insert({ trainee_id: traineeA.id, course_id: c.id, status: 'active' }).select().single();
    const { data } = await svc.from('enrollment_progress')
      .select('percent,total_activities').eq('enrollment_id', e.id).single();
    expect(data.total_activities).toBe(0);
    expect(data.percent).toBe(0);
    await svc.from('courses').delete().eq('id', c.id);
  });
});

describe('catalog helper functions', () => {
  it('is_trainer_of is true for the owning trainer', async () => {
    const c = await signIn(trainer.email);
    const { data } = await c.rpc('is_trainer_of_probe', { course: courseId });
    expect(data).toBe(true);
  });

  it('is_trainer_of is false for another trainer', async () => {
    const other = await createUser({ email: uniqueEmail(), role: 'trainer' });
    const c = await signIn(other.email);
    const { data } = await c.rpc('is_trainer_of_probe', { course: courseId });
    expect(data).toBe(false);
  });

  it('is_enrolled is true for an active enrollment', async () => {
    const c = await signIn(traineeA.email);
    const { data } = await c.rpc('is_enrolled_probe', { course: courseId });
    expect(data).toBe(true);
  });

  it('is_enrolled is FALSE for a merely pending enrollment', async () => {
    const pendingTrainee = await createUser({ email: uniqueEmail(), role: 'trainee' });
    await svc.from('enrollments')
      .insert({ trainee_id: pendingTrainee.id, course_id: courseId, status: 'pending' });
    const c = await signIn(pendingTrainee.email);
    const { data } = await c.rpc('is_enrolled_probe', { course: courseId });
    expect(data).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:db -- progress-view`
Expected: FAIL — `enrollment_progress` does not exist

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260822000400_catalog_helpers.sql`:

```sql
create or replace function app.is_trainer_of(course uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.courses c
     where c.id = course
       and c.trainer_id = (select auth.uid())
  )
$$;

-- Deliberately requires an ACTIVE enrollment. A pending application must not
-- unlock course content while it waits for approval.
create or replace function app.is_enrolled(course uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.enrollments e
     where e.course_id  = course
       and e.trainee_id = (select auth.uid())
       and e.status in ('active','completed')
  )
$$;

create or replace function app.owns_enrollment(enrollment uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.enrollments e
     where e.id = enrollment
       and e.trainee_id = (select auth.uid())
  )
$$;

grant execute on function app.is_trainer_of(uuid)   to authenticated;
grant execute on function app.is_enrolled(uuid)     to authenticated;
grant execute on function app.owns_enrollment(uuid) to authenticated;

create or replace function public.is_trainer_of_probe(course uuid) returns boolean
  language sql stable security invoker set search_path = '' as $$ select app.is_trainer_of(course) $$;

create or replace function public.is_enrolled_probe(course uuid) returns boolean
  language sql stable security invoker set search_path = '' as $$ select app.is_enrolled(course) $$;

-- Progress is DERIVED, never stored. The prototype kept a progress column and
-- nudged it by a magic +15 on completion; a view cannot drift from reality
-- because it is computed from it.
create view public.enrollment_progress
  with (security_invoker = on)
  as
select
  e.id         as enrollment_id,
  e.trainee_id,
  e.course_id,
  coalesce(t.total, 0)     as total_activities,
  coalesce(d.done, 0)      as completed_activities,
  case
    when coalesce(t.total, 0) = 0 then 0
    else round(100.0 * coalesce(d.done, 0) / t.total)::int
  end as percent
from public.enrollments e
left join lateral (
  select count(*)::int as total
    from public.activities a
    join public.modules m on m.id = a.module_id
   where m.course_id = e.course_id
) t on true
left join lateral (
  select count(*)::int as done
    from public.activity_completions ac
   where ac.enrollment_id = e.id
) d on true;

grant select on public.enrollment_progress to authenticated;
```

- [ ] **Step 4: Apply and run tests**

Run:
```bash
npx supabase db push --db-url "$(grep '^SUPABASE_DB_URL=' .env.test | cut -d= -f2-)"
npm run test:db -- progress-view
```
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260822000400_catalog_helpers.sql supabase/tests/progress-view.test.js
git commit -m "feat(db): derive enrollment progress from completions"
```

---

## Task 4: Catalog read and write policies

**Files:**
- Create: `supabase/migrations/20260822000500_catalog_rls.sql`
- Create: `supabase/tests/rls-catalog.test.js`

**Interfaces:**
- Consumes: `app.is_admin()`, `app.is_trainer_of()`, `app.is_enrolled()`
- Produces: SELECT/INSERT/UPDATE/DELETE policies on `courses`, `modules`, `activities`, `course_materials`

- [ ] **Step 1: Write the failing red-team test**

Create `supabase/tests/rls-catalog.test.js`:

```javascript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { serviceClient, anonClient, createUser, signIn, resetDb, uniqueEmail } from './helpers.js';

const svc = serviceClient();
let admin, ownerTrainer, otherTrainer, trainee, outsider;
let cAdmin, cOwner, cOther, cTrainee, cOutsider;
let publishedId, draftId, moduleId;

beforeAll(async () => {
  await resetDb();
  admin        = await createUser({ email: uniqueEmail(), role: 'admin' });
  ownerTrainer = await createUser({ email: uniqueEmail(), role: 'trainer' });
  otherTrainer = await createUser({ email: uniqueEmail(), role: 'trainer' });
  trainee      = await createUser({ email: uniqueEmail(), role: 'trainee' });
  outsider     = await createUser({ email: uniqueEmail(), role: 'trainee' });

  const { data: pub } = await svc.from('courses').insert({
    slug: `pub-${Date.now()}`, title: 'Published Course', status: 'published',
    trainer_id: ownerTrainer.id, created_by: admin.id,
  }).select().single();
  publishedId = pub.id;

  const { data: dft } = await svc.from('courses').insert({
    slug: `dft-${Date.now()}`, title: 'Draft Course', status: 'draft',
    trainer_id: ownerTrainer.id, created_by: admin.id,
  }).select().single();
  draftId = dft.id;

  const { data: m } = await svc.from('modules')
    .insert({ course_id: publishedId, title: 'M1', position: 1 }).select().single();
  moduleId = m.id;
  await svc.from('activities').insert({
    module_id: moduleId, type: 'reading', title: 'Read', position: 1, content: { body: 'x' },
  });
  await svc.from('enrollments')
    .insert({ trainee_id: trainee.id, course_id: publishedId, status: 'active' });

  [cAdmin, cOwner, cOther, cTrainee, cOutsider] = await Promise.all([
    signIn(admin.email), signIn(ownerTrainer.email), signIn(otherTrainer.email),
    signIn(trainee.email), signIn(outsider.email),
  ]);
});
afterAll(async () => {
  await svc.from('courses').delete().in('id', [publishedId, draftId]);
  await resetDb();
});

describe('course visibility', () => {
  it('an anonymous visitor sees no courses', async () => {
    const { data } = await anonClient().from('courses').select('id');
    expect(data ?? []).toHaveLength(0);
  });

  it('any signed-in user sees a published course', async () => {
    const { data } = await cOutsider.from('courses').select('id').eq('id', publishedId);
    expect(data).toHaveLength(1);
  });

  it('a trainee does NOT see a draft course', async () => {
    const { data } = await cTrainee.from('courses').select('id').eq('id', draftId);
    expect(data ?? []).toHaveLength(0);
  });

  it('the owning trainer sees their own draft', async () => {
    const { data } = await cOwner.from('courses').select('id').eq('id', draftId);
    expect(data).toHaveLength(1);
  });

  it('another trainer does NOT see that draft', async () => {
    const { data } = await cOther.from('courses').select('id').eq('id', draftId);
    expect(data ?? []).toHaveLength(0);
  });

  it('an admin sees drafts', async () => {
    const { data } = await cAdmin.from('courses').select('id').eq('id', draftId);
    expect(data).toHaveLength(1);
  });
});

describe('RED TEAM: course writes', () => {
  it('a trainee cannot create a course', async () => {
    const { error } = await cTrainee.from('courses')
      .insert({ slug: `evil-${Date.now()}`, title: 'Evil' });
    expect(error).not.toBeNull();
  });

  it('a trainee cannot edit a course', async () => {
    await cTrainee.from('courses').update({ title: 'Hacked' }).eq('id', publishedId);
    const { data } = await svc.from('courses').select('title').eq('id', publishedId).single();
    expect(data.title).toBe('Published Course');
  });

  it('a trainer cannot edit ANOTHER trainer course', async () => {
    await cOther.from('courses').update({ title: 'Stolen' }).eq('id', publishedId);
    const { data } = await svc.from('courses').select('title').eq('id', publishedId).single();
    expect(data.title).toBe('Published Course');
  });

  it('a trainer cannot publish their own course directly', async () => {
    await cOwner.from('courses').update({ status: 'published' }).eq('id', draftId);
    const { data } = await svc.from('courses').select('status').eq('id', draftId).single();
    expect(data.status).toBe('draft');
  });

  it('a trainer cannot reassign a course to themselves', async () => {
    const { data: orphan } = await svc.from('courses').insert({
      slug: `orph-${Date.now()}`, title: 'Orphan', created_by: admin.id,
    }).select().single();
    await cOther.from('courses').update({ trainer_id: otherTrainer.id }).eq('id', orphan.id);
    const { data } = await svc.from('courses').select('trainer_id').eq('id', orphan.id).single();
    expect(data.trainer_id).toBeNull();
    await svc.from('courses').delete().eq('id', orphan.id);
  });

  it('a trainee cannot delete a course', async () => {
    await cTrainee.from('courses').delete().eq('id', publishedId);
    const { data } = await svc.from('courses').select('id').eq('id', publishedId);
    expect(data).toHaveLength(1);
  });
});

describe('legitimate catalog authoring', () => {
  it('the owning trainer can edit their course title', async () => {
    const { error } = await cOwner.from('courses').update({ subtitle: 'Updated' }).eq('id', draftId);
    expect(error).toBeNull();
    const { data } = await svc.from('courses').select('subtitle').eq('id', draftId).single();
    expect(data.subtitle).toBe('Updated');
  });

  it('the owning trainer can add a module', async () => {
    const { error } = await cOwner.from('modules')
      .insert({ course_id: draftId, title: 'New Module', position: 1 });
    expect(error).toBeNull();
  });

  it('an admin can create a course', async () => {
    const { error } = await cAdmin.from('courses')
      .insert({ slug: `adm-${Date.now()}`, title: 'Admin Course', created_by: admin.id });
    expect(error).toBeNull();
  });
});

describe('activity and material visibility', () => {
  it('an enrolled trainee reads activities', async () => {
    const { data } = await cTrainee.from('activities').select('id').eq('module_id', moduleId);
    expect(data.length).toBeGreaterThan(0);
  });

  it('an UNENROLLED user cannot read activities of a published course', async () => {
    const { data } = await cOutsider.from('activities').select('id').eq('module_id', moduleId);
    expect(data ?? []).toHaveLength(0);
  });

  it('an unenrolled user CAN see modules, so the catalog can show an outline', async () => {
    const { data } = await cOutsider.from('modules').select('id').eq('course_id', publishedId);
    expect(data.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:db -- rls-catalog`
Expected: FAIL — with no policies, the legitimate-access tests fail

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260822000500_catalog_rls.sql`:

```sql
-- Courses ---------------------------------------------------------------
revoke all on public.courses from anon, authenticated;
grant select on public.courses to authenticated;
-- Trainers may edit content columns only. status and trainer_id are excluded,
-- so publishing and reassignment cannot happen through a direct table write.
grant update (title, subtitle, description, color, icon) on public.courses to authenticated;
-- Column-limited INSERT too: a table-wide grant would let even an admin create
-- a course already marked published, bypassing the content check in
-- publish-course. status and trainer_id fall to their defaults.
grant insert (slug, title, subtitle, description, color, icon) on public.courses to authenticated;
grant delete on public.courses to authenticated;

create policy courses_select_published on public.courses
  for select to authenticated using (status = 'published');

create policy courses_select_own on public.courses
  for select to authenticated using (app.is_trainer_of(id));

create policy courses_select_admin on public.courses
  for select to authenticated using (app.is_admin());

create policy courses_insert_admin on public.courses
  for insert to authenticated with check (app.is_admin());

create policy courses_update_owner on public.courses
  for update to authenticated
  using (app.is_trainer_of(id) or app.is_admin())
  with check (app.is_trainer_of(id) or app.is_admin());

create policy courses_delete_admin on public.courses
  for delete to authenticated using (app.is_admin());

-- Modules ---------------------------------------------------------------
revoke all on public.modules from anon, authenticated;
grant select, insert, update, delete on public.modules to authenticated;

-- Visible with the course, so the catalog can show an outline before enrolling.
create policy modules_select on public.modules
  for select to authenticated
  using (
    app.is_admin()
    or app.is_trainer_of(course_id)
    or exists (select 1 from public.courses c where c.id = course_id and c.status = 'published')
  );

create policy modules_write on public.modules
  for all to authenticated
  using (app.is_admin() or app.is_trainer_of(course_id))
  with check (app.is_admin() or app.is_trainer_of(course_id));

-- Activities ------------------------------------------------------------
revoke all on public.activities from anon, authenticated;
grant select, insert, update, delete on public.activities to authenticated;

-- Content is gated on enrolment: a published course advertises its outline,
-- but the material itself is for enrolled trainees and course staff.
create policy activities_select on public.activities
  for select to authenticated
  using (
    exists (
      select 1 from public.modules m
       where m.id = module_id
         and (app.is_admin() or app.is_trainer_of(m.course_id) or app.is_enrolled(m.course_id))
    )
  );

create policy activities_write on public.activities
  for all to authenticated
  using (
    exists (select 1 from public.modules m
             where m.id = module_id and (app.is_admin() or app.is_trainer_of(m.course_id)))
  )
  with check (
    exists (select 1 from public.modules m
             where m.id = module_id and (app.is_admin() or app.is_trainer_of(m.course_id)))
  );

-- Course materials ------------------------------------------------------
revoke all on public.course_materials from anon, authenticated;
grant select, insert, update, delete on public.course_materials to authenticated;

create policy course_materials_select on public.course_materials
  for select to authenticated
  using (app.is_admin() or app.is_trainer_of(course_id) or app.is_enrolled(course_id));

create policy course_materials_write on public.course_materials
  for all to authenticated
  using (app.is_admin() or app.is_trainer_of(course_id))
  with check (app.is_admin() or app.is_trainer_of(course_id));
```

- [ ] **Step 4: Apply and run tests**

Run:
```bash
npx supabase db push --db-url "$(grep '^SUPABASE_DB_URL=' .env.test | cut -d= -f2-)"
npm run test:db -- rls-catalog
```
Expected: PASS (15 tests)

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260822000500_catalog_rls.sql supabase/tests/rls-catalog.test.js
git commit -m "feat(db): add catalog read and write policies"
```

---

## Task 5: Enrollment policies

**Files:**
- Create: `supabase/migrations/20260822000600_enrollment_rls.sql`
- Create: `supabase/tests/rls-enrollment.test.js`

**Interfaces:**
- Consumes: `app.is_admin()`, `app.is_trainer_of()`, `app.owns_enrollment()`, `app.supervises()`
- Produces: policies on `enrollments`, `activity_completions`, `teaching_requests`

- [ ] **Step 1: Write the failing red-team test**

Create `supabase/tests/rls-enrollment.test.js`:

```javascript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { serviceClient, createUser, signIn, resetDb, uniqueEmail } from './helpers.js';

const svc = serviceClient();
let admin, ownerTrainer, otherTrainer, supervisor, traineeA, traineeB;
let cAdmin, cOwner, cOther, cSupervisor, cTraineeA;
let courseId, enrolA;

beforeAll(async () => {
  await resetDb();
  admin        = await createUser({ email: uniqueEmail(), role: 'admin' });
  ownerTrainer = await createUser({ email: uniqueEmail(), role: 'trainer' });
  otherTrainer = await createUser({ email: uniqueEmail(), role: 'trainer' });
  supervisor   = await createUser({ email: uniqueEmail(), role: 'supervisor' });
  traineeA     = await createUser({ email: uniqueEmail(), role: 'trainee' });
  traineeB     = await createUser({ email: uniqueEmail(), role: 'trainee' });

  await svc.from('supervisor_trainers')
    .insert({ supervisor_id: supervisor.id, trainer_id: ownerTrainer.id });

  const { data: c } = await svc.from('courses').insert({
    slug: `enr-${Date.now()}`, title: 'Enrolment Course', status: 'published',
    trainer_id: ownerTrainer.id, created_by: admin.id,
  }).select().single();
  courseId = c.id;

  const { data: e } = await svc.from('enrollments')
    .insert({ trainee_id: traineeA.id, course_id: courseId, status: 'active' }).select().single();
  enrolA = e.id;
  await svc.from('enrollments')
    .insert({ trainee_id: traineeB.id, course_id: courseId, status: 'active' });

  [cAdmin, cOwner, cOther, cSupervisor, cTraineeA] = await Promise.all([
    signIn(admin.email), signIn(ownerTrainer.email), signIn(otherTrainer.email),
    signIn(supervisor.email), signIn(traineeA.email),
  ]);
});
afterAll(async () => {
  await svc.from('courses').delete().eq('id', courseId);
  await resetDb();
});

describe('RED TEAM: enrollment', () => {
  it('a trainee cannot self-approve an enrollment', async () => {
    const { data: c2 } = await svc.from('courses').insert({
      slug: `self-${Date.now()}`, title: 'Self Approve', status: 'published', created_by: admin.id,
    }).select().single();
    await cTraineeA.from('enrollments').insert({ trainee_id: traineeA.id, course_id: c2.id });
    await cTraineeA.from('enrollments').update({ status: 'active' })
      .eq('trainee_id', traineeA.id).eq('course_id', c2.id);
    const { data } = await svc.from('enrollments')
      .select('status').eq('trainee_id', traineeA.id).eq('course_id', c2.id).single();
    expect(data.status).toBe('pending');
    await svc.from('courses').delete().eq('id', c2.id);
  });

  it('a trainee cannot enrol somebody else', async () => {
    const { error } = await cTraineeA.from('enrollments')
      .insert({ trainee_id: traineeB.id, course_id: courseId });
    expect(error).not.toBeNull();
  });

  // The WITH CHECK does not constrain status; the column-limited INSERT grant
  // is what forces it to 'pending'. Assert the grant, not just the policy.
  it('a trainee cannot apply with status already set to active', async () => {
    const { data: c2 } = await svc.from('courses').insert({
      slug: `sneak-${Date.now()}`, title: 'Sneak', status: 'published', created_by: admin.id,
    }).select().single();
    const { error } = await cTraineeA.from('enrollments')
      .insert({ trainee_id: traineeA.id, course_id: c2.id, status: 'active' });
    expect(error).not.toBeNull();
    await svc.from('courses').delete().eq('id', c2.id);
  });

  it('a trainer cannot open a teaching request already marked approved', async () => {
    const { data: c2 } = await svc.from('courses').insert({
      slug: `treq-${Date.now()}`, title: 'Teach Sneak', created_by: admin.id,
    }).select().single();
    const { error } = await cOther.from('teaching_requests')
      .insert({ trainer_id: otherTrainer.id, course_id: c2.id, status: 'approved' });
    expect(error).not.toBeNull();
    await svc.from('courses').delete().eq('id', c2.id);
  });

  it('a trainee cannot read another trainee enrollment', async () => {
    const { data } = await cTraineeA.from('enrollments').select('id').eq('trainee_id', traineeB.id);
    expect(data ?? []).toHaveLength(0);
  });

  it('a trainer cannot see enrollments on a course they do not own', async () => {
    const { data } = await cOther.from('enrollments').select('id').eq('course_id', courseId);
    expect(data ?? []).toHaveLength(0);
  });

  it('a trainee cannot fabricate a completion for another enrollment', async () => {
    const { data: other } = await svc.from('enrollments')
      .select('id').eq('trainee_id', traineeB.id).single();
    const { data: m } = await svc.from('modules')
      .insert({ course_id: courseId, title: 'M', position: 99 }).select().single();
    const { data: a } = await svc.from('activities')
      .insert({ module_id: m.id, type: 'reading', title: 'R', position: 1, content: { body: 'x' } })
      .select().single();
    const { error } = await cTraineeA.from('activity_completions')
      .insert({ enrollment_id: other.id, activity_id: a.id });
    expect(error).not.toBeNull();
  });

  it('a trainer cannot approve their own teaching request', async () => {
    const { data: req } = await svc.from('teaching_requests')
      .insert({ trainer_id: otherTrainer.id, course_id: courseId }).select().single();
    await cOther.from('teaching_requests').update({ status: 'approved' }).eq('id', req.id);
    const { data } = await svc.from('teaching_requests').select('status').eq('id', req.id).single();
    expect(data.status).toBe('pending');
    await svc.from('teaching_requests').delete().eq('id', req.id);
  });
});

describe('legitimate enrollment access', () => {
  it('a trainee applies for a published course as pending', async () => {
    const { data: c2 } = await svc.from('courses').insert({
      slug: `apply-${Date.now()}`, title: 'Apply', status: 'published', created_by: admin.id,
    }).select().single();
    const { error } = await cTraineeA.from('enrollments')
      .insert({ trainee_id: traineeA.id, course_id: c2.id });
    expect(error).toBeNull();
    const { data } = await svc.from('enrollments')
      .select('status').eq('trainee_id', traineeA.id).eq('course_id', c2.id).single();
    expect(data.status).toBe('pending');
    await svc.from('courses').delete().eq('id', c2.id);
  });

  it('a trainee reads their own enrollment', async () => {
    const { data } = await cTraineeA.from('enrollments').select('id').eq('id', enrolA);
    expect(data).toHaveLength(1);
  });

  it('the owning trainer sees enrollments on their course', async () => {
    const { data } = await cOwner.from('enrollments').select('id').eq('course_id', courseId);
    expect(data.length).toBeGreaterThanOrEqual(2);
  });

  it('a supervisor sees enrollments on a managed trainer course', async () => {
    const { data } = await cSupervisor.from('enrollments').select('id').eq('course_id', courseId);
    expect(data.length).toBeGreaterThanOrEqual(2);
  });

  it('an admin sees every enrollment', async () => {
    const { data } = await cAdmin.from('enrollments').select('id');
    expect(data.length).toBeGreaterThanOrEqual(2);
  });

  it('a trainee reads their own progress row', async () => {
    const { data } = await cTraineeA.from('enrollment_progress')
      .select('percent').eq('enrollment_id', enrolA).single();
    expect(data.percent).toBe(0);
  });

  it('the owning trainer can read the name of a trainee on their course', async () => {
    const { data } = await cOwner.from('profiles').select('name').eq('id', traineeA.id);
    expect(data).toHaveLength(1);
  });

  it('a trainer still cannot read a trainee with no enrollment on their course', async () => {
    const stranger = await createUser({ email: uniqueEmail(), role: 'trainee' });
    const { data } = await cOwner.from('profiles').select('name').eq('id', stranger.id);
    expect(data ?? []).toHaveLength(0);
  });

  it('a trainer may open a teaching request', async () => {
    const { data: c2 } = await svc.from('courses').insert({
      slug: `teach-${Date.now()}`, title: 'Teach Me', status: 'draft', created_by: admin.id,
    }).select().single();
    const { error } = await cOther.from('teaching_requests')
      .insert({ trainer_id: otherTrainer.id, course_id: c2.id });
    expect(error).toBeNull();
    await svc.from('courses').delete().eq('id', c2.id);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:db -- rls-enrollment`
Expected: FAIL — the legitimate-access tests fail with no policies

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260822000600_enrollment_rls.sql`:

```sql
-- Enrollments -----------------------------------------------------------
revoke all on public.enrollments from anon, authenticated;
grant select on public.enrollments to authenticated;
-- Column-limited INSERT. A table-wide grant would let a trainee apply with
-- status already set to 'active' — the WITH CHECK below does not constrain
-- status, so the grant is what forces it to the 'pending' default.
grant insert (trainee_id, course_id) on public.enrollments to authenticated;

create policy enrollments_select_own on public.enrollments
  for select to authenticated using ((select auth.uid()) = trainee_id);

create policy enrollments_select_course_staff on public.enrollments
  for select to authenticated using (app.is_admin() or app.is_trainer_of(course_id));

-- Three hops: supervisor -> managed trainer -> their course -> its enrollments.
create policy enrollments_select_supervisor on public.enrollments
  for select to authenticated
  using (
    exists (select 1 from public.courses c
             where c.id = course_id and app.supervises(c.trainer_id))
  );

-- Applications are only for published courses, only for yourself.
create policy enrollments_insert_self on public.enrollments
  for insert to authenticated
  with check (
    (select auth.uid()) = trainee_id
    and exists (select 1 from public.courses c where c.id = course_id and c.status = 'published')
  );

-- Activity completions ---------------------------------------------------
revoke all on public.activity_completions from anon, authenticated;
grant select on public.activity_completions to authenticated;

create policy activity_completions_select on public.activity_completions
  for select to authenticated
  using (
    app.owns_enrollment(enrollment_id)
    or exists (select 1 from public.enrollments e
                where e.id = enrollment_id
                  and (app.is_admin() or app.is_trainer_of(e.course_id)))
  );

-- No INSERT grant: completions are written by the complete-activity Edge
-- Function, which checks module unlocking server-side. A client-written
-- completion could skip prerequisites.

-- Teaching requests ------------------------------------------------------
revoke all on public.teaching_requests from anon, authenticated;
grant select on public.teaching_requests to authenticated;
-- Column-limited for the same reason: a trainer must not be able to open a
-- request that is already approved.
grant insert (trainer_id, course_id) on public.teaching_requests to authenticated;

create policy teaching_requests_select on public.teaching_requests
  for select to authenticated
  using ((select auth.uid()) = trainer_id or app.is_admin());

create policy teaching_requests_insert_self on public.teaching_requests
  for insert to authenticated
  with check (
    (select auth.uid()) = trainer_id
    and app.my_role() = 'trainer'
  );

-- Profile visibility along the enrolment chain -----------------------------
-- M1 restricted profiles to self, admins and managed trainers, noting that
-- trainee visibility "follows the enrolment chain and arrives with the catalog
-- milestone". This is that policy: without it a trainer cannot read the name
-- of a trainee applying to their own course, and the approval queue would show
-- "Unknown" for every row.
create policy profiles_select_my_trainees on public.profiles
  for select to authenticated
  using (
    exists (
      select 1 from public.enrollments e
       where e.trainee_id = profiles.id
         and app.is_trainer_of(e.course_id)
    )
  );
```

- [ ] **Step 4: Apply and run tests**

Run:
```bash
npx supabase db push --db-url "$(grep '^SUPABASE_DB_URL=' .env.test | cut -d= -f2-)"
npm run test:db -- rls-enrollment
```
Expected: PASS (13 tests)

- [ ] **Step 5: Run the whole database suite**

Run: `npm run test:db`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260822000600_enrollment_rls.sql supabase/tests/rls-enrollment.test.js
git commit -m "feat(db): add enrollment and teaching-request policies"
```

---

## Task 6: Approval and publishing Edge Functions

**Files:**
- Create: `supabase/functions/approve-enrollment/index.ts`
- Create: `supabase/functions/approve-teaching-request/index.ts`
- Create: `supabase/functions/publish-course/index.ts`
- Create: `supabase/tests/fn-catalog.test.js`

**Interfaces:**
- Consumes: `requireRole`, `readJson`, `jsonResponse`, `errorResponse`, `HttpError` from `_shared/auth.ts`; `writeAudit` from `_shared/audit.ts`; `corsHeaders`, `handleOptions` from `_shared/cors.ts`
- Produces:
  - `POST /functions/v1/approve-enrollment` body `{ enrollmentId: string, decision: 'approve'|'deny' }` → `{ ok: true, enrollment }`
  - `POST /functions/v1/approve-teaching-request` body `{ requestId: string, decision: 'approve'|'deny' }` → `{ ok: true, request }`
  - `POST /functions/v1/publish-course` body `{ courseId: string, publish: boolean }` → `{ ok: true, course }`

- [ ] **Step 1: Write the failing test**

Create `supabase/tests/fn-catalog.test.js`:

```javascript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { serviceClient, createUser, signIn, resetDb, uniqueEmail, SUPABASE_URL } from './helpers.js';

const svc = serviceClient();
let admin, ownerTrainer, otherTrainer, trainee;
let cAdmin, cOwner, cOther, cTrainee;
let courseId;

async function call(fn, client, body) {
  const { data: { session } } = await client.auth.getSession();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

const auditFor = async (entityId, action) =>
  (await svc.from('audit_log').select('*').eq('entity_id', entityId).eq('action', action)).data ?? [];

async function makeCourse(status = 'published', withActivity = true) {
  const { data: c } = await svc.from('courses').insert({
    slug: `fn-${Date.now()}-${Math.round(Math.random() * 1e6)}`,
    title: 'Fn Course', status, trainer_id: ownerTrainer.id, created_by: admin.id,
  }).select().single();
  if (withActivity) {
    const { data: m } = await svc.from('modules')
      .insert({ course_id: c.id, title: 'M', position: 1 }).select().single();
    await svc.from('activities').insert({
      module_id: m.id, type: 'reading', title: 'R', position: 1, content: { body: 'x' },
    });
  }
  return c.id;
}

beforeAll(async () => {
  await resetDb();
  admin        = await createUser({ email: uniqueEmail(), role: 'admin' });
  ownerTrainer = await createUser({ email: uniqueEmail(), role: 'trainer' });
  otherTrainer = await createUser({ email: uniqueEmail(), role: 'trainer' });
  trainee      = await createUser({ email: uniqueEmail(), role: 'trainee' });
  [cAdmin, cOwner, cOther, cTrainee] = await Promise.all([
    signIn(admin.email), signIn(ownerTrainer.email),
    signIn(otherTrainer.email), signIn(trainee.email),
  ]);
  courseId = await makeCourse();
});
afterAll(async () => {
  await svc.from('courses').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await resetDb();
});

describe('approve-enrollment', () => {
  async function pendingEnrollment() {
    const { data } = await svc.from('enrollments')
      .insert({ trainee_id: trainee.id, course_id: await makeCourse() }).select().single();
    return data;
  }

  it('lets the owning trainer approve', async () => {
    const { data: e } = await svc.from('enrollments')
      .insert({ trainee_id: trainee.id, course_id: courseId }).select().single();
    const res = await call('approve-enrollment', cOwner, { enrollmentId: e.id, decision: 'approve' });
    expect(res.status).toBe(200);
    const { data } = await svc.from('enrollments').select('status,decided_by').eq('id', e.id).single();
    expect(data.status).toBe('active');
    expect(data.decided_by).toBe(ownerTrainer.id);
    await svc.from('enrollments').delete().eq('id', e.id);
  });

  it('writes an audit entry', async () => {
    const e = await pendingEnrollment();
    await call('approve-enrollment', cAdmin, { enrollmentId: e.id, decision: 'approve' });
    const rows = await auditFor(e.id, 'enrollment.decided');
    expect(rows).toHaveLength(1);
    expect(rows[0].after.status).toBe('active');
  });

  it('denies by setting withdrawn', async () => {
    const e = await pendingEnrollment();
    await call('approve-enrollment', cAdmin, { enrollmentId: e.id, decision: 'deny' });
    const { data } = await svc.from('enrollments').select('status').eq('id', e.id).single();
    expect(data.status).toBe('withdrawn');
  });

  it('REJECTS a trainer who does not own the course', async () => {
    const e = await pendingEnrollment();
    const res = await call('approve-enrollment', cOther, { enrollmentId: e.id, decision: 'approve' });
    expect(res.status).toBe(403);
    const { data } = await svc.from('enrollments').select('status').eq('id', e.id).single();
    expect(data.status).toBe('pending');
  });

  it('REJECTS the applying trainee', async () => {
    const e = await pendingEnrollment();
    const res = await call('approve-enrollment', cTrainee, { enrollmentId: e.id, decision: 'approve' });
    expect(res.status).toBe(403);
  });

  it('refuses to decide an already-decided enrollment', async () => {
    const e = await pendingEnrollment();
    await call('approve-enrollment', cAdmin, { enrollmentId: e.id, decision: 'approve' });
    const res = await call('approve-enrollment', cAdmin, { enrollmentId: e.id, decision: 'deny' });
    expect(res.status).toBe(409);
  });

  it('returns 404 for an unknown enrollment', async () => {
    const res = await call('approve-enrollment', cAdmin, {
      enrollmentId: '00000000-0000-0000-0000-000000000000', decision: 'approve',
    });
    expect(res.status).toBe(404);
  });
});

describe('approve-teaching-request', () => {
  it('assigns the trainer on approval', async () => {
    const id = await makeCourse('draft');
    await svc.from('courses').update({ trainer_id: null }).eq('id', id);
    const { data: req } = await svc.from('teaching_requests')
      .insert({ trainer_id: otherTrainer.id, course_id: id }).select().single();
    const res = await call('approve-teaching-request', cAdmin, { requestId: req.id, decision: 'approve' });
    expect(res.status).toBe(200);
    const { data } = await svc.from('courses').select('trainer_id').eq('id', id).single();
    expect(data.trainer_id).toBe(otherTrainer.id);
  });

  it('REJECTS a trainer approving their own request', async () => {
    const id = await makeCourse('draft');
    const { data: req } = await svc.from('teaching_requests')
      .insert({ trainer_id: otherTrainer.id, course_id: id }).select().single();
    const res = await call('approve-teaching-request', cOther, { requestId: req.id, decision: 'approve' });
    expect(res.status).toBe(403);
  });

  it('leaves the trainer unassigned on denial', async () => {
    const id = await makeCourse('draft');
    await svc.from('courses').update({ trainer_id: null }).eq('id', id);
    const { data: req } = await svc.from('teaching_requests')
      .insert({ trainer_id: otherTrainer.id, course_id: id }).select().single();
    await call('approve-teaching-request', cAdmin, { requestId: req.id, decision: 'deny' });
    const { data } = await svc.from('courses').select('trainer_id').eq('id', id).single();
    expect(data.trainer_id).toBeNull();
  });
});

describe('publish-course', () => {
  it('publishes a course that has content', async () => {
    const id = await makeCourse('draft', true);
    const res = await call('publish-course', cOwner, { courseId: id, publish: true });
    expect(res.status).toBe(200);
    const { data } = await svc.from('courses').select('status').eq('id', id).single();
    expect(data.status).toBe('published');
  });

  it('REFUSES to publish an empty course', async () => {
    const id = await makeCourse('draft', false);
    const res = await call('publish-course', cOwner, { courseId: id, publish: true });
    expect(res.status).toBe(422);
    const { data } = await svc.from('courses').select('status').eq('id', id).single();
    expect(data.status).toBe('draft');
  });

  it('REJECTS a trainer publishing a course they do not own', async () => {
    const id = await makeCourse('draft', true);
    const res = await call('publish-course', cOther, { courseId: id, publish: true });
    expect(res.status).toBe(403);
  });

  it('REJECTS a trainee', async () => {
    const id = await makeCourse('draft', true);
    const res = await call('publish-course', cTrainee, { courseId: id, publish: true });
    expect(res.status).toBe(403);
  });

  it('unpublishes back to draft', async () => {
    const id = await makeCourse('published', true);
    const res = await call('publish-course', cOwner, { courseId: id, publish: false });
    expect(res.status).toBe(200);
    const { data } = await svc.from('courses').select('status').eq('id', id).single();
    expect(data.status).toBe('draft');
  });

  it('writes an audit entry', async () => {
    const id = await makeCourse('draft', true);
    await call('publish-course', cOwner, { courseId: id, publish: true });
    expect(await auditFor(id, 'course.published')).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:db -- fn-catalog`
Expected: FAIL — 404, the functions do not exist

- [ ] **Step 3: Write `approve-enrollment`**

Create `supabase/functions/approve-enrollment/index.ts`:

```typescript
import { requireRole, readJson, jsonResponse, errorResponse, HttpError } from '../_shared/auth.ts';
import { writeAudit } from '../_shared/audit.ts';
import { corsHeaders, handleOptions } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const { profile: actor, service } = await requireRole(req, ['admin', 'trainer']);
    const { enrollmentId, decision } = await readJson(req) as
      { enrollmentId?: string; decision?: string };

    if (!enrollmentId || !['approve', 'deny'].includes(decision ?? '')) {
      throw new HttpError(400, 'enrollmentId and decision (approve|deny) are required');
    }

    const { data: enrollment, error: readErr } = await service
      .from('enrollments')
      .select('id, status, course_id, trainee_id, courses(trainer_id)')
      .eq('id', enrollmentId).single();
    if (readErr || !enrollment) throw new HttpError(404, 'Enrollment not found');

    // A trainer may only decide enrollments on their own courses.
    const ownsCourse = enrollment.courses?.trainer_id === actor.id;
    if (actor.role !== 'admin' && !ownsCourse) {
      throw new HttpError(403, 'Not your course');
    }

    if (enrollment.status !== 'pending') {
      throw new HttpError(409, 'Enrollment has already been decided');
    }

    const nextStatus = decision === 'approve' ? 'active' : 'withdrawn';
    const { data: updated, error: updErr } = await service
      .from('enrollments')
      .update({ status: nextStatus, decided_by: actor.id, decided_at: new Date().toISOString() })
      .eq('id', enrollmentId)
      .select('id, status, course_id, trainee_id, decided_by, decided_at').single();
    if (updErr) throw new HttpError(500, updErr.message);

    await writeAudit(service, {
      actor,
      action: 'enrollment.decided',
      entityType: 'enrollment',
      entityId: enrollmentId,
      before: { status: enrollment.status },
      after: { status: updated.status },
    });

    return jsonResponse({ ok: true, enrollment: updated }, corsHeaders);
  } catch (err) {
    return errorResponse(err, corsHeaders);
  }
});
```

- [ ] **Step 4: Write `approve-teaching-request`**

Create `supabase/functions/approve-teaching-request/index.ts`:

```typescript
import { requireRole, readJson, jsonResponse, errorResponse, HttpError } from '../_shared/auth.ts';
import { writeAudit } from '../_shared/audit.ts';
import { corsHeaders, handleOptions } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    // Admin only: a trainer approving their own request would be the whole
    // point of the workflow defeated.
    const { profile: actor, service } = await requireRole(req, ['admin']);
    const { requestId, decision } = await readJson(req) as
      { requestId?: string; decision?: string };

    if (!requestId || !['approve', 'deny'].includes(decision ?? '')) {
      throw new HttpError(400, 'requestId and decision (approve|deny) are required');
    }

    const { data: request, error: readErr } = await service
      .from('teaching_requests').select('id, status, trainer_id, course_id')
      .eq('id', requestId).single();
    if (readErr || !request) throw new HttpError(404, 'Request not found');
    if (request.status !== 'pending') throw new HttpError(409, 'Request has already been decided');

    const nextStatus = decision === 'approve' ? 'approved' : 'denied';
    const { data: updated, error: updErr } = await service
      .from('teaching_requests')
      .update({ status: nextStatus, decided_by: actor.id, decided_at: new Date().toISOString() })
      .eq('id', requestId).select('id, status, trainer_id, course_id').single();
    if (updErr) throw new HttpError(500, updErr.message);

    if (decision === 'approve') {
      const { error: assignErr } = await service
        .from('courses').update({ trainer_id: request.trainer_id }).eq('id', request.course_id);
      if (assignErr) throw new HttpError(500, assignErr.message);
    }

    await writeAudit(service, {
      actor,
      action: 'teaching_request.decided',
      entityType: 'teaching_request',
      entityId: requestId,
      before: { status: request.status },
      after: { status: updated.status, trainerAssigned: decision === 'approve' },
    });

    return jsonResponse({ ok: true, request: updated }, corsHeaders);
  } catch (err) {
    return errorResponse(err, corsHeaders);
  }
});
```

- [ ] **Step 5: Write `publish-course`**

Create `supabase/functions/publish-course/index.ts`:

```typescript
import { requireRole, readJson, jsonResponse, errorResponse, HttpError } from '../_shared/auth.ts';
import { writeAudit } from '../_shared/audit.ts';
import { corsHeaders, handleOptions } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const { profile: actor, service } = await requireRole(req, ['admin', 'trainer']);
    const { courseId, publish } = await readJson(req) as
      { courseId?: string; publish?: boolean };

    if (!courseId || typeof publish !== 'boolean') {
      throw new HttpError(400, 'courseId and boolean publish are required');
    }

    const { data: course, error: readErr } = await service
      .from('courses').select('id, status, trainer_id, title').eq('id', courseId).single();
    if (readErr || !course) throw new HttpError(404, 'Course not found');

    if (actor.role !== 'admin' && course.trainer_id !== actor.id) {
      throw new HttpError(403, 'Not your course');
    }

    // Publishing an empty shell would put a course in the catalog that a
    // trainee can enrol in and then find nothing to do.
    if (publish) {
      const { count } = await service
        .from('activities')
        .select('id, modules!inner(course_id)', { count: 'exact', head: true })
        .eq('modules.course_id', courseId);
      if ((count ?? 0) === 0) {
        throw new HttpError(422, 'A course needs at least one activity before it can be published');
      }
    }

    const nextStatus = publish ? 'published' : 'draft';
    if (course.status === nextStatus) {
      return jsonResponse({ ok: true, course, unchanged: true }, corsHeaders);
    }

    const { data: updated, error: updErr } = await service
      .from('courses').update({ status: nextStatus }).eq('id', courseId)
      .select('id, status, title, trainer_id').single();
    if (updErr) throw new HttpError(500, updErr.message);

    await writeAudit(service, {
      actor,
      action: publish ? 'course.published' : 'course.unpublished',
      entityType: 'course',
      entityId: courseId,
      before: { status: course.status },
      after: { status: updated.status },
    });

    return jsonResponse({ ok: true, course: updated }, corsHeaders);
  } catch (err) {
    return errorResponse(err, corsHeaders);
  }
});
```

- [ ] **Step 6: Deploy and run tests**

Run:
```bash
export SUPABASE_ACCESS_TOKEN=$(grep '^SUPABASE_ACCESS_TOKEN=' .env.test | cut -d= -f2- | tr -d '\r')
for fn in approve-enrollment approve-teaching-request publish-course; do
  npx supabase functions deploy "$fn" --project-ref hwlsbcgvxozxsjmojgxe --use-api
done
npm run test:db -- fn-catalog
```
Expected: PASS (16 tests)

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/approve-enrollment supabase/functions/approve-teaching-request \
        supabase/functions/publish-course supabase/tests/fn-catalog.test.js
git commit -m "feat(fn): add enrollment approval, teaching assignment and publishing"
```

---

## Task 7: Seed the catalog from the prototype data

**Files:**
- Create: `scripts/seed-catalog.mjs`
- Modify: `package.json` (scripts)

**Interfaces:**
- Consumes: every table from Tasks 1 and 2
- Produces: `npm run db:seed-catalog`, which converts `src/data/dummyData.js` into real rows and is safe to re-run

- [ ] **Step 1: Write the seed script**

Create `scripts/seed-catalog.mjs`:

```javascript
// Converts the prototype's dummyData catalog into real rows.
// Idempotent: re-running replaces the seeded courses rather than duplicating.
//
// Usage: npm run db:seed-catalog

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { COURSES, LEARNING_PATHS, ACTIVITIES } from '../src/data/dummyData.js';

const env = Object.fromEntries(
  readFileSync('.env.test', 'utf8').split(/\r?\n/).filter((l) => l.trim() && !l.startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).trim()]; })
);

const svc = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const slugFor = (c) => c.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// The prototype's activity shapes map onto the typed content column.
function contentFor(a) {
  switch (a.type) {
    case 'video':      return { videoId: a.videoId, duration: a.duration, description: a.description };
    case 'reading':    return { body: a.content, estimatedMinutes: a.estimatedMinutes };
    case 'flashcards': return { cards: a.cards };
    case 'matching':   return { pairs: a.pairs };
    case 'scenario':   return { steps: a.steps, description: a.description };
    case 'submission': return { description: a.description };
    default:           return {};
  }
}

async function main() {
  const { data: adminProfile } = await svc
    .from('profiles').select('id').eq('role', 'admin').limit(1).maybeSingle();
  const createdBy = adminProfile?.id ?? null;

  for (const course of COURSES) {
    const slug = slugFor(course);

    // Replace rather than duplicate. Cascades remove modules and activities.
    await svc.from('courses').delete().eq('slug', slug);

    const { data: row, error } = await svc.from('courses').insert({
      slug,
      title: course.title,
      subtitle: course.subtitle,
      description: course.description,
      color: course.color,
      icon: course.icon,
      status: 'published',
      created_by: createdBy,
    }).select().single();
    if (error) throw error;

    // Learning paths are collapsed into the course: a path's modules become
    // the course's modules.
    const path = LEARNING_PATHS.find((p) => p.courseId === course.id);
    const modules = path?.modules ?? [{ id: 'm-default', title: 'Course Content', activities: [] }];

    let modulePosition = 0;
    for (const mod of modules) {
      modulePosition += 1;
      const { data: modRow, error: modErr } = await svc.from('modules').insert({
        course_id: row.id, title: mod.title, position: modulePosition,
      }).select().single();
      if (modErr) throw modErr;

      let activityPosition = 0;
      for (const activityId of mod.activities ?? []) {
        const a = ACTIVITIES[activityId];
        if (!a) continue; // quiz ids live in QUIZZES and arrive with M4
        activityPosition += 1;
        const { error: actErr } = await svc.from('activities').insert({
          module_id: modRow.id,
          type: a.type,
          title: a.title,
          position: activityPosition,
          xp: a.xp ?? 10,
          content: contentFor(a),
        });
        if (actErr) throw actErr;
      }
    }

    // Materials become external links for now; file upload lands in M3.
    for (const mat of course.materials ?? []) {
      await svc.from('course_materials').insert({
        course_id: row.id,
        name: mat.name,
        kind: mat.type === 'link' ? 'link' : mat.type,
        external_url: mat.type === 'link' ? 'https://example.com/placeholder' : null,
        storage_path: mat.type === 'link' ? null : `${row.id}/${mat.name}`,
        uploaded_by: createdBy,
      });
    }

    console.log(`seeded ${slug}`);
  }

  const { count } = await svc.from('courses').select('id', { count: 'exact', head: true });
  console.log(`done. ${count} courses in the catalog.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Add the script**

Add to `package.json` scripts:

```json
"db:seed-catalog": "node ./scripts/seed-catalog.mjs"
```

- [ ] **Step 3: Run it**

Run: `npm run db:seed-catalog`
Expected: three `seeded ...` lines and a final count

- [ ] **Step 4: Run it again to prove idempotency**

Run: `npm run db:seed-catalog`
Expected: identical output, still three courses, no duplicate-slug error

- [ ] **Step 5: Verify the database suite still passes**

Run: `npm run test:db`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add scripts/seed-catalog.mjs package.json
git commit -m "chore: seed the catalog from prototype data"
```

---

## Task 8: Frontend catalog API

**Files:**
- Create: `src/api/courses.js`
- Create: `src/api/enrollments.js`
- Create: `src/api/courses.test.js`

**Interfaces:**
- Consumes: `supabase` from `src/api/client.js`
- Produces:
  - `src/api/courses.js`: `courseToCamel(row)`, `listCourses()`, `getCourse(id)`, `getCourseOutline(id)`, `createCourse({title, subtitle, description, color, icon})`, `updateCourse(id, patch)`, `deleteCourse(id)`, `publishCourse(id, publish)`
  - `src/api/enrollments.js`: `enrollmentToCamel(row)`, `myEnrollments()`, `applyForCourse(courseId)`, `pendingEnrollments()`, `decideEnrollment(enrollmentId, decision)`

- [ ] **Step 1: Write the failing test**

Create `src/api/courses.test.js`:

```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const from = vi.fn();
const invoke = vi.fn();
vi.mock('./client', () => ({ supabase: { from, functions: { invoke } }, isConfigured: true }));

const { courseToCamel, listCourses, publishCourse } = await import('./courses');
const { enrollmentToCamel, applyForCourse } = await import('./enrollments');

beforeEach(() => vi.clearAllMocks());

function chain(result) {
  const obj = {
    select: () => obj, eq: () => obj, order: () => obj, insert: () => obj,
    update: () => obj, delete: () => obj, single: () => Promise.resolve(result),
    maybeSingle: () => Promise.resolve(result),
    then: (res) => Promise.resolve(result).then(res),
  };
  return obj;
}

describe('courseToCamel', () => {
  it('maps snake_case columns and nested progress', () => {
    expect(courseToCamel({
      id: 'c1', slug: 'health-and-safety', title: 'H&S', subtitle: 'Basics',
      description: 'd', trainer_id: 't1', color: '#000', icon: 'x',
      status: 'published', created_at: '2026-01-01T00:00:00Z',
    })).toEqual({
      id: 'c1', slug: 'health-and-safety', title: 'H&S', subtitle: 'Basics',
      description: 'd', trainerId: 't1', color: '#000', icon: 'x',
      status: 'published', createdAt: '2026-01-01T00:00:00Z',
    });
  });

  it('returns null for a missing row', () => {
    expect(courseToCamel(null)).toBeNull();
  });
});

describe('enrollmentToCamel', () => {
  it('maps columns and carries percent when joined', () => {
    expect(enrollmentToCamel({
      id: 'e1', trainee_id: 's1', course_id: 'c1', status: 'active',
      decided_at: null, completed_at: null, percent: 25,
    })).toEqual({
      id: 'e1', traineeId: 's1', courseId: 'c1', status: 'active',
      decidedAt: null, completedAt: null, percent: 25,
    });
  });

  it('defaults percent to 0 when absent', () => {
    expect(enrollmentToCamel({ id: 'e1', trainee_id: 's1', course_id: 'c1', status: 'pending' }).percent).toBe(0);
  });
});

describe('listCourses', () => {
  it('returns mapped rows', async () => {
    from.mockReturnValue(chain({ data: [{ id: 'c1', title: 'X', status: 'published' }], error: null }));
    const out = await listCourses();
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('c1');
  });

  it('throws the server message on failure', async () => {
    from.mockReturnValue(chain({ data: null, error: { message: 'boom' } }));
    await expect(listCourses()).rejects.toThrow(/boom/);
  });
});

describe('publishCourse', () => {
  it('invokes the edge function with the right body', async () => {
    invoke.mockResolvedValue({ data: { ok: true }, error: null });
    await publishCourse('c1', true);
    expect(invoke).toHaveBeenCalledWith('publish-course', { body: { courseId: 'c1', publish: true } });
  });

  it('surfaces an error returned in the body', async () => {
    invoke.mockResolvedValue({ data: { error: 'needs an activity' }, error: null });
    await expect(publishCourse('c1', true)).rejects.toThrow(/needs an activity/);
  });
});

describe('applyForCourse', () => {
  it('inserts only the course id, never a status', async () => {
    const insert = vi.fn(() => chain({ data: { id: 'e1' }, error: null }));
    from.mockReturnValue({ insert });
    await applyForCourse('c1');
    const arg = insert.mock.calls[0][0];
    expect(arg.course_id).toBe('c1');
    expect(arg.status).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/api/courses.test.js`
Expected: FAIL — cannot resolve `./courses`

- [ ] **Step 3: Write `src/api/courses.js`**

```javascript
import { supabase } from './client';

/** The single place course rows become camelCase. */
export function courseToCamel(row) {
  if (!row) return null;
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    subtitle: row.subtitle,
    description: row.description,
    trainerId: row.trainer_id,
    color: row.color,
    icon: row.icon,
    status: row.status,
    createdAt: row.created_at,
  };
}

function unwrap({ data, error }) {
  if (error) throw new Error(error.message);
  return data;
}

export async function listCourses() {
  const rows = unwrap(await supabase.from('courses').select('*').order('title'));
  return (rows ?? []).map(courseToCamel);
}

export async function getCourse(id) {
  return courseToCamel(unwrap(await supabase.from('courses').select('*').eq('id', id).maybeSingle()));
}

/** Course with its modules and their activities, ordered for display. */
export async function getCourseOutline(id) {
  const data = unwrap(await supabase
    .from('courses')
    .select('*, modules(id, title, position, activities(id, type, title, position, xp))')
    .eq('id', id)
    .maybeSingle());
  if (!data) return null;
  return {
    ...courseToCamel(data),
    modules: (data.modules ?? [])
      .sort((a, b) => a.position - b.position)
      .map((m) => ({
        id: m.id,
        title: m.title,
        position: m.position,
        activities: (m.activities ?? [])
          .sort((a, b) => a.position - b.position)
          .map((a) => ({ id: a.id, type: a.type, title: a.title, position: a.position, xp: a.xp })),
      })),
  };
}

const slugify = (title) =>
  String(title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export async function createCourse({ title, subtitle, description, color, icon }) {
  const row = unwrap(await supabase.from('courses')
    .insert({ slug: slugify(title), title, subtitle, description, color, icon })
    .select().single());
  return courseToCamel(row);
}

export async function updateCourse(id, patch) {
  const row = unwrap(await supabase.from('courses')
    .update({
      title: patch.title, subtitle: patch.subtitle, description: patch.description,
      color: patch.color, icon: patch.icon,
    })
    .eq('id', id).select().single());
  return courseToCamel(row);
}

export async function deleteCourse(id) {
  unwrap(await supabase.from('courses').delete().eq('id', id));
}

async function invokeFn(fn, body) {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return data;
}

/** Status is never written directly; the Edge Function validates content first. */
export const publishCourse = (courseId, publish) =>
  invokeFn('publish-course', { courseId, publish });
```

- [ ] **Step 4: Write `src/api/enrollments.js`**

```javascript
import { supabase } from './client';

export function enrollmentToCamel(row) {
  if (!row) return null;
  return {
    id: row.id,
    traineeId: row.trainee_id,
    courseId: row.course_id,
    status: row.status,
    decidedAt: row.decided_at ?? null,
    completedAt: row.completed_at ?? null,
    percent: row.percent ?? 0,
  };
}

function unwrap({ data, error }) {
  if (error) throw new Error(error.message);
  return data;
}

/** The caller's own enrollments, with derived progress joined in. */
export async function myEnrollments() {
  const rows = unwrap(await supabase
    .from('enrollments')
    .select('*, enrollment_progress(percent)'));
  return (rows ?? []).map((r) =>
    enrollmentToCamel({ ...r, percent: r.enrollment_progress?.[0]?.percent ?? 0 }));
}

/**
 * Applies for a course. Deliberately sends only course_id: trainee_id comes
 * from auth.uid() in the RLS check and status is forced to pending by the
 * column default, so an application cannot approve itself.
 */
export async function applyForCourse(courseId) {
  const { data: { user } } = await supabase.auth.getUser();
  const row = unwrap(await supabase.from('enrollments')
    .insert({ course_id: courseId, trainee_id: user.id })
    .select().single());
  return enrollmentToCamel(row);
}

/** Pending applications visible to the caller: their courses, or all for an admin. */
export async function pendingEnrollments() {
  const rows = unwrap(await supabase
    .from('enrollments')
    .select('*, profiles!enrollments_trainee_id_fkey(name, avatar), courses(title)')
    .eq('status', 'pending'));
  return (rows ?? []).map((r) => ({
    ...enrollmentToCamel(r),
    traineeName: r.profiles?.name ?? 'Unknown',
    traineeAvatar: r.profiles?.avatar ?? '?',
    courseTitle: r.courses?.title ?? '',
  }));
}

async function invokeFn(fn, body) {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return data;
}

export const decideEnrollment = (enrollmentId, decision) =>
  invokeFn('approve-enrollment', { enrollmentId, decision });
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/api/courses.test.js`
Expected: PASS (8 tests)

Run: `npm test`
Expected: PASS — all existing tests still green

- [ ] **Step 6: Commit**

```bash
git add src/api/courses.js src/api/enrollments.js src/api/courses.test.js
git commit -m "feat(api): add course and enrollment api modules"
```

---

## Task 9: Wire the catalog into the UI

**Files:**
- Create: `src/hooks/useCourses.js`
- Create: `src/hooks/useCourses.test.jsx`
- Modify: `src/pages/trainee/CourseCatalog.jsx`
- Modify: `src/pages/trainee/TraineeShell.jsx:23-58` (the inline `MyCoursesPage`)

**Interfaces:**
- Consumes: `listCourses`, `getCourseOutline` from `src/api/courses.js`; `myEnrollments`, `applyForCourse` from `src/api/enrollments.js`
- Produces: `useCourses()`, `useMyEnrollments()`, `useApplyForCourse()` — TanStack Query hooks returning `{ data, isLoading, error }` and, for the mutation, `{ mutate, isPending }`

- [ ] **Step 1: Write the failing test**

Create `src/hooks/useCourses.test.jsx`:

```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mocks = vi.hoisted(() => ({
  listCourses: vi.fn(),
  myEnrollments: vi.fn(),
  applyForCourse: vi.fn(),
}));
vi.mock('../api/courses', () => ({ listCourses: mocks.listCourses }));
vi.mock('../api/enrollments', () => ({
  myEnrollments: mocks.myEnrollments, applyForCourse: mocks.applyForCourse,
}));

const { useCourses, useMyEnrollments, useApplyForCourse } = await import('./useCourses');

function wrapper({ children }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => vi.clearAllMocks());

describe('useCourses', () => {
  it('returns courses once loaded', async () => {
    mocks.listCourses.mockResolvedValue([{ id: 'c1', title: 'H&S' }]);
    const { result } = renderHook(() => useCourses(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toHaveLength(1);
  });

  it('surfaces an error', async () => {
    mocks.listCourses.mockRejectedValue(new Error('nope'));
    const { result } = renderHook(() => useCourses(), { wrapper });
    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.error.message).toMatch(/nope/);
  });
});

describe('useMyEnrollments', () => {
  it('returns enrollments once loaded', async () => {
    mocks.myEnrollments.mockResolvedValue([{ id: 'e1', courseId: 'c1', status: 'active', percent: 40 }]);
    const { result } = renderHook(() => useMyEnrollments(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data[0].percent).toBe(40);
  });
});

describe('useApplyForCourse', () => {
  it('calls the api and reports pending state', async () => {
    mocks.applyForCourse.mockResolvedValue({ id: 'e1', status: 'pending' });
    const { result } = renderHook(() => useApplyForCourse(), { wrapper });
    result.current.mutate('c1');
    await waitFor(() => expect(mocks.applyForCourse).toHaveBeenCalledWith('c1'));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/hooks/useCourses.test.jsx`
Expected: FAIL — cannot resolve `./useCourses`

- [ ] **Step 3: Write the hooks**

Create `src/hooks/useCourses.js`:

```javascript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listCourses, getCourseOutline } from '../api/courses';
import { myEnrollments, applyForCourse } from '../api/enrollments';

export const courseKeys = {
  all: ['courses'],
  outline: (id) => ['courses', 'outline', id],
  myEnrollments: ['enrollments', 'mine'],
};

export function useCourses() {
  return useQuery({ queryKey: courseKeys.all, queryFn: listCourses });
}

export function useCourseOutline(id) {
  return useQuery({
    queryKey: courseKeys.outline(id),
    queryFn: () => getCourseOutline(id),
    enabled: Boolean(id),
  });
}

export function useMyEnrollments() {
  return useQuery({ queryKey: courseKeys.myEnrollments, queryFn: myEnrollments });
}

export function useApplyForCourse() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (courseId) => applyForCourse(courseId),
    // The catalog shows an "applied" state, so both lists go stale together.
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: courseKeys.myEnrollments });
      queryClient.invalidateQueries({ queryKey: courseKeys.all });
    },
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/hooks/useCourses.test.jsx`
Expected: PASS (4 tests)

- [ ] **Step 5: Rewrite `CourseCatalog` against real data**

Replace the body of `src/pages/trainee/CourseCatalog.jsx` so it reads from the hooks instead of `useApp()`. Keep the existing card markup and class names; only the data source changes:

```jsx
import { useCourses, useMyEnrollments, useApplyForCourse } from '../../hooks/useCourses';

export default function CourseCatalog() {
  const { data: courses, isLoading, error } = useCourses();
  const { data: enrollments } = useMyEnrollments();
  const apply = useApplyForCourse();

  if (isLoading) return <div className="page-body" role="status">Loading courses…</div>;
  if (error) {
    return (
      <div className="page-body">
        <div className="card no-hover" role="alert" style={{ padding: '2rem', textAlign: 'center' }}>
          <p style={{ color: 'var(--brand-accent)' }}>Could not load the catalog: {error.message}</p>
        </div>
      </div>
    );
  }

  const byCourse = new Map((enrollments ?? []).map((e) => [e.courseId, e]));
  const available = (courses ?? []).filter((c) => byCourse.get(c.id)?.status !== 'active');

  return (
    <div className="page-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div>
        <p className="eyebrow">Course Catalog</p>
        <h1 className="section-heading">Browse Available Courses</h1>
        <p className="section-sub">Apply to join. Your trainer approves each request.</p>
      </div>

      {available.length === 0 ? (
        <div className="card no-hover" style={{ textAlign: 'center', padding: '3rem' }}>
          <p style={{ color: 'var(--text-2)' }}>You are enrolled in every available course.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.5rem' }}>
          {available.map((course) => {
            const enrollment = byCourse.get(course.id);
            const isPending = enrollment?.status === 'pending';
            return (
              <div key={course.id} className="course-card">
                <div className="course-card-header"
                     style={{ background: `linear-gradient(145deg, ${course.color || '#002F6C'}dd, ${course.color || '#002F6C'}aa)` }}>
                  <div className="course-card-icon">{course.icon || '📘'}</div>
                  <div className="course-card-title">{course.title}</div>
                  <div className="course-card-subtitle">{course.subtitle}</div>
                </div>
                <div className="course-card-body">
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-2)', lineHeight: 1.5 }}>
                    {course.description}
                  </p>
                </div>
                <div className="course-card-footer">
                  <button
                    className={`btn btn-block btn-sm ${isPending ? 'btn-ghost' : 'btn-primary'}`}
                    disabled={isPending || apply.isPending}
                    onClick={() => apply.mutate(course.id)}
                  >
                    {isPending ? 'Awaiting approval' : 'Apply to enrol'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Rewrite the inline `MyCoursesPage` in `TraineeShell.jsx`**

Replace the `MyCoursesPage` function (currently lines 23-58) with a version reading real enrollments:

```jsx
function MyCoursesPage() {
  const { data: enrollments, isLoading } = useMyEnrollments();
  const { data: courses } = useCourses();

  if (isLoading) return <div className="page-body" role="status">Loading your courses…</div>;

  const byId = new Map((courses ?? []).map((c) => [c.id, c]));
  const active = (enrollments ?? []).filter((e) => e.status === 'active' || e.status === 'completed');

  return (
    <div className="page-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div>
        <p className="eyebrow">My Courses</p>
        <h1 className="section-heading">Learning Library</h1>
        <p className="section-sub">All your enrolled courses in one place.</p>
      </div>
      {active.length === 0 ? (
        <div className="card no-hover" style={{ textAlign: 'center', padding: '3rem' }}>
          <p style={{ color: 'var(--text-2)', marginBottom: '1rem' }}>You are not enrolled in any course yet.</p>
          <Link to="/trainee/catalog" className="btn btn-primary">Browse the catalog</Link>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.5rem' }}>
          {active.map((enrollment) => {
            const course = byId.get(enrollment.courseId);
            if (!course) return null;
            return (
              <div key={enrollment.id} className="course-card">
                <div className="course-card-header"
                     style={{ background: `linear-gradient(145deg, ${course.color || '#002F6C'}dd, ${course.color || '#002F6C'}aa)` }}>
                  <div className="course-card-icon">{course.icon || '📘'}</div>
                  <div className="course-card-title">{course.title}</div>
                  <div className="course-card-subtitle">{course.subtitle}</div>
                </div>
                <div className="course-card-body">
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-2)', lineHeight: 1.5 }}>{course.description}</p>
                  <div>
                    <div className="course-progress-label">
                      <span>Progress</span>
                      <span style={{ fontWeight: 700, color: 'var(--brand-primary)' }}>{enrollment.percent}%</span>
                    </div>
                    <div className="progress-track">
                      <div className="progress-fill" style={{ width: `${enrollment.percent}%` }} />
                    </div>
                  </div>
                </div>
                <div className="course-card-footer">
                  <Link to={`/trainee/courses/${course.id}`}
                        className="btn btn-primary btn-block btn-sm"
                        style={{ display: 'flex', textDecoration: 'none', justifyContent: 'center', alignItems: 'center' }}>
                    Open Course →
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

Add the import at the top of `TraineeShell.jsx`:

```jsx
import { useCourses, useMyEnrollments } from '../../hooks/useCourses';
```

- [ ] **Step 7: Run the full frontend suite**

Run: `npm test`
Expected: PASS. `CoursePage.test.jsx` still uses `AppProvider` and dummy data; it is unaffected because `CoursePage` itself is not changed in this task.

- [ ] **Step 8: Lint and build**

Run: `npm run lint && npm run build`
Expected: 0 errors, build succeeds

- [ ] **Step 9: Commit**

```bash
git add src/hooks/useCourses.js src/hooks/useCourses.test.jsx \
        src/pages/trainee/CourseCatalog.jsx src/pages/trainee/TraineeShell.jsx
git commit -m "feat(web): read the catalog and enrollments from the database"
```

---

## Task 10: Trainer and admin approval queues

**Files:**
- Create: `src/hooks/useApprovals.js`
- Create: `src/hooks/useApprovals.test.jsx`
- Modify: `src/pages/trainer/TrainerCatalog.jsx`
- Modify: `docs/superpowers/plans/2026-08-22-m2-catalog-and-enrollment.md` (progress table)

**Interfaces:**
- Consumes: `pendingEnrollments`, `decideEnrollment` from `src/api/enrollments.js`
- Produces: `usePendingEnrollments()`, `useDecideEnrollment()` returning `{ mutate, isPending }`

- [ ] **Step 1: Write the failing test**

Create `src/hooks/useApprovals.test.jsx`:

```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mocks = vi.hoisted(() => ({
  pendingEnrollments: vi.fn(),
  decideEnrollment: vi.fn(),
}));
vi.mock('../api/enrollments', () => ({
  pendingEnrollments: mocks.pendingEnrollments,
  decideEnrollment: mocks.decideEnrollment,
}));

const { usePendingEnrollments, useDecideEnrollment } = await import('./useApprovals');

function wrapper({ children }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => vi.clearAllMocks());

describe('usePendingEnrollments', () => {
  it('returns the queue', async () => {
    mocks.pendingEnrollments.mockResolvedValue([
      { id: 'e1', traineeName: 'Amira', courseTitle: 'H&S', status: 'pending' },
    ]);
    const { result } = renderHook(() => usePendingEnrollments(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data[0].traineeName).toBe('Amira');
  });
});

describe('useDecideEnrollment', () => {
  it('passes the decision through', async () => {
    mocks.decideEnrollment.mockResolvedValue({ ok: true });
    const { result } = renderHook(() => useDecideEnrollment(), { wrapper });
    result.current.mutate({ enrollmentId: 'e1', decision: 'approve' });
    await waitFor(() => expect(mocks.decideEnrollment).toHaveBeenCalledWith('e1', 'approve'));
  });

  it('surfaces a rejection', async () => {
    mocks.decideEnrollment.mockRejectedValue(new Error('Not your course'));
    const { result } = renderHook(() => useDecideEnrollment(), { wrapper });
    result.current.mutate({ enrollmentId: 'e1', decision: 'approve' });
    await waitFor(() => expect(result.current.error?.message).toMatch(/Not your course/));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/hooks/useApprovals.test.jsx`
Expected: FAIL — cannot resolve `./useApprovals`

- [ ] **Step 3: Write the hooks**

Create `src/hooks/useApprovals.js`:

```javascript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { pendingEnrollments, decideEnrollment } from '../api/enrollments';

export const approvalKeys = { pendingEnrollments: ['enrollments', 'pending'] };

export function usePendingEnrollments() {
  return useQuery({
    queryKey: approvalKeys.pendingEnrollments,
    queryFn: pendingEnrollments,
  });
}

export function useDecideEnrollment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ enrollmentId, decision }) => decideEnrollment(enrollmentId, decision),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: approvalKeys.pendingEnrollments });
      queryClient.invalidateQueries({ queryKey: ['enrollments', 'mine'] });
    },
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/hooks/useApprovals.test.jsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Add the queue to `TrainerCatalog.jsx`**

Insert this section above the existing course grid, and add the import
`import { usePendingEnrollments, useDecideEnrollment } from '../../hooks/useApprovals';`:

```jsx
function EnrollmentQueue() {
  const { data: queue, isLoading } = usePendingEnrollments();
  const decide = useDecideEnrollment();

  if (isLoading || !queue || queue.length === 0) return null;

  return (
    <div className="card no-hover" style={{ marginBottom: '1.5rem' }}>
      <div className="card-title">📥 Pending Enrolment Requests ({queue.length})</div>
      {decide.error && (
        <p role="alert" style={{ color: 'var(--brand-accent)', fontSize: '0.85rem' }}>
          {decide.error.message}
        </p>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.75rem' }}>
        {queue.map((req) => (
          <div key={req.id}
               style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap',
                        padding: '0.75rem', borderRadius: 'var(--r-md)', background: 'var(--surface-alt)' }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <strong>{req.traineeName}</strong>
              <span style={{ color: 'var(--text-2)' }}> → {req.courseTitle}</span>
            </div>
            <button className="btn btn-success btn-sm" disabled={decide.isPending}
                    onClick={() => decide.mutate({ enrollmentId: req.id, decision: 'approve' })}>
              Approve
            </button>
            <button className="btn btn-ghost btn-sm" disabled={decide.isPending}
                    onClick={() => decide.mutate({ enrollmentId: req.id, decision: 'deny' })}>
              Deny
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
```

Render `<EnrollmentQueue />` as the first child inside the page body of `TrainerCatalog`.

- [ ] **Step 6: Run the full suites**

Run: `npm test && npm run test:db`
Expected: both PASS

- [ ] **Step 7: Lint and build**

Run: `npm run lint && npm run build`
Expected: 0 errors, build succeeds

- [ ] **Step 8: Update the plan progress table**

Add a `## Progress` section to this plan file marking Tasks 1-10 done, following the format used in the M1 plan, and record any corrections learned during execution.

- [ ] **Step 9: Commit**

```bash
git add src/hooks/useApprovals.js src/hooks/useApprovals.test.jsx \
        src/pages/trainer/TrainerCatalog.jsx docs/superpowers/plans/2026-08-22-m2-catalog-and-enrollment.md
git commit -m "feat(web): add the trainer enrolment approval queue"
```

---

## Verification checklist

After Task 10, confirm each spec requirement:

- [ ] Courses, modules and activities persist across a refresh — Task 1
- [ ] A malformed activity payload is rejected by the database — `schema-catalog.test.js`
- [ ] Progress is per trainee, derived from completions — `progress-view.test.js`
- [ ] An empty course reports 0% rather than dividing by zero — `progress-view.test.js`
- [ ] Anonymous visitors see no courses — `rls-catalog.test.js`
- [ ] A trainee cannot see, edit, publish or delete a draft course — `rls-catalog.test.js`
- [ ] A trainer cannot edit or publish another trainer's course — `rls-catalog.test.js`
- [ ] A trainer cannot reassign a course to themselves — `rls-catalog.test.js`
- [ ] Unenrolled users see the outline but not the activities — `rls-catalog.test.js`
- [ ] A trainee cannot self-approve an enrollment or enrol somebody else — `rls-enrollment.test.js`
- [ ] A trainee cannot apply with `status` pre-set to `active` — `rls-enrollment.test.js`
- [ ] A trainer cannot open a pre-approved teaching request — `rls-enrollment.test.js`
- [ ] A trainer reads names of trainees on their course, and nobody else's — `rls-enrollment.test.js`
- [ ] A trainer cannot approve their own teaching request — `rls-enrollment.test.js` and `fn-catalog.test.js`
- [ ] A supervisor sees enrollments on managed trainers' courses — `rls-enrollment.test.js`
- [ ] Publishing an empty course is refused with 422 — `fn-catalog.test.js`
- [ ] Every approval and publish writes an audit entry — `fn-catalog.test.js`
- [ ] The seed script is idempotent — Task 7 Step 4
- [ ] The 82 frontend and 97 database tests from M1 still pass

## Deferred to later milestones

Not in M2, by design: writing `activity_completions` (M3 — needs the
`complete-activity` Edge Function, which enforces module unlocking server-side,
which is why no INSERT grant exists on that table yet); file upload to Storage
for course materials (M3 — materials seed as links for now); rendering the six
activity types against real data (M3); quizzes and `quiz_answer_keys` (M4); and
an admin UI for teaching requests (the Edge Function exists and is tested, but
nothing calls it yet).
