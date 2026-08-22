# M3 Learning & Progress Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a trainee actually work through a course — the six activity types render from real data, completions are recorded server-side with module prerequisites enforced, and files upload to Supabase Storage.

**Architecture:** Module unlocking moves into the database as `app.is_module_unlocked()`, and a `complete-activity` Edge Function is the only way a completion row can be written — the table has no client INSERT grant, so prerequisites cannot be skipped from the browser. Activity payloads live in a single `content jsonb` column and are flattened in `src/api/` so components keep their existing flat props. Files go direct to Storage via signed URLs, never through a function.

**Tech Stack:** Supabase (Postgres 17, Storage, Edge Functions on Deno), `@supabase/supabase-js` v2, React 19, React Router 7, TanStack Query v5, Vitest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-08-21-nc-spark-backend-design.md` — sections 4.3, 4.4 and 7.

## Global Constraints

- Every `SECURITY DEFINER` function MUST declare `SET search_path = ''` and use fully qualified names.
- Every table MUST have `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` in the migration that creates it.
- **`citext` is unusable under `SET search_path = ''`** — it lives in the `extensions` schema. Use lowercase `text` and `lower()`.
- **A table needs a SELECT policy before self-service UPDATE works.** `UPDATE ... WHERE` applies SELECT policies to its row scan; without one it returns HTTP 200, zero rows, and no error.
- **A `WITH CHECK` subquery over the same table is itself RLS-filtered** and returns NULL. Use a `SECURITY DEFINER` helper.
- **Prefer column-limited grants over table-wide ones.** A `WITH CHECK` that does not mention a column does not protect it; the grant is what forces a default.
- **Never add an `ON DELETE SET NULL` foreign key into `audit_log`** — SET NULL is an UPDATE, which the append-only trigger refuses.
- **`audit_log` cannot be cleaned between test runs.** Scope every audit assertion to a per-run unique value.
- **Test suites must delete by a prefix they own.** Suites that create courses and delete only some leave strays behind.
- **Any frontend test that renders a fetching component needs a `QueryClientProvider`** and stubbed api modules, or it hangs on the loading state.
- All timestamps are `timestamptz not null default now()`.
- Database identifiers are `snake_case`; JavaScript is `camelCase`. Mapping happens in `src/api/`, nowhere else.
- Edge Functions MUST verify the caller by re-reading `profiles`, never by trusting a JWT claim.
- Docker is unavailable. Apply migrations with
  `npx supabase db push --db-url "$(grep '^SUPABASE_DB_URL=' .env.test | cut -d= -f2-)"`
  and deploy with `npx supabase functions deploy <name> --project-ref hwlsbcgvxozxsjmojgxe --use-api`.
- The existing 106 frontend and 180 database tests must pass after every task.

---

## File Structure

**Migrations** — continuing from M2's `...000600`:

| File | Responsibility |
|---|---|
| `20260823000100_module_unlocking.sql` | `app.is_module_unlocked`, `app.module_of_activity`, probe wrappers |
| `20260823000200_storage.sql` | `course-materials` and `submissions` buckets with path-prefix policies |

**Edge Function** — reusing `_shared/` unchanged: `complete-activity/`

**Frontend:**

| File | Responsibility |
|---|---|
| `src/api/activities.js` | Fetch activities, flatten `content` onto the row, record completion |
| `src/api/storage.js` | Signed upload/download URLs for both buckets |
| `src/hooks/useActivities.js` | TanStack Query wrappers |
| `src/pages/trainee/ActivityPage.jsx` | Render a real activity, complete it |
| `src/components/activities/ReadingActivity.jsx` | Read `activity.body` instead of `activity.content` |
| `src/components/activities/FileSubmissionActivity.jsx` | Upload to Storage rather than simulate |

### The content-shape mismatch

The database stores activity payloads nested:

```
{ type: 'flashcards', title: 'Keywords', content: { cards: [...] } }
```

but every component reads flat props — `activity.cards`, `activity.pairs`,
`activity.steps`, `activity.videoId`. Rather than change six components, the
api layer spreads `content` onto the row. The one exception is
`ReadingActivity`, which currently reads `activity.content` as the markdown
body while the database stores it at `content.body`; flattening would leave
`activity.body`, so that component changes to match. This is Task 4.

---

## Task 1: Server-side module unlocking

**Files:**
- Create: `supabase/migrations/20260823000100_module_unlocking.sql`
- Create: `supabase/tests/module-unlocking.test.js`

**Interfaces:**
- Consumes: `modules`, `activities`, `enrollments`, `activity_completions` from M2
- Produces: `app.module_of_activity(activity uuid) returns uuid`, `app.is_module_unlocked(enrollment uuid, module uuid) returns boolean`, `public.is_module_unlocked_probe(enrollment uuid, module uuid) returns boolean`

- [ ] **Step 1: Write the failing test**

Create `supabase/tests/module-unlocking.test.js`:

```javascript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { serviceClient, createUser, signIn, resetDb, uniqueEmail } from './helpers.js';

const svc = serviceClient();
const PREFIX = `unl${Date.now()}`;
let trainer, trainee, cTrainee;
let courseId, modA, modB, modC, actA1, actA2, actB1, enrolId;

beforeAll(async () => {
  await resetDb();
  trainer = await createUser({ email: uniqueEmail(), role: 'trainer' });
  trainee = await createUser({ email: uniqueEmail(), role: 'trainee' });

  const { data: c } = await svc.from('courses').insert({
    slug: `${PREFIX}-1`, title: 'Unlock Course', status: 'published',
    trainer_id: trainer.id, created_by: trainer.id,
  }).select().single();
  courseId = c.id;

  // A (no prerequisite) -> B (needs A) -> C (needs B)
  const mk = async (title, position, after) => {
    const { data } = await svc.from('modules')
      .insert({ course_id: courseId, title, position, unlock_after_module_id: after })
      .select().single();
    return data.id;
  };
  modA = await mk('A', 1, null);
  modB = await mk('B', 2, modA);
  modC = await mk('C', 3, modB);

  const act = async (moduleId, position) => {
    const { data } = await svc.from('activities')
      .insert({ module_id: moduleId, type: 'reading', title: `R${position}`, position, content: { body: 'x' } })
      .select().single();
    return data.id;
  };
  actA1 = await act(modA, 1);
  actA2 = await act(modA, 2);
  actB1 = await act(modB, 1);

  const { data: e } = await svc.from('enrollments')
    .insert({ trainee_id: trainee.id, course_id: courseId, status: 'active' }).select().single();
  enrolId = e.id;

  cTrainee = await signIn(trainee.email);
});
afterAll(async () => {
  await svc.from('courses').delete().like('slug', `${PREFIX}-%`);
  await resetDb();
});

const unlocked = async (moduleId) => {
  const { data } = await cTrainee.rpc('is_module_unlocked_probe', {
    enrollment: enrolId, module: moduleId,
  });
  return data;
};

describe('app.is_module_unlocked', () => {
  it('a module with no prerequisite is unlocked from the start', async () => {
    expect(await unlocked(modA)).toBe(true);
  });

  it('a module whose prerequisite is untouched is locked', async () => {
    expect(await unlocked(modB)).toBe(false);
  });

  it('stays locked when the prerequisite is only PARTLY complete', async () => {
    await svc.from('activity_completions').insert({ enrollment_id: enrolId, activity_id: actA1 });
    expect(await unlocked(modB)).toBe(false);
  });

  it('unlocks once every activity in the prerequisite is complete', async () => {
    await svc.from('activity_completions').insert({ enrollment_id: enrolId, activity_id: actA2 });
    expect(await unlocked(modB)).toBe(true);
  });

  it('does not unlock the module after next', async () => {
    expect(await unlocked(modC)).toBe(false);
  });

  it('unlocks C once B is finished too', async () => {
    await svc.from('activity_completions').insert({ enrollment_id: enrolId, activity_id: actB1 });
    expect(await unlocked(modC)).toBe(true);
  });

  it('treats an EMPTY prerequisite module as satisfied', async () => {
    const { data: empty } = await svc.from('modules')
      .insert({ course_id: courseId, title: 'Empty', position: 10 }).select().single();
    const { data: after } = await svc.from('modules')
      .insert({ course_id: courseId, title: 'After Empty', position: 11, unlock_after_module_id: empty.id })
      .select().single();
    expect(await unlocked(after.id)).toBe(true);
  });

  it('is per enrollment, so another trainee is unaffected', async () => {
    const other = await createUser({ email: uniqueEmail(), role: 'trainee' });
    const { data: e2 } = await svc.from('enrollments')
      .insert({ trainee_id: other.id, course_id: courseId, status: 'active' }).select().single();
    const c2 = await signIn(other.email);
    const { data } = await c2.rpc('is_module_unlocked_probe', { enrollment: e2.id, module: modB });
    expect(data).toBe(false);
  });
});

describe('app.module_of_activity', () => {
  it('returns the owning module', async () => {
    const { data } = await svc.rpc('module_of_activity_probe', { activity: actB1 });
    expect(data).toBe(modB);
  });

  it('returns null for an unknown activity', async () => {
    const { data } = await svc.rpc('module_of_activity_probe', {
      activity: '00000000-0000-0000-0000-000000000000',
    });
    expect(data).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:db -- module-unlocking`
Expected: FAIL — `is_module_unlocked_probe` does not exist

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260823000100_module_unlocking.sql`:

```sql
create or replace function app.module_of_activity(activity uuid)
returns uuid
language sql stable security definer set search_path = ''
as $$ select a.module_id from public.activities a where a.id = activity $$;

-- The single source of truth for prerequisites. The prototype decided this in
-- the browser, where a trainee could skip ahead with devtools.
--
-- A module is unlocked when it has no prerequisite, or when every activity in
-- its prerequisite has a completion row for THIS enrollment. An empty
-- prerequisite counts as satisfied: `not exists` over no rows is true, which
-- is the behaviour we want rather than an accidental permanent lock.
create or replace function app.is_module_unlocked(enrollment uuid, module uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select case
    when m.unlock_after_module_id is null then true
    else not exists (
      select 1
        from public.activities a
       where a.module_id = m.unlock_after_module_id
         and not exists (
           select 1 from public.activity_completions ac
            where ac.enrollment_id = enrollment
              and ac.activity_id   = a.id
         )
    )
  end
  from public.modules m
  where m.id = module
$$;

grant execute on function app.module_of_activity(uuid)      to authenticated;
grant execute on function app.is_module_unlocked(uuid,uuid) to authenticated;

create or replace function public.is_module_unlocked_probe(enrollment uuid, module uuid)
returns boolean
language sql stable security invoker set search_path = ''
as $$ select app.is_module_unlocked(enrollment, module) $$;

create or replace function public.module_of_activity_probe(activity uuid)
returns uuid
language sql stable security invoker set search_path = ''
as $$ select app.module_of_activity(activity) $$;
```

- [ ] **Step 4: Apply and run tests**

Run:
```bash
npx supabase db push --db-url "$(grep '^SUPABASE_DB_URL=' .env.test | cut -d= -f2-)"
npm run test:db -- module-unlocking
```
Expected: PASS (10 tests)

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260823000100_module_unlocking.sql supabase/tests/module-unlocking.test.js
git commit -m "feat(db): move module unlocking into the database"
```

---

## Task 2: The `complete-activity` Edge Function

**Files:**
- Create: `supabase/functions/complete-activity/index.ts`
- Create: `supabase/tests/fn-complete-activity.test.js`

**Interfaces:**
- Consumes: `requireRole`, `readJson`, `jsonResponse`, `errorResponse`, `HttpError` from `_shared/auth.ts`; `app.is_module_unlocked`, `app.module_of_activity` from Task 1
- Produces: `POST /functions/v1/complete-activity` body `{ activityId: string, payload?: object }` → `{ ok: true, completion, progress: { percent, completed, total } }`

- [ ] **Step 1: Write the failing test**

Create `supabase/tests/fn-complete-activity.test.js`:

```javascript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { serviceClient, createUser, signIn, resetDb, uniqueEmail, SUPABASE_URL } from './helpers.js';

const svc = serviceClient();
const PREFIX = `cmp${Date.now()}`;
let trainer, trainee, stranger;
let cTrainee, cStranger;
let courseId, modA, modB, actA1, actA2, actB1, enrolId;

async function call(client, body) {
  const { data: { session } } = await client.auth.getSession();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/complete-activity`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

beforeAll(async () => {
  await resetDb();
  trainer  = await createUser({ email: uniqueEmail(), role: 'trainer' });
  trainee  = await createUser({ email: uniqueEmail(), role: 'trainee' });
  stranger = await createUser({ email: uniqueEmail(), role: 'trainee' });

  const { data: c } = await svc.from('courses').insert({
    slug: `${PREFIX}-1`, title: 'Complete Course', status: 'published',
    trainer_id: trainer.id, created_by: trainer.id,
  }).select().single();
  courseId = c.id;

  const { data: a } = await svc.from('modules')
    .insert({ course_id: courseId, title: 'A', position: 1 }).select().single();
  modA = a.id;
  const { data: b } = await svc.from('modules')
    .insert({ course_id: courseId, title: 'B', position: 2, unlock_after_module_id: modA })
    .select().single();
  modB = b.id;

  const act = async (moduleId, position) => {
    const { data } = await svc.from('activities')
      .insert({ module_id: moduleId, type: 'reading', title: `R${position}`, position, content: { body: 'x' } })
      .select().single();
    return data.id;
  };
  actA1 = await act(modA, 1);
  actA2 = await act(modA, 2);
  actB1 = await act(modB, 1);

  const { data: e } = await svc.from('enrollments')
    .insert({ trainee_id: trainee.id, course_id: courseId, status: 'active' }).select().single();
  enrolId = e.id;

  [cTrainee, cStranger] = await Promise.all([signIn(trainee.email), signIn(stranger.email)]);
});
afterAll(async () => {
  await svc.from('courses').delete().like('slug', `${PREFIX}-%`);
  await resetDb();
});

const completions = async () =>
  (await svc.from('activity_completions').select('activity_id').eq('enrollment_id', enrolId)).data ?? [];

describe('complete-activity', () => {
  it('records a completion in an unlocked module', async () => {
    const res = await call(cTrainee, { activityId: actA1 });
    expect(res.status).toBe(200);
    expect((await completions()).map((c) => c.activity_id)).toContain(actA1);
  });

  it('returns the recalculated progress', async () => {
    const res = await call(cTrainee, { activityId: actA1 });
    expect(res.body.progress.total).toBe(3);
    expect(res.body.progress.completed).toBe(1);
    expect(res.body.progress.percent).toBe(33);
  });

  it('is idempotent — completing twice does not duplicate', async () => {
    await call(cTrainee, { activityId: actA1 });
    const rows = (await completions()).filter((c) => c.activity_id === actA1);
    expect(rows).toHaveLength(1);
  });

  it('stores the payload describing HOW it was completed', async () => {
    await call(cTrainee, { activityId: actA2, payload: { score: 5, of: 6 } });
    const { data } = await svc.from('activity_completions')
      .select('payload').eq('enrollment_id', enrolId).eq('activity_id', actA2).single();
    expect(data.payload).toEqual({ score: 5, of: 6 });
  });

  it('REJECTS an activity in a locked module', async () => {
    // Reset module A so B is locked again.
    await svc.from('activity_completions').delete().eq('enrollment_id', enrolId);
    const res = await call(cTrainee, { activityId: actB1 });
    expect(res.status).toBe(423);
    expect((await completions()).map((c) => c.activity_id)).not.toContain(actB1);
  });

  it('allows it once the prerequisite module is finished', async () => {
    await call(cTrainee, { activityId: actA1 });
    await call(cTrainee, { activityId: actA2 });
    const res = await call(cTrainee, { activityId: actB1 });
    expect(res.status).toBe(200);
  });

  it('REJECTS a trainee who is not enrolled', async () => {
    const res = await call(cStranger, { activityId: actA1 });
    expect(res.status).toBe(403);
  });

  it('returns 404 for an unknown activity', async () => {
    const res = await call(cTrainee, { activityId: '00000000-0000-0000-0000-000000000000' });
    expect(res.status).toBe(404);
  });

  it('rejects a missing activityId', async () => {
    const res = await call(cTrainee, {});
    expect(res.status).toBe(400);
  });

  it('marks the enrollment completed once every activity is done', async () => {
    const { data } = await svc.from('enrollments')
      .select('status, completed_at').eq('id', enrolId).single();
    expect(data.status).toBe('completed');
    expect(data.completed_at).not.toBeNull();
  });
});

describe('RED TEAM: a trainee cannot write completions directly', () => {
  it('has no INSERT grant on activity_completions', async () => {
    const { error } = await cTrainee.from('activity_completions')
      .insert({ enrollment_id: enrolId, activity_id: actB1 });
    expect(error).not.toBeNull();
  });

  it('cannot delete a completion to redo an activity', async () => {
    await cTrainee.from('activity_completions').delete().eq('enrollment_id', enrolId);
    expect((await completions()).length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:db -- fn-complete-activity`
Expected: FAIL — 404, the function does not exist

- [ ] **Step 3: Write the function**

Create `supabase/functions/complete-activity/index.ts`:

```typescript
import { requireRole, readJson, jsonResponse, errorResponse, HttpError } from '../_shared/auth.ts';
import { corsHeaders, handleOptions } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const { profile: actor, service } = await requireRole(req, ['trainee']);
    const { activityId, payload } = await readJson(req) as
      { activityId?: string; payload?: Record<string, unknown> };

    if (!activityId) throw new HttpError(400, 'activityId is required');

    // Resolve the activity and the course it belongs to.
    const { data: activity, error: actErr } = await service
      .from('activities')
      .select('id, module_id, modules(id, course_id)')
      .eq('id', activityId).single();
    if (actErr || !activity) throw new HttpError(404, 'Activity not found');

    const courseId = activity.modules?.course_id;
    if (!courseId) throw new HttpError(404, 'Activity has no course');

    const { data: enrollment, error: enrErr } = await service
      .from('enrollments')
      .select('id, status')
      .eq('course_id', courseId).eq('trainee_id', actor.id).maybeSingle();
    if (enrErr) throw new HttpError(500, enrErr.message);
    if (!enrollment || !['active', 'completed'].includes(enrollment.status)) {
      throw new HttpError(403, 'You are not enrolled in this course');
    }

    // The prerequisite check the client cannot be trusted to make.
    const { data: unlocked, error: lockErr } = await service
      .rpc('is_module_unlocked_probe', { enrollment: enrollment.id, module: activity.module_id });
    if (lockErr) throw new HttpError(500, lockErr.message);
    if (!unlocked) throw new HttpError(423, 'Finish the previous module first');

    // Idempotent: repeating a completion is a no-op, not an error, because a
    // double-submit from a flaky connection should not fail the trainee.
    const { error: insErr } = await service
      .from('activity_completions')
      .upsert(
        { enrollment_id: enrollment.id, activity_id: activityId, payload: payload ?? {} },
        { onConflict: 'enrollment_id,activity_id', ignoreDuplicates: true },
      );
    if (insErr) throw new HttpError(500, insErr.message);

    const { data: progress, error: pErr } = await service
      .from('enrollment_progress')
      .select('percent, completed_activities, total_activities')
      .eq('enrollment_id', enrollment.id).single();
    if (pErr) throw new HttpError(500, pErr.message);

    // Finishing every activity completes the enrollment.
    if (progress.percent === 100 && enrollment.status !== 'completed') {
      await service.from('enrollments')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', enrollment.id);
    }

    return jsonResponse({
      ok: true,
      completion: { activityId, enrollmentId: enrollment.id },
      progress: {
        percent: progress.percent,
        completed: progress.completed_activities,
        total: progress.total_activities,
      },
    }, corsHeaders);
  } catch (err) {
    return errorResponse(err, corsHeaders);
  }
});
```

- [ ] **Step 4: Deploy and run tests**

Run:
```bash
export SUPABASE_ACCESS_TOKEN=$(grep '^SUPABASE_ACCESS_TOKEN=' .env.test | cut -d= -f2- | tr -d '\r')
npx supabase functions deploy complete-activity --project-ref hwlsbcgvxozxsjmojgxe --use-api
npm run test:db -- fn-complete-activity
```
Expected: PASS (12 tests)

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/complete-activity supabase/tests/fn-complete-activity.test.js
git commit -m "feat(fn): record completions with server-side prerequisite checks"
```

---

## Task 3: Storage buckets

**Files:**
- Create: `supabase/migrations/20260823000200_storage.sql`
- Create: `supabase/tests/storage.test.js`

**Interfaces:**
- Consumes: `app.is_admin()`, `app.is_trainer_of()`, `app.is_enrolled()` from M1/M2
- Produces: buckets `course-materials` (path `{course_id}/…`) and `submissions` (path `{course_id}/{trainee_id}/…`), both private, with RLS on `storage.objects`

- [ ] **Step 1: Write the failing test**

Create `supabase/tests/storage.test.js`:

```javascript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { serviceClient, createUser, signIn, resetDb, uniqueEmail } from './helpers.js';

const svc = serviceClient();
const PREFIX = `sto${Date.now()}`;
let trainer, otherTrainer, trainee, stranger;
let cTrainer, cOther, cTrainee, cStranger;
let courseId;

const file = () => new Blob(['hello'], { type: 'text/plain' });

beforeAll(async () => {
  await resetDb();
  trainer      = await createUser({ email: uniqueEmail(), role: 'trainer' });
  otherTrainer = await createUser({ email: uniqueEmail(), role: 'trainer' });
  trainee      = await createUser({ email: uniqueEmail(), role: 'trainee' });
  stranger     = await createUser({ email: uniqueEmail(), role: 'trainee' });

  const { data: c } = await svc.from('courses').insert({
    slug: `${PREFIX}-1`, title: 'Storage Course', status: 'published',
    trainer_id: trainer.id, created_by: trainer.id,
  }).select().single();
  courseId = c.id;

  await svc.from('enrollments')
    .insert({ trainee_id: trainee.id, course_id: courseId, status: 'active' });

  [cTrainer, cOther, cTrainee, cStranger] = await Promise.all([
    signIn(trainer.email), signIn(otherTrainer.email),
    signIn(trainee.email), signIn(stranger.email),
  ]);
});
afterAll(async () => {
  await svc.storage.from('course-materials').remove([`${courseId}/manual.txt`]);
  await svc.storage.from('submissions').remove([`${courseId}/${trainee.id}/work.txt`]);
  await svc.from('courses').delete().like('slug', `${PREFIX}-%`);
  await resetDb();
});

describe('course-materials bucket', () => {
  it('the owning trainer can upload', async () => {
    const { error } = await cTrainer.storage.from('course-materials')
      .upload(`${courseId}/manual.txt`, file(), { upsert: true });
    expect(error).toBeNull();
  });

  it('REJECTS an upload from another trainer', async () => {
    const { error } = await cOther.storage.from('course-materials')
      .upload(`${courseId}/stolen.txt`, file(), { upsert: true });
    expect(error).not.toBeNull();
  });

  it('REJECTS an upload from a trainee', async () => {
    const { error } = await cTrainee.storage.from('course-materials')
      .upload(`${courseId}/cheat.txt`, file(), { upsert: true });
    expect(error).not.toBeNull();
  });

  it('an enrolled trainee can download', async () => {
    const { error } = await cTrainee.storage.from('course-materials')
      .download(`${courseId}/manual.txt`);
    expect(error).toBeNull();
  });

  it('an UNENROLLED user cannot download', async () => {
    const { error } = await cStranger.storage.from('course-materials')
      .download(`${courseId}/manual.txt`);
    expect(error).not.toBeNull();
  });
});

describe('submissions bucket', () => {
  it('the owning trainee can upload under their own prefix', async () => {
    const { error } = await cTrainee.storage.from('submissions')
      .upload(`${courseId}/${trainee.id}/work.txt`, file(), { upsert: true });
    expect(error).toBeNull();
  });

  it('REJECTS a trainee uploading under ANOTHER trainee prefix', async () => {
    const { error } = await cTrainee.storage.from('submissions')
      .upload(`${courseId}/${stranger.id}/forged.txt`, file(), { upsert: true });
    expect(error).not.toBeNull();
  });

  it('the owning trainee can download their own submission', async () => {
    const { error } = await cTrainee.storage.from('submissions')
      .download(`${courseId}/${trainee.id}/work.txt`);
    expect(error).toBeNull();
  });

  it('the course trainer can download a submission', async () => {
    const { error } = await cTrainer.storage.from('submissions')
      .download(`${courseId}/${trainee.id}/work.txt`);
    expect(error).toBeNull();
  });

  it('REJECTS another trainee downloading it', async () => {
    const { error } = await cStranger.storage.from('submissions')
      .download(`${courseId}/${trainee.id}/work.txt`);
    expect(error).not.toBeNull();
  });

  it('REJECTS an unrelated trainer downloading it', async () => {
    const { error } = await cOther.storage.from('submissions')
      .download(`${courseId}/${trainee.id}/work.txt`);
    expect(error).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:db -- storage`
Expected: FAIL — bucket not found

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260823000200_storage.sql`:

```sql
-- Both buckets are PRIVATE. Access is granted per object by the policies
-- below, keyed off the path prefix, which is the standard Supabase pattern.
insert into storage.buckets (id, name, public)
values ('course-materials', 'course-materials', false),
       ('submissions',      'submissions',      false)
on conflict (id) do nothing;

-- course-materials: {course_id}/…
-- The first path segment is the course id, so authorisation is a lookup on it.
create policy course_materials_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'course-materials'
    and (
      app.is_admin()
      or app.is_trainer_of(((storage.foldername(name))[1])::uuid)
      or app.is_enrolled(((storage.foldername(name))[1])::uuid)
    )
  );

create policy course_materials_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'course-materials'
    and (app.is_admin() or app.is_trainer_of(((storage.foldername(name))[1])::uuid))
  );

create policy course_materials_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'course-materials'
    and (app.is_admin() or app.is_trainer_of(((storage.foldername(name))[1])::uuid))
  );

create policy course_materials_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'course-materials'
    and (app.is_admin() or app.is_trainer_of(((storage.foldername(name))[1])::uuid))
  );

-- submissions: {course_id}/{trainee_id}/…
-- A trainee may only write beneath their own id, so one trainee cannot
-- overwrite or forge another's work.
create policy submissions_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'submissions'
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and app.is_enrolled(((storage.foldername(name))[1])::uuid)
  );

create policy submissions_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'submissions'
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );

create policy submissions_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'submissions'
    and (
      (storage.foldername(name))[2] = (select auth.uid())::text
      or app.is_admin()
      or app.is_trainer_of(((storage.foldername(name))[1])::uuid)
    )
  );
```

- [ ] **Step 4: Apply and run tests**

Run:
```bash
npx supabase db push --db-url "$(grep '^SUPABASE_DB_URL=' .env.test | cut -d= -f2-)"
npm run test:db -- storage
```
Expected: PASS (11 tests)

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260823000200_storage.sql supabase/tests/storage.test.js
git commit -m "feat(db): add private storage buckets with path-prefix policies"
```

---

## Task 4: Activity api with content flattening

**Files:**
- Create: `src/api/activities.js`
- Create: `src/api/activities.test.js`
- Modify: `src/components/activities/ReadingActivity.jsx:9`

**Interfaces:**
- Consumes: `supabase` from `src/api/client.js`
- Produces: `activityToCamel(row)`, `getActivity(id)`, `listActivitiesForModule(moduleId)`, `completeActivity(activityId, payload)` returning `{ ok, completion, progress: { percent, completed, total } }`

- [ ] **Step 1: Write the failing test**

Create `src/api/activities.test.js`:

```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const from = vi.fn();
const invoke = vi.fn();
vi.mock('./client', () => ({ supabase: { from, functions: { invoke } }, isConfigured: true }));

const { activityToCamel, getActivity, completeActivity } = await import('./activities');

beforeEach(() => vi.clearAllMocks());

function chain(result) {
  const obj = {
    select: () => obj, eq: () => obj, order: () => Promise.resolve(result),
    single: () => Promise.resolve(result), maybeSingle: () => Promise.resolve(result),
    then: (res, rej) => Promise.resolve(result).then(res, rej),
  };
  return obj;
}

describe('activityToCamel', () => {
  it('flattens content onto the row so components keep flat props', () => {
    expect(activityToCamel({
      id: 'a1', module_id: 'm1', type: 'flashcards', title: 'Keywords',
      position: 1, xp: 12, content: { cards: [{ front: 'a', back: 'b' }] },
    })).toEqual({
      id: 'a1', moduleId: 'm1', type: 'flashcards', title: 'Keywords',
      position: 1, xp: 12, cards: [{ front: 'a', back: 'b' }],
    });
  });

  it('flattens a video payload', () => {
    const out = activityToCamel({
      id: 'a2', module_id: 'm1', type: 'video', title: 'Intro', position: 1, xp: 10,
      content: { videoId: 'abc', duration: '12:30', description: 'd' },
    });
    expect(out.videoId).toBe('abc');
    expect(out.duration).toBe('12:30');
  });

  it('flattens a reading body, which the component reads as activity.body', () => {
    const out = activityToCamel({
      id: 'a3', module_id: 'm1', type: 'reading', title: 'Guide', position: 1, xp: 8,
      content: { body: '## Heading', estimatedMinutes: 5 },
    });
    expect(out.body).toBe('## Heading');
    expect(out.estimatedMinutes).toBe(5);
  });

  it('does not leave a nested content key behind', () => {
    const out = activityToCamel({
      id: 'a4', module_id: 'm1', type: 'matching', title: 'M', position: 1, xp: 5,
      content: { pairs: [] },
    });
    expect(out.content).toBeUndefined();
  });

  it('handles an empty content payload', () => {
    const out = activityToCamel({
      id: 'a5', module_id: 'm1', type: 'quiz', title: 'Q', position: 1, xp: 0, content: {},
    });
    expect(out.type).toBe('quiz');
  });

  it('returns null for a missing row', () => {
    expect(activityToCamel(null)).toBeNull();
  });
});

describe('getActivity', () => {
  it('returns a flattened activity', async () => {
    from.mockReturnValue(chain({
      data: { id: 'a1', module_id: 'm1', type: 'scenario', title: 'S', position: 1, xp: 20,
              content: { steps: [{ id: 'step1' }] } },
      error: null,
    }));
    const out = await getActivity('a1');
    expect(out.steps).toHaveLength(1);
  });

  it('throws the server message on failure', async () => {
    from.mockReturnValue(chain({ data: null, error: { message: 'denied' } }));
    await expect(getActivity('a1')).rejects.toThrow(/denied/);
  });
});

describe('completeActivity', () => {
  it('invokes the edge function with the activity and payload', async () => {
    invoke.mockResolvedValue({ data: { ok: true, progress: { percent: 50 } }, error: null });
    await completeActivity('a1', { score: 3 });
    expect(invoke).toHaveBeenCalledWith('complete-activity', {
      body: { activityId: 'a1', payload: { score: 3 } },
    });
  });

  it('defaults the payload to an empty object', async () => {
    invoke.mockResolvedValue({ data: { ok: true }, error: null });
    await completeActivity('a1');
    expect(invoke.mock.calls[0][1].body.payload).toEqual({});
  });

  it('surfaces a locked-module refusal', async () => {
    invoke.mockResolvedValue({ data: { error: 'Finish the previous module first' }, error: null });
    await expect(completeActivity('a1')).rejects.toThrow(/previous module/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/api/activities.test.js`
Expected: FAIL — cannot resolve `./activities`

- [ ] **Step 3: Write the api module**

Create `src/api/activities.js`:

```javascript
import { supabase } from './client';

/**
 * Maps an activity row and FLATTENS its content payload onto the object.
 *
 * The database keeps six activity shapes in one jsonb column, but the
 * components were written against flat props (activity.cards, activity.pairs,
 * activity.steps, activity.videoId). Spreading here keeps that contract, so
 * the components need no knowledge of how the payload is stored.
 */
export function activityToCamel(row) {
  if (!row) return null;
  const { id, module_id: moduleId, type, title, position, xp, content } = row;
  return { id, moduleId, type, title, position, xp, ...(content ?? {}) };
}

function unwrap({ data, error }) {
  if (error) throw new Error(error.message);
  return data;
}

export async function getActivity(id) {
  return activityToCamel(unwrap(
    await supabase.from('activities').select('*').eq('id', id).maybeSingle()
  ));
}

export async function listActivitiesForModule(moduleId) {
  const rows = unwrap(
    await supabase.from('activities').select('*').eq('module_id', moduleId).order('position')
  );
  return (rows ?? []).map(activityToCamel);
}

/**
 * Records a completion. The Edge Function checks enrolment and module
 * prerequisites server-side; there is no client INSERT grant on
 * activity_completions, so this is the only route.
 */
export async function completeActivity(activityId, payload = {}) {
  const { data, error } = await supabase.functions.invoke('complete-activity', {
    body: { activityId, payload },
  });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return data;
}
```

- [ ] **Step 4: Update `ReadingActivity` to read the flattened body**

In `src/components/activities/ReadingActivity.jsx`, change line 9 and its guard.
Replace:

```jsx
export default function ReadingActivity({ activity }) {
  if (!activity?.content) return <div>No content provided.</div>;

  // Simple markdown-to-html conversion for the demo. This deliberately does
  // not escape the source first, so the output is sanitized below before it
  // reaches the DOM.
  const htmlContent = activity.content
```

with:

```jsx
export default function ReadingActivity({ activity }) {
  // The api layer flattens the stored content payload, so the markdown body
  // arrives as activity.body rather than activity.content.
  const source = activity?.body ?? activity?.content;
  if (!source) return <div>No content provided.</div>;

  // Simple markdown-to-html conversion for the demo. This deliberately does
  // not escape the source first, so the output is sanitized below before it
  // reaches the DOM.
  const htmlContent = source
```

The `?? activity?.content` fallback keeps the existing dummy-data tests passing
while the rest of the app migrates.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/api/activities.test.js`
Expected: PASS (11 tests)

Run: `npm test`
Expected: PASS — all existing tests still green

- [ ] **Step 6: Commit**

```bash
git add src/api/activities.js src/api/activities.test.js src/components/activities/ReadingActivity.jsx
git commit -m "feat(api): add activity api that flattens the content payload"
```

---

## Task 5: Activity hooks

**Files:**
- Create: `src/hooks/useActivities.js`
- Create: `src/hooks/useActivities.test.jsx`

**Interfaces:**
- Consumes: `getActivity`, `completeActivity` from `src/api/activities.js`; `courseKeys` from `src/hooks/useCourses.js`
- Produces: `useActivity(id)`, `useCompleteActivity()` returning `{ mutate, mutateAsync, isPending, error }`

- [ ] **Step 1: Write the failing test**

Create `src/hooks/useActivities.test.jsx`:

```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mocks = vi.hoisted(() => ({
  getActivity: vi.fn(),
  completeActivity: vi.fn(),
}));
vi.mock('../api/activities', () => ({
  getActivity: mocks.getActivity, completeActivity: mocks.completeActivity,
}));

const { useActivity, useCompleteActivity } = await import('./useActivities');

function wrapper({ children }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => vi.clearAllMocks());

describe('useActivity', () => {
  it('does not fetch without an id', () => {
    renderHook(() => useActivity(undefined), { wrapper });
    expect(mocks.getActivity).not.toHaveBeenCalled();
  });

  it('returns the activity once loaded', async () => {
    mocks.getActivity.mockResolvedValue({ id: 'a1', type: 'reading', body: 'x' });
    const { result } = renderHook(() => useActivity('a1'), { wrapper });
    await waitFor(() => expect(result.current.data).toBeTruthy());
    expect(result.current.data.type).toBe('reading');
  });

  it('surfaces an error', async () => {
    mocks.getActivity.mockRejectedValue(new Error('denied'));
    const { result } = renderHook(() => useActivity('a1'), { wrapper });
    await waitFor(() => expect(result.current.error?.message).toMatch(/denied/));
  });
});

describe('useCompleteActivity', () => {
  it('passes the activity id and payload', async () => {
    mocks.completeActivity.mockResolvedValue({ ok: true, progress: { percent: 25 } });
    const { result } = renderHook(() => useCompleteActivity(), { wrapper });
    result.current.mutate({ activityId: 'a1', payload: { score: 2 } });
    await waitFor(() => expect(mocks.completeActivity).toHaveBeenCalledWith('a1', { score: 2 }));
  });

  it('surfaces a locked-module refusal', async () => {
    mocks.completeActivity.mockRejectedValue(new Error('Finish the previous module first'));
    const { result } = renderHook(() => useCompleteActivity(), { wrapper });
    result.current.mutate({ activityId: 'a1' });
    await waitFor(() => expect(result.current.error?.message).toMatch(/previous module/));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/hooks/useActivities.test.jsx`
Expected: FAIL — cannot resolve `./useActivities`

- [ ] **Step 3: Write the hooks**

Create `src/hooks/useActivities.js`:

```javascript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getActivity, completeActivity } from '../api/activities';
import { courseKeys } from './useCourses';

export const activityKeys = { one: (id) => ['activities', id] };

export function useActivity(id) {
  return useQuery({
    queryKey: activityKeys.one(id),
    queryFn: () => getActivity(id),
    enabled: Boolean(id),
  });
}

export function useCompleteActivity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ activityId, payload }) => completeActivity(activityId, payload),
    // Completion changes progress and can unlock the next module, so the
    // enrollment list and every course outline go stale.
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: courseKeys.myEnrollments });
      queryClient.invalidateQueries({ queryKey: ['courses', 'outline'] });
    },
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/hooks/useActivities.test.jsx`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useActivities.js src/hooks/useActivities.test.jsx
git commit -m "feat(web): add activity query and completion hooks"
```

---

## Task 6: ActivityPage against real data

**Files:**
- Modify: `src/pages/trainee/ActivityPage.jsx`
- Create: `src/pages/trainee/ActivityPage.test.jsx`

**Interfaces:**
- Consumes: `useActivity`, `useCompleteActivity` from Task 5
- Produces: a page that renders any of the six activity types from server data and records completion through the Edge Function

- [ ] **Step 1: Write the failing test**

Create `src/pages/trainee/ActivityPage.test.jsx`:

```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mocks = vi.hoisted(() => ({
  getActivity: vi.fn(), completeActivity: vi.fn(),
  useSession: vi.fn(() => ({ profile: { id: 's1', role: 'trainee' }, status: 'active' })),
}));
vi.mock('../../api/activities', () => ({
  getActivity: mocks.getActivity, completeActivity: mocks.completeActivity,
}));
// Task 7 adds useSession to this page to supply traineeId for uploads. It
// reads the Supabase session, which is absent under test, so it is stubbed.
vi.mock('../../hooks/useSession', () => ({ useSession: mocks.useSession }));

const { default: ActivityPage } = await import('./ActivityPage');

function renderAt(activityId = 'a1') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/activity/${activityId}`]}>
        <Routes>
          <Route path="/activity/:activityId" element={<ActivityPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => vi.clearAllMocks());

describe('ActivityPage', () => {
  it('shows a loading state first', () => {
    mocks.getActivity.mockReturnValue(new Promise(() => {}));
    renderAt();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('renders a reading activity', async () => {
    mocks.getActivity.mockResolvedValue({
      id: 'a1', type: 'reading', title: 'Safety Guide', xp: 8, body: '## Rules',
    });
    renderAt();
    expect(await screen.findByText(/Safety Guide/)).toBeInTheDocument();
  });

  it('renders a flashcards activity', async () => {
    mocks.getActivity.mockResolvedValue({
      id: 'a1', type: 'flashcards', title: 'Keywords', xp: 12,
      cards: [{ front: 'Q', back: 'A' }],
    });
    renderAt();
    expect(await screen.findByText(/Keywords/)).toBeInTheDocument();
  });

  it('shows not-found for a missing activity', async () => {
    mocks.getActivity.mockResolvedValue(null);
    renderAt();
    expect(await screen.findByText(/Activity not found/i)).toBeInTheDocument();
  });

  it('surfaces a locked-module refusal as an alert', async () => {
    mocks.getActivity.mockResolvedValue({
      id: 'a1', type: 'reading', title: 'Locked One', xp: 5, body: 'x',
    });
    mocks.completeActivity.mockRejectedValue(new Error('Finish the previous module first'));
    const user = userEvent.setup();
    renderAt();
    await screen.findByText(/Locked One/);
    await user.click(screen.getByRole('button', { name: /mark as complete/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/previous module/);
  });

  it('calls the api when completing', async () => {
    mocks.getActivity.mockResolvedValue({
      id: 'a1', type: 'reading', title: 'Done One', xp: 5, body: 'x',
    });
    mocks.completeActivity.mockResolvedValue({ ok: true, progress: { percent: 100 } });
    const user = userEvent.setup();
    renderAt();
    await screen.findByText(/Done One/);
    await user.click(screen.getByRole('button', { name: /mark as complete/i }));
    await waitFor(() => expect(mocks.completeActivity).toHaveBeenCalledWith('a1', {}));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/pages/trainee/ActivityPage.test.jsx`
Expected: FAIL — the page still reads `activities` from `useApp()`

- [ ] **Step 3: Rewrite `ActivityPage.jsx`**

Replace the whole file:

```jsx
import { useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useActivity, useCompleteActivity } from '../../hooks/useActivities';
import ActivityWrapper from '../../components/activities/ActivityWrapper';
import VideoActivity from '../../components/activities/VideoActivity';
import ReadingActivity from '../../components/activities/ReadingActivity';
import FlashcardActivity from '../../components/activities/FlashcardActivity';
import MatchingActivity from '../../components/activities/MatchingActivity';
import ScenarioActivity from '../../components/activities/ScenarioActivity';
import FileSubmissionActivity from '../../components/activities/FileSubmissionActivity';

const RENDERERS = {
  video: VideoActivity,
  reading: ReadingActivity,
  flashcards: FlashcardActivity,
  matching: MatchingActivity,
  scenario: ScenarioActivity,
  submission: FileSubmissionActivity,
};

export default function ActivityPage() {
  const { activityId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const courseId = location.state?.courseId;

  const { data: activity, isLoading } = useActivity(activityId);
  const complete = useCompleteActivity();
  const [done, setDone] = useState(false);

  if (isLoading) {
    return <div className="page-body" role="status">Loading activity…</div>;
  }

  if (!activity) {
    return (
      <div className="page-body">
        <h2>Activity not found</h2>
        <button className="btn btn-ghost" onClick={() => navigate(-1)}>Go Back</button>
      </div>
    );
  }

  const Renderer = RENDERERS[activity.type];

  async function handleComplete(payload = {}) {
    try {
      await complete.mutateAsync({ activityId, payload });
      setDone(true);
      if (courseId) navigate(`/trainee/courses/${courseId}`);
      else navigate(-1);
    } catch {
      // The mutation exposes the error; the alert below renders it.
    }
  }

  return (
    <div className="page-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }}
              onClick={() => navigate(-1)}>← Back</button>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="section-heading">{activity.title}</h1>
        <p className="section-sub">{activity.xp} XP</p>
      </motion.div>

      {complete.error && (
        <div role="alert" className="card no-hover"
             style={{ color: 'var(--brand-accent)', padding: '1rem' }}>
          {complete.error.message}
        </div>
      )}

      {/* ActivityWrapper already renders the "Mark as Complete" button and
          wires it to onComplete, so this page must not add a second one. */}
      {Renderer ? (
        <ActivityWrapper
          activity={activity}
          onComplete={() => handleComplete({})}
          onBack={() => navigate(-1)}
          isCompleted={done || complete.isPending}
        >
          <Renderer activity={activity} onComplete={handleComplete} />
        </ActivityWrapper>
      ) : (
        <div className="card no-hover" style={{ padding: '2rem' }}>
          <p style={{ color: 'var(--text-2)' }}>
            This activity type ({activity.type}) is not available yet.
          </p>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/pages/trainee/ActivityPage.test.jsx`
Expected: PASS (6 tests)

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Lint and build**

Run: `npm run lint && npm run build`
Expected: 0 errors, build succeeds

- [ ] **Step 6: Commit**

```bash
git add src/pages/trainee/ActivityPage.jsx src/pages/trainee/ActivityPage.test.jsx
git commit -m "feat(web): render activities from the database"
```

---

## Task 7: Storage api and real submission upload

**Files:**
- Create: `src/api/storage.js`
- Create: `src/api/storage.test.js`
- Modify: `src/components/activities/FileSubmissionActivity.jsx`

**Interfaces:**
- Consumes: `supabase` from `src/api/client.js`
- Produces: `uploadSubmission({ courseId, traineeId, file })` returning `{ path }`, `uploadCourseMaterial({ courseId, file })` returning `{ path }`, `signedUrlFor(bucket, path, expiresIn)` returning a string URL

- [ ] **Step 1: Write the failing test**

Create `src/api/storage.test.js`:

```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const upload = vi.fn();
const createSignedUrl = vi.fn();
const storageFrom = vi.fn(() => ({ upload, createSignedUrl }));
vi.mock('./client', () => ({
  supabase: { storage: { from: storageFrom } }, isConfigured: true,
}));

const { uploadSubmission, uploadCourseMaterial, signedUrlFor } = await import('./storage');

beforeEach(() => vi.clearAllMocks());

const file = (name = 'work.pdf') => new File(['x'], name, { type: 'application/pdf' });

describe('uploadSubmission', () => {
  it('writes under {courseId}/{traineeId}/', async () => {
    upload.mockResolvedValue({ data: { path: 'p' }, error: null });
    const { path } = await uploadSubmission({ courseId: 'c1', traineeId: 's1', file: file() });
    expect(storageFrom).toHaveBeenCalledWith('submissions');
    expect(path).toMatch(/^c1\/s1\//);
    expect(path).toMatch(/work\.pdf$/);
  });

  it('throws the server message on failure', async () => {
    upload.mockResolvedValue({ data: null, error: { message: 'new row violates row-level security policy' } });
    await expect(uploadSubmission({ courseId: 'c1', traineeId: 's1', file: file() }))
      .rejects.toThrow(/row-level security/);
  });

  it('sanitises a hostile filename so it cannot escape the prefix', async () => {
    upload.mockResolvedValue({ data: { path: 'p' }, error: null });
    const { path } = await uploadSubmission({
      courseId: 'c1', traineeId: 's1', file: file('../../etc/passwd'),
    });
    expect(path).not.toMatch(/\.\./);
    expect(path.startsWith('c1/s1/')).toBe(true);
  });
});

describe('uploadCourseMaterial', () => {
  it('writes under {courseId}/', async () => {
    upload.mockResolvedValue({ data: { path: 'p' }, error: null });
    const { path } = await uploadCourseMaterial({ courseId: 'c1', file: file('manual.pdf') });
    expect(storageFrom).toHaveBeenCalledWith('course-materials');
    expect(path.startsWith('c1/')).toBe(true);
  });
});

describe('signedUrlFor', () => {
  it('returns the signed url', async () => {
    createSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://x/y' }, error: null });
    expect(await signedUrlFor('submissions', 'c1/s1/work.pdf')).toBe('https://x/y');
  });

  it('throws when signing fails', async () => {
    createSignedUrl.mockResolvedValue({ data: null, error: { message: 'not found' } });
    await expect(signedUrlFor('submissions', 'missing')).rejects.toThrow(/not found/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/api/storage.test.js`
Expected: FAIL — cannot resolve `./storage`

- [ ] **Step 3: Write the storage module**

Create `src/api/storage.js`:

```javascript
import { supabase } from './client';

/**
 * Strips anything that could change the meaning of the path. Storage policies
 * authorise on the first two path segments, so a filename containing "../"
 * must never be able to move the object out of its prefix.
 */
function safeName(name) {
  return String(name)
    .replace(/[/\\]/g, '_')
    .replace(/\.{2,}/g, '_')
    .replace(/[^A-Za-z0-9._-]/g, '_')
    .slice(-120) || 'file';
}

const stamped = (name) => `${Date.now()}-${safeName(name)}`;

export async function uploadSubmission({ courseId, traineeId, file }) {
  const path = `${courseId}/${traineeId}/${stamped(file.name)}`;
  const { error } = await supabase.storage.from('submissions')
    .upload(path, file, { upsert: false });
  if (error) throw new Error(error.message);
  return { path };
}

export async function uploadCourseMaterial({ courseId, file }) {
  const path = `${courseId}/${stamped(file.name)}`;
  const { error } = await supabase.storage.from('course-materials')
    .upload(path, file, { upsert: false });
  if (error) throw new Error(error.message);
  return { path };
}

/** Both buckets are private, so every read needs a short-lived signed URL. */
export async function signedUrlFor(bucket, path, expiresIn = 300) {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/api/storage.test.js`
Expected: PASS (6 tests)

- [ ] **Step 5: Make `FileSubmissionActivity` upload for real**

In `src/components/activities/FileSubmissionActivity.jsx`, replace the simulated
upload. Change the imports and the submit handler:

```jsx
import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { safeHtml } from '../../lib/sanitizeHtml';
import { uploadSubmission } from '../../api/storage';
```

and replace the whole `simulateUpload` function (lines 27-47, the
`setInterval` that fakes a progress bar and then calls `onComplete` after a
1500 ms timeout) with a real upload:

```jsx
  const simulateUpload = async () => {
    if (!file || isUploading) return;
    setIsUploading(true);
    setUploadError(null);
    setProgress(50);
    try {
      const { path } = await uploadSubmission({
        courseId: activity.courseId,
        traineeId: activity.traineeId,
        file,
      });
      setProgress(100);
      setIsSubmitted(true);
      onComplete?.({ storagePath: path, filename: file.name });
    } catch (err) {
      setUploadError(err.message);
      setProgress(0);
    } finally {
      setIsUploading(false);
    }
  };
```

Keeping the name `simulateUpload` would now be a lie, so rename it to
`handleUpload` and update its single call site in the JSX. Add
`const [uploadError, setUploadError] = useState(null);` beside the other
state, and render it above the upload control:

```jsx
      {uploadError && (
        <div role="alert" style={{ color: 'var(--brand-accent)', fontSize: '0.85rem' }}>
          {uploadError}
        </div>
      )}
```

- [ ] **Step 6: Pass the ids the upload needs**

`FileSubmissionActivity` needs `courseId` and `traineeId`. In
`src/pages/trainee/ActivityPage.jsx`, extend the renderer props:

```jsx
      {Renderer ? (
        <ActivityWrapper activity={activity} onComplete={handleComplete}>
          <Renderer
            activity={{ ...activity, courseId, traineeId: profile?.id }}
            onComplete={handleComplete}
          />
        </ActivityWrapper>
      ) : (
```

and add at the top of the component:

```jsx
import { useSession } from '../../hooks/useSession';
```

with `const { profile } = useSession();` beside the other hooks.

- [ ] **Step 7: Run the full frontend suite**

Run: `npm test`
Expected: PASS

- [ ] **Step 8: Lint and build**

Run: `npm run lint && npm run build`
Expected: 0 errors, build succeeds

- [ ] **Step 9: Commit**

```bash
git add src/api/storage.js src/api/storage.test.js \
        src/components/activities/FileSubmissionActivity.jsx \
        src/pages/trainee/ActivityPage.jsx
git commit -m "feat(web): upload submissions to Storage instead of simulating"
```

---

## Task 8: Course page outline with lock state

**Files:**
- Modify: `src/pages/trainee/CoursePage.jsx`
- Create: `src/pages/trainee/CoursePage.outline.test.jsx`
- Modify: `src/pages/trainee/CoursePage.test.jsx` (retire the dummy-data version)

**Interfaces:**
- Consumes: `useCourseOutline` from `src/hooks/useCourses.js`; `useMyEnrollments` from the same module
- Produces: a course page listing real modules and activities, each linking to `/trainee/activity/:id`

- [ ] **Step 1: Write the failing test**

Create `src/pages/trainee/CoursePage.outline.test.jsx`:

```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mocks = vi.hoisted(() => ({
  getCourseOutline: vi.fn(),
  listCourses: vi.fn(async () => []),
  myEnrollments: vi.fn(async () => []),
  applyForCourse: vi.fn(),
}));
vi.mock('../../api/courses', () => ({
  getCourseOutline: mocks.getCourseOutline, listCourses: mocks.listCourses,
}));
vi.mock('../../api/enrollments', () => ({
  myEnrollments: mocks.myEnrollments, applyForCourse: mocks.applyForCourse,
}));

const { default: CoursePage } = await import('./CoursePage');

function renderAt(courseId = 'c1') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/trainee/courses/${courseId}`]}>
        <Routes>
          <Route path="/trainee/courses/:courseId" element={<CoursePage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const outline = {
  id: 'c1', title: 'Health and Safety', subtitle: 'Basics', description: 'd',
  color: '#002F6C', icon: '🏥', status: 'published',
  modules: [
    { id: 'm1', title: 'Fundamentals', position: 1, activities: [
      { id: 'a1', type: 'reading', title: 'Hazards', position: 1, xp: 8 },
      { id: 'a2', type: 'video', title: 'Walkthrough', position: 2, xp: 10 },
    ] },
    { id: 'm2', title: 'Assessment', position: 2, activities: [] },
  ],
};

beforeEach(() => vi.clearAllMocks());

describe('CoursePage outline', () => {
  it('shows a loading state first', () => {
    mocks.getCourseOutline.mockReturnValue(new Promise(() => {}));
    mocks.myEnrollments.mockResolvedValue([]);
    renderAt();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('renders modules and activities from the server', async () => {
    mocks.getCourseOutline.mockResolvedValue(outline);
    mocks.myEnrollments.mockResolvedValue([
      { id: 'e1', courseId: 'c1', status: 'active', percent: 50 },
    ]);
    renderAt();
    expect(await screen.findByText('Fundamentals')).toBeInTheDocument();
    expect(screen.getByText('Hazards')).toBeInTheDocument();
    expect(screen.getByText('Walkthrough')).toBeInTheDocument();
  });

  it('shows the derived progress percentage', async () => {
    mocks.getCourseOutline.mockResolvedValue(outline);
    mocks.myEnrollments.mockResolvedValue([
      { id: 'e1', courseId: 'c1', status: 'active', percent: 50 },
    ]);
    renderAt();
    expect(await screen.findByText('50%')).toBeInTheDocument();
  });

  it('shows the locked panel when not enrolled', async () => {
    mocks.getCourseOutline.mockResolvedValue(outline);
    mocks.myEnrollments.mockResolvedValue([]);
    renderAt();
    expect(await screen.findByText(/Course Locked|Enrollment Pending/i)).toBeInTheDocument();
  });

  it('shows the pending panel for a pending application', async () => {
    mocks.getCourseOutline.mockResolvedValue(outline);
    mocks.myEnrollments.mockResolvedValue([
      { id: 'e1', courseId: 'c1', status: 'pending', percent: 0 },
    ]);
    renderAt();
    expect(await screen.findByText(/Enrollment Pending/i)).toBeInTheDocument();
  });

  it('shows not-found for a missing course', async () => {
    mocks.getCourseOutline.mockResolvedValue(null);
    mocks.myEnrollments.mockResolvedValue([]);
    renderAt();
    expect(await screen.findByText(/Course not found/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/pages/trainee/CoursePage.outline.test.jsx`
Expected: FAIL — the page still reads from `useApp()`

- [ ] **Step 3: Rewrite `CoursePage.jsx`**

Replace the whole file:

```jsx
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useCourseOutline, useMyEnrollments } from '../../hooks/useCourses';

const TYPE_ICONS = {
  video: '🎬', reading: '📖', flashcards: '🃏',
  matching: '🔗', scenario: '🧭', submission: '📤', quiz: '📝',
};

export default function CoursePage() {
  const { courseId } = useParams();
  const navigate = useNavigate();
  const { data: course, isLoading } = useCourseOutline(courseId);
  const { data: enrollments, isLoading: loadingEnrollments } = useMyEnrollments();

  if (isLoading || loadingEnrollments) {
    return <div className="page-body" role="status">Loading course…</div>;
  }

  if (!course) {
    return <div className="page-body"><p>Course not found.</p></div>;
  }

  const enrollment = (enrollments ?? []).find((e) => e.courseId === courseId);
  const isEnrolled = enrollment?.status === 'active' || enrollment?.status === 'completed';
  const isPending = enrollment?.status === 'pending';

  if (!isEnrolled) {
    return (
      <div className="page-body">
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/trainee/courses')}>
            ← Back to Courses
          </button>
        </div>
        <div className="card no-hover" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔒</div>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '0.5rem', fontFamily: 'var(--font-heading)' }}>
            {isPending ? 'Enrollment Pending' : 'Course Locked'}
          </h2>
          <p style={{ color: 'var(--text-2)', maxWidth: '40ch', margin: '0 auto 1.5rem' }}>
            {isPending
              ? 'Your request to join this course has been sent to the trainer. You will gain access once they approve it.'
              : 'You are not enrolled in this course. Please visit the Course Catalog to apply.'}
          </p>
          {!isPending && (
            <button className="btn btn-primary" onClick={() => navigate('/trainee/catalog')}>
              Go to Course Catalog
            </button>
          )}
        </div>
      </div>
    );
  }

  const accent = course.color || '#002F6C';

  return (
    <div className="page-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', paddingBottom: '4rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/trainee/courses')}>
          ← Back to Courses
        </button>
      </div>

      <motion.div
        initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
        style={{
          borderRadius: 'var(--r-xl)', padding: '2rem', color: '#fff',
          background: `linear-gradient(145deg, rgba(0,0,0,0.82), rgba(15,15,25,0.88)), linear-gradient(135deg, ${accent}88, ${accent}44)`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1.5rem', flexWrap: 'wrap' }}>
          <div style={{ fontSize: '3rem' }}>{course.icon || '📘'}</div>
          <div style={{ flex: 1, minWidth: 300 }}>
            <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Course Hub
            </p>
            <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: 'clamp(1.5rem, 4vw, 2rem)', color: '#fff' }}>
              {course.title}
            </h1>
            <p style={{ fontSize: '0.88rem', color: 'rgba(255,255,255,0.75)', maxWidth: '60ch' }}>
              {course.description}
            </p>
          </div>
          <div style={{ textAlign: 'right', minWidth: 150 }}>
            <div style={{ fontFamily: 'var(--font-heading)', fontSize: '3rem', fontWeight: 700, color: '#fff', lineHeight: 1 }}>
              {enrollment.percent}%
            </div>
            <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.6)' }}>Your Progress</div>
          </div>
        </div>
      </motion.div>

      {course.modules.length === 0 ? (
        <div className="card no-hover" style={{ textAlign: 'center', padding: '3rem' }}>
          <p style={{ color: 'var(--text-2)' }}>This course has no content yet.</p>
        </div>
      ) : (
        course.modules.map((mod) => (
          <div key={mod.id} className="card no-hover">
            <div className="card-title">{mod.position}. {mod.title}</div>
            {mod.activities.length === 0 ? (
              <p style={{ color: 'var(--text-3)', fontSize: '0.85rem' }}>No activities yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.75rem' }}>
                {mod.activities.map((a) => (
                  <Link
                    key={a.id}
                    to={`/trainee/activity/${a.id}`}
                    state={{ courseId }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '0.75rem', textDecoration: 'none',
                      padding: '0.75rem', borderRadius: 'var(--r-md)',
                      background: 'var(--surface-alt)', color: 'var(--text)',
                    }}
                  >
                    <span style={{ fontSize: '1.25rem' }}>{TYPE_ICONS[a.type] ?? '📘'}</span>
                    <span style={{ flex: 1 }}>{a.title}</span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-3)' }}>{a.xp} XP</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}
```

- [ ] **Step 4: Retire the dummy-data CoursePage test**

The old `src/pages/trainee/CoursePage.test.jsx` asserts hook-order behaviour
against `AppProvider` and dummy data, which this page no longer uses. Its
regression value — that navigating across the enrolled/unenrolled guard does
not change the hook count — is preserved because the rewritten page calls both
hooks unconditionally before any early return. Delete it:

```bash
git rm src/pages/trainee/CoursePage.test.jsx
```

and add this guard-transition test to `CoursePage.outline.test.jsx` so the
coverage is not lost:

```javascript
describe('guard transitions do not change the hook count', () => {
  it('re-renders cleanly from enrolled to unenrolled', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.getCourseOutline.mockResolvedValue(outline);
    mocks.myEnrollments.mockResolvedValue([
      { id: 'e1', courseId: 'c1', status: 'active', percent: 10 },
    ]);
    const { unmount } = renderAt();
    await screen.findByText('Fundamentals');
    unmount();

    mocks.myEnrollments.mockResolvedValue([]);
    renderAt();
    expect(await screen.findByText(/Course Locked/i)).toBeInTheDocument();

    const hookError = consoleError.mock.calls.flat().some((a) => {
      const msg = a instanceof Error ? a.message : String(a);
      return /Rendered (fewer|more) hooks|order of Hooks/i.test(msg);
    });
    expect(hookError).toBe(false);
    consoleError.mockRestore();
  });
});
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/pages/trainee/CoursePage.outline.test.jsx`
Expected: PASS (7 tests)

Run: `npm test`
Expected: PASS

- [ ] **Step 6: Lint and build**

Run: `npm run lint && npm run build`
Expected: 0 errors, build succeeds

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(web): render the course outline from the database"
```

---

## Task 9: End-to-end verification and plan update

**Files:**
- Create: `scripts/verify-m3.mjs`
- Modify: `docs/superpowers/plans/2026-08-23-m3-learning-and-progress.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: everything above
- Produces: `npm run verify:m3`, a live end-to-end check of the learning loop

- [ ] **Step 1: Write the verification script**

Create `scripts/verify-m3.mjs`:

```javascript
// Live end-to-end check of the M3 learning loop against the configured
// Supabase project. Creates its own users and course, then removes them.
//
// Usage: npm run verify:m3

import { serviceClient, createUser, signIn, uniqueEmail, SUPABASE_URL }
  from '../supabase/tests/helpers.js';

const svc = serviceClient();
const PREFIX = `m3v${Date.now()}`;

async function call(client, body) {
  const { data: { session } } = await client.auth.getSession();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/complete-activity`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

const created = [];

try {
  const trainer = await createUser({ email: uniqueEmail(), role: 'trainer', name: 'Trainer' });
  const trainee = await createUser({ email: uniqueEmail(), role: 'trainee', name: 'Amira' });
  created.push(trainer.id, trainee.id);

  const { data: course } = await svc.from('courses').insert({
    slug: `${PREFIX}-1`, title: 'M3 Verification', status: 'published',
    trainer_id: trainer.id, created_by: trainer.id,
  }).select().single();

  const { data: modA } = await svc.from('modules')
    .insert({ course_id: course.id, title: 'Module A', position: 1 }).select().single();
  const { data: modB } = await svc.from('modules')
    .insert({ course_id: course.id, title: 'Module B', position: 2, unlock_after_module_id: modA.id })
    .select().single();

  const mkAct = async (moduleId, position, type, content) => {
    const { data } = await svc.from('activities')
      .insert({ module_id: moduleId, type, title: `${type} ${position}`, position, content })
      .select().single();
    return data.id;
  };
  const a1 = await mkAct(modA.id, 1, 'reading', { body: '## Rules' });
  const a2 = await mkAct(modA.id, 2, 'flashcards', { cards: [{ front: 'Q', back: 'A' }] });
  const b1 = await mkAct(modB.id, 1, 'video', { videoId: 'abc' });

  await svc.from('enrollments')
    .insert({ trainee_id: trainee.id, course_id: course.id, status: 'active' });

  const c = await signIn(trainee.email);

  console.log('1. module B is locked before A is finished');
  const locked = await call(c, { activityId: b1 });
  console.log(`   -> ${locked.status} ${locked.body?.error ?? ''}`);

  console.log('2. complete both activities in module A');
  console.log(`   -> ${(await call(c, { activityId: a1 })).body.progress.percent}%`);
  console.log(`   -> ${(await call(c, { activityId: a2 })).body.progress.percent}%`);

  console.log('3. module B is now reachable');
  const open = await call(c, { activityId: b1 });
  console.log(`   -> ${open.status}, progress ${open.body?.progress?.percent}%`);

  console.log('4. the enrollment is marked completed');
  const { data: e } = await svc.from('enrollments')
    .select('status').eq('course_id', course.id).eq('trainee_id', trainee.id).single();
  console.log(`   -> ${e.status}`);

  console.log('5. a completion cannot be written or deleted directly');
  const ins = await c.from('activity_completions')
    .insert({ enrollment_id: '00000000-0000-0000-0000-000000000000', activity_id: a1 });
  console.log(`   insert blocked: ${ins.error !== null}`);
} finally {
  await svc.from('courses').delete().like('slug', `${PREFIX}-%`);
  for (const id of created) await svc.auth.admin.deleteUser(id);
  console.log('cleaned up');
}
```

- [ ] **Step 2: Add the script**

Add to `package.json` scripts:

```json
"verify:m3": "node ./scripts/verify-m3.mjs"
```

- [ ] **Step 3: Run it**

Run: `npm run verify:m3`
Expected: step 1 prints `423`, step 2 prints rising percentages, step 3 prints
`200`, step 4 prints `completed`, step 5 prints `insert blocked: true`

- [ ] **Step 4: Run every suite**

Run: `npm test && npm run test:db && npm run lint && npm run build`
Expected: all pass

- [ ] **Step 5: Update the README testing section**

Add to the table in `README.md`:

| `npm run verify:m3` | Live end-to-end check of the learning loop |

- [ ] **Step 6: Add a progress table to this plan**

Add a `## Progress` section after the Spec line, marking Tasks 1-9 done and
recording any corrections learned during execution, following the format used
in the M1 and M2 plans.

- [ ] **Step 7: Commit**

```bash
git add scripts/verify-m3.mjs package.json README.md \
        docs/superpowers/plans/2026-08-23-m3-learning-and-progress.md
git commit -m "chore: add live M3 verification script and record progress"
```

---

## Verification checklist

- [ ] A module with no prerequisite is unlocked; one with an unfinished prerequisite is not — `module-unlocking.test.js`
- [ ] A partly-finished prerequisite does NOT unlock the next module — `module-unlocking.test.js`
- [ ] An empty prerequisite module counts as satisfied rather than a permanent lock — `module-unlocking.test.js`
- [ ] Unlocking is per enrollment, not per course — `module-unlocking.test.js`
- [ ] `complete-activity` refuses an activity in a locked module with 423 — `fn-complete-activity.test.js`
- [ ] Completing twice is idempotent — `fn-complete-activity.test.js`
- [ ] A trainee cannot INSERT or DELETE `activity_completions` directly — `fn-complete-activity.test.js`
- [ ] An unenrolled trainee is refused — `fn-complete-activity.test.js`
- [ ] Finishing every activity marks the enrollment completed — `fn-complete-activity.test.js`
- [ ] Only the owning trainer uploads course materials; only enrolled trainees read them — `storage.test.js`
- [ ] A trainee cannot upload under another trainee's prefix — `storage.test.js`
- [ ] The course trainer can read a submission; an unrelated trainer cannot — `storage.test.js`
- [ ] A hostile filename cannot escape its path prefix — `storage.test.js` (api-side) and `src/api/storage.test.js`
- [ ] All six activity types render from server data — `ActivityPage.test.jsx`
- [ ] The course outline shows real modules, activities and derived progress — `CoursePage.outline.test.jsx`
- [ ] The 106 frontend and 180 database tests from M2 still pass

## Deferred to later milestones

Not in M3, by design: quizzes and `quiz_answer_keys`, including the `quiz`
activity type, which renders an "not available yet" panel until M4; trainer
review of submissions (M4, alongside paragraph-answer grading); realtime chat
(M5); and gamification awarding, so XP still displays without being granted.
