# M1 Identity & Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace NC Spark's role-picker mock login with real Supabase authentication, where roles are assigned only by admins and privilege escalation is structurally impossible.

**Architecture:** Supabase Postgres with Row Level Security on every table as a baseline, plus Edge Functions owning every privileged write. Profiles are created by a database trigger that ignores client-supplied roles. Three independent layers (column grants, RLS `WITH CHECK`, and a trigger) prevent a user changing their own role. The React frontend gains a thin `src/api/` layer with TanStack Query, replacing direct context mutation.

**Tech Stack:** Supabase (Postgres 15, Auth, Edge Functions on Deno), `@supabase/supabase-js` v2, React 19, React Router 7, TanStack Query v5, Vitest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-08-21-nc-spark-backend-design.md`

## Global Constraints

- Every `SECURITY DEFINER` function MUST declare `SET search_path = ''` and use fully qualified table names. Omitting this is a search-path injection hole.
- Every table MUST have `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` in the same migration that creates it.
- `role` and `status` on `profiles` are NEVER writable by the `authenticated` role. Only `service_role`, via an Edge Function.
- All timestamps are `timestamptz not null default now()`.
- Database identifiers are `snake_case`; JavaScript is `camelCase`. Mapping happens in `src/api/`, nowhere else.
- Edge Functions MUST verify the caller by re-reading `profiles` from the database, never by trusting a JWT claim alone.
- Every privileged Edge Function MUST write an `audit_log` row before returning success.
- Migration filenames are `YYYYMMDDHHMMSS_description.sql`, applied in lexical order.
- Never commit `.env.local`, service-role keys, or `supabase/.temp/`.
- The existing 56 tests must pass after every task.

---

## File Structure

**Database (`supabase/migrations/`)** — one migration per concern, applied in order:

| File | Responsibility |
|---|---|
| `..._0100_enums.sql` | `app_role`, `profile_status` enum types |
| `..._0200_profiles.sql` | `profiles`, `trainee_stats` tables |
| `..._0300_provisioning.sql` | `allowed_domains`, `handle_new_user` trigger |
| `..._0400_privilege_guards.sql` | Column grants, escalation trigger |
| `..._0500_helpers.sql` | `app.*` SECURITY DEFINER helpers, `supervisor_trainers` |
| `..._0600_profiles_rls.sql` | `profiles` policies, `public_profiles` view |
| `..._0700_audit_log.sql` | `audit_log` table, append-only enforcement |

**Edge Functions (`supabase/functions/`)** — `_shared/` holds the caller-verification and audit helpers every function needs; one directory per function.

**Tests (`supabase/tests/`)** — Vitest against a local Supabase. Red-team tests use real authenticated clients, so they exercise the same trust boundary the browser does.

**Frontend (`src/`)** — `api/` wraps Supabase and owns snake↔camel mapping; `pages/auth/` holds the four new screens.

---

## Task 1: Supabase project scaffolding and test harness

**Files:**
- Create: `supabase/config.toml` (generated)
- Create: `supabase/tests/helpers.js`
- Create: `vitest.db.config.js`
- Modify: `package.json` (scripts)
- Modify: `.gitignore`

**Interfaces:**
- Consumes: nothing
- Produces: `serviceClient()`, `anonClient()`, `createUser({email, password, role, status})`, `signIn(email, password)`, `resetDb()` from `supabase/tests/helpers.js`

- [ ] **Step 1: Initialise the Supabase project**

```bash
cd nc-spark
npx supabase init
```

Answer `n` to VS Code settings and Deno prompts.

- [ ] **Step 2: Start local Supabase and capture credentials**

```bash
npx supabase start
```

Record `API URL`, `anon key`, and `service_role key` from the output. This takes several minutes on first run while Docker images download.

- [ ] **Step 3: Add local credentials to `.env.test` and ignore secrets**

Create `.env.test` (values from Step 2):

```
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_ANON_KEY=<anon key from supabase start>
SUPABASE_SERVICE_ROLE_KEY=<service_role key from supabase start>
```

Append to `.gitignore`:

```
.env.test
supabase/.temp/
supabase/.branches/
```

- [ ] **Step 4: Write the test harness**

Create `supabase/tests/helpers.js`:

```javascript
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync(new URL('../../.env.test', import.meta.url), 'utf8')
    .split('\n').filter(Boolean).map((l) => l.split('='))
);

export const SUPABASE_URL = env.SUPABASE_URL;

/** Bypasses RLS. Use only for setup and assertions, never to prove access. */
export function serviceClient() {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** An unauthenticated client, exactly what a browser starts with. */
export function anonClient() {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Creates a confirmed auth user, then forces role/status via service role. */
export async function createUser({ email, password = 'Test-Passw0rd!', role = 'trainee', status = 'active', name = 'Test User' }) {
  const svc = serviceClient();
  const { data, error } = await svc.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { name },
  });
  if (error) throw error;

  const { error: upErr } = await svc
    .from('profiles').update({ role, status }).eq('id', data.user.id);
  if (upErr) throw upErr;

  return { id: data.user.id, email, password, role, status };
}

/** Returns a client authenticated as the given user. */
export async function signIn(email, password = 'Test-Passw0rd!') {
  const client = anonClient();
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return client;
}

/** Removes all test users and their cascading rows. */
export async function resetDb() {
  const svc = serviceClient();
  const { data } = await svc.auth.admin.listUsers({ perPage: 1000 });
  for (const u of data?.users ?? []) {
    await svc.auth.admin.deleteUser(u.id);
  }
  await svc.from('allowed_domains').delete().neq('domain', '');
}

/** Unique email per test run to avoid collisions. */
let n = 0;
export const uniqueEmail = (domain = 'example.com') =>
  `user${Date.now()}-${n++}@${domain}`;
```

- [ ] **Step 5: Add a separate Vitest config for database tests**

Create `vitest.db.config.js`:

```javascript
import { defineConfig } from 'vitest/config';

// Database tests hit a real local Supabase, so they run serially with a
// longer timeout and are kept out of the fast frontend suite.
export default defineConfig({
  test: {
    include: ['supabase/tests/**/*.test.js'],
    environment: 'node',
    testTimeout: 30000,
    hookTimeout: 30000,
    fileParallelism: false,
  },
});
```

- [ ] **Step 6: Add scripts**

Modify `package.json` scripts to:

```json
"test": "vitest run",
"test:watch": "vitest",
"test:db": "vitest run --config vitest.db.config.js",
"db:start": "supabase start",
"db:stop": "supabase stop",
"db:reset": "supabase db reset"
```

- [ ] **Step 7: Verify the harness connects**

Create `supabase/tests/smoke.test.js`:

```javascript
import { describe, it, expect } from 'vitest';
import { serviceClient } from './helpers.js';

describe('local supabase', () => {
  it('is reachable', async () => {
    const { error } = await serviceClient().from('_nonexistent_').select('*').limit(1);
    // Table genuinely does not exist; reaching Postgres at all is the point.
    expect(error?.code).toBe('42P01');
  });
});
```

Run: `npm run test:db`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add supabase/ vitest.db.config.js package.json .gitignore
git commit -m "chore: scaffold Supabase project and database test harness"
```

---

## Task 2: Enums and profile tables

**Files:**
- Create: `supabase/migrations/20260821000100_enums.sql`
- Create: `supabase/migrations/20260821000200_profiles.sql`
- Create: `supabase/tests/schema-profiles.test.js`

**Interfaces:**
- Consumes: helpers from Task 1
- Produces: tables `public.profiles(id, role, status, name, email, avatar, created_at, updated_at)`, `public.trainee_stats(profile_id, xp, streak, last_active_on)`; types `app_role`, `profile_status`

- [ ] **Step 1: Write the failing test**

Create `supabase/tests/schema-profiles.test.js`:

```javascript
import { describe, it, expect, beforeAll } from 'vitest';
import { serviceClient } from './helpers.js';

describe('profiles schema', () => {
  let svc;
  beforeAll(() => { svc = serviceClient(); });

  it('has a profiles table', async () => {
    const { error } = await svc.from('profiles').select('id').limit(1);
    expect(error).toBeNull();
  });

  it('has a trainee_stats table', async () => {
    const { error } = await svc.from('trainee_stats').select('profile_id').limit(1);
    expect(error).toBeNull();
  });

  it('rejects an invalid role value', async () => {
    const { data: u } = await svc.auth.admin.createUser({
      email: `enum${Date.now()}@example.com`, password: 'Test-Passw0rd!', email_confirm: true,
    });
    const { error } = await svc.from('profiles').update({ role: 'superuser' }).eq('id', u.user.id);
    expect(error).not.toBeNull();
    expect(error.message).toMatch(/invalid input value for enum/i);
    await svc.auth.admin.deleteUser(u.user.id);
  });

  it('rejects negative XP', async () => {
    const { data: u } = await svc.auth.admin.createUser({
      email: `xp${Date.now()}@example.com`, password: 'Test-Passw0rd!', email_confirm: true,
    });
    const { error } = await svc.from('trainee_stats').update({ xp: -5 }).eq('profile_id', u.user.id);
    expect(error).not.toBeNull();
    await svc.auth.admin.deleteUser(u.user.id);
  });
});
```

Note: this test file depends on the `handle_new_user` trigger from Task 3 to
create the `profiles` and `trainee_stats` rows. Until Task 3 lands, create
those rows explicitly with the service client inside each test.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:db -- schema-profiles`
Expected: FAIL — `relation "public.profiles" does not exist`

- [ ] **Step 3: Write the enum migration**

Create `supabase/migrations/20260821000100_enums.sql`:

```sql
-- Enums over CHECK constraints: invalid values are rejected by the type
-- system and the permitted set is discoverable via introspection.
create type public.app_role as enum ('admin','supervisor','trainer','trainee');
create type public.profile_status as enum ('pending','active','suspended','rejected');
```

- [ ] **Step 4: Write the profiles migration**

Create `supabase/migrations/20260821000200_profiles.sql`:

```sql
create extension if not exists citext;

-- Identity only. Gamification state lives in trainee_stats so the deferred
-- gamification milestone never has to alter this table.
create table public.profiles (
  id          uuid primary key references auth.users on delete cascade,
  role        public.app_role       not null default 'trainee',
  status      public.profile_status not null default 'pending',
  name        text not null default '',
  email       citext not null unique,
  avatar      text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.profiles enable row level security;

create table public.trainee_stats (
  profile_id     uuid primary key references public.profiles(id) on delete cascade,
  xp             integer not null default 0 check (xp >= 0),
  streak         integer not null default 0 check (streak >= 0),
  last_active_on date,
  created_at     timestamptz not null default now()
);

alter table public.trainee_stats enable row level security;

create index profiles_role_idx   on public.profiles(role);
create index profiles_status_idx on public.profiles(status);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();
```

- [ ] **Step 5: Apply migrations and run tests**

Run:
```bash
npx supabase db reset
npm run test:db -- schema-profiles
```
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations supabase/tests/schema-profiles.test.js
git commit -m "feat(db): add app_role/profile_status enums and profile tables"
```

---

## Task 3: Domain-based signup provisioning

**Files:**
- Create: `supabase/migrations/20260821000300_provisioning.sql`
- Create: `supabase/tests/provisioning.test.js`

**Interfaces:**
- Consumes: `profiles`, `trainee_stats`, enums from Task 2
- Produces: table `public.allowed_domains(domain citext pk, created_at)`; trigger `on_auth_user_created` calling `public.handle_new_user()`

- [ ] **Step 1: Write the failing test**

Create `supabase/tests/provisioning.test.js`:

```javascript
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { serviceClient, anonClient, resetDb, uniqueEmail } from './helpers.js';

const svc = serviceClient();

async function signUp(email) {
  const { data, error } = await anonClient().auth.signUp({
    email, password: 'Test-Passw0rd!', options: { data: { name: 'New Person' } },
  });
  if (error) throw error;
  return data.user;
}

async function profileOf(id) {
  const { data } = await svc.from('profiles').select('*').eq('id', id).single();
  return data;
}

beforeEach(async () => {
  await resetDb();
  await svc.from('allowed_domains').insert({ domain: 'speedpro-logis.com' });
});
afterAll(resetDb);

describe('signup provisioning', () => {
  it('creates a profile row for every new auth user', async () => {
    const user = await signUp(uniqueEmail('outside.com'));
    expect(await profileOf(user.id)).toBeTruthy();
  });

  it('activates a user whose domain is allowlisted', async () => {
    const user = await signUp(uniqueEmail('speedpro-logis.com'));
    const p = await profileOf(user.id);
    expect(p.status).toBe('active');
    expect(p.role).toBe('trainee');
  });

  it('queues a user whose domain is not allowlisted', async () => {
    const user = await signUp(uniqueEmail('outside.com'));
    const p = await profileOf(user.id);
    expect(p.status).toBe('pending');
    expect(p.role).toBe('trainee');
  });

  it('IGNORES a client-supplied role, which is the escalation vector', async () => {
    const { data } = await anonClient().auth.signUp({
      email: uniqueEmail('speedpro-logis.com'),
      password: 'Test-Passw0rd!',
      options: { data: { name: 'Sneaky', role: 'admin' } },
    });
    const p = await profileOf(data.user.id);
    expect(p.role).toBe('trainee');
  });

  it('is case-insensitive about the domain', async () => {
    const user = await signUp(uniqueEmail('SPEEDPRO-LOGIS.COM'));
    expect((await profileOf(user.id)).status).toBe('active');
  });

  it('copies the name from signup metadata', async () => {
    const user = await signUp(uniqueEmail('speedpro-logis.com'));
    expect((await profileOf(user.id)).name).toBe('New Person');
  });

  it('creates a trainee_stats row alongside the profile', async () => {
    const user = await signUp(uniqueEmail('speedpro-logis.com'));
    const { data } = await svc.from('trainee_stats').select('*').eq('profile_id', user.id).single();
    expect(data.xp).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:db -- provisioning`
Expected: FAIL — `relation "public.allowed_domains" does not exist`

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260821000300_provisioning.sql`:

```sql
create table public.allowed_domains (
  domain     citext primary key,
  created_at timestamptz not null default now()
);

alter table public.allowed_domains enable row level security;

-- Creates the profile for a newly registered auth user. Deliberately reads
-- ONLY the name from client metadata: role and status are decided here, never
-- by the client. This is what closes the privilege-escalation vector at source.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_domain  citext;
  v_allowed boolean;
  v_status  public.profile_status;
  v_name    text;
begin
  v_domain := split_part(new.email, '@', 2);

  select exists (select 1 from public.allowed_domains d where d.domain = v_domain)
    into v_allowed;

  v_status := case when v_allowed then 'active' else 'pending' end::public.profile_status;
  v_name   := coalesce(nullif(trim(new.raw_user_meta_data ->> 'name'), ''), split_part(new.email, '@', 1));

  insert into public.profiles (id, role, status, name, email)
  values (new.id, 'trainee', v_status, v_name, new.email);

  insert into public.trainee_stats (profile_id) values (new.id);

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

- [ ] **Step 4: Apply and run tests**

Run:
```bash
npx supabase db reset
npm run test:db -- provisioning
```
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260821000300_provisioning.sql supabase/tests/provisioning.test.js
git commit -m "feat(db): provision profiles by email domain, ignoring client role"
```

---

## Task 4: Three-layer privilege escalation guard

**Files:**
- Create: `supabase/migrations/20260821000400_privilege_guards.sql`
- Create: `supabase/tests/privilege-escalation.test.js`

**Interfaces:**
- Consumes: `profiles` from Task 2
- Produces: function `public.prevent_role_change()`; column grants restricting `authenticated` to `UPDATE (name, avatar)`

- [ ] **Step 1: Write the failing red-team test**

Create `supabase/tests/privilege-escalation.test.js`:

```javascript
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { serviceClient, createUser, signIn, resetDb, uniqueEmail } from './helpers.js';

const svc = serviceClient();
let trainee, client;

beforeEach(async () => {
  await resetDb();
  trainee = await createUser({ email: uniqueEmail(), role: 'trainee', status: 'active' });
  client = await signIn(trainee.email);
});
afterAll(resetDb);

async function roleOf(id) {
  const { data } = await svc.from('profiles').select('role,status').eq('id', id).single();
  return data;
}

describe('RED TEAM: a trainee tries to escalate', () => {
  it('cannot promote itself to admin', async () => {
    await client.from('profiles').update({ role: 'admin' }).eq('id', trainee.id);
    expect((await roleOf(trainee.id)).role).toBe('trainee');
  });

  it('cannot change its own status', async () => {
    await client.from('profiles').update({ status: 'suspended' }).eq('id', trainee.id);
    expect((await roleOf(trainee.id)).status).toBe('active');
  });

  it('cannot smuggle a role change alongside a legitimate name change', async () => {
    await client.from('profiles').update({ name: 'Legit', role: 'admin' }).eq('id', trainee.id);
    expect((await roleOf(trainee.id)).role).toBe('trainee');
  });

  it('cannot promote another user', async () => {
    const victim = await createUser({ email: uniqueEmail(), role: 'trainee' });
    await client.from('profiles').update({ role: 'admin' }).eq('id', victim.id);
    expect((await roleOf(victim.id)).role).toBe('trainee');
  });

  it('cannot insert a fresh admin profile row', async () => {
    const { error } = await client.from('profiles')
      .insert({ id: crypto.randomUUID(), role: 'admin', email: uniqueEmail(), name: 'X' });
    expect(error).not.toBeNull();
  });

  it('cannot delete its own profile to escape suspension', async () => {
    await client.from('profiles').delete().eq('id', trainee.id);
    expect(await roleOf(trainee.id)).toBeTruthy();
  });

  it('cannot award itself XP', async () => {
    await client.from('trainee_stats').update({ xp: 999999 }).eq('profile_id', trainee.id);
    const { data } = await svc.from('trainee_stats').select('xp').eq('profile_id', trainee.id).single();
    expect(data.xp).toBe(0);
  });
});

describe('legitimate self-service still works', () => {
  it('can change its own display name', async () => {
    const { error } = await client.from('profiles').update({ name: 'Amira A.' }).eq('id', trainee.id);
    expect(error).toBeNull();
    const { data } = await svc.from('profiles').select('name').eq('id', trainee.id).single();
    expect(data.name).toBe('Amira A.');
  });

  it('can change its own avatar', async () => {
    const { error } = await client.from('profiles').update({ avatar: 'AA' }).eq('id', trainee.id);
    expect(error).toBeNull();
  });
});

describe('service role retains full control', () => {
  it('can promote a user', async () => {
    await svc.from('profiles').update({ role: 'trainer' }).eq('id', trainee.id);
    expect((await roleOf(trainee.id)).role).toBe('trainer');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:db -- privilege-escalation`
Expected: FAIL — the escalation tests fail because no policy exists yet

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260821000400_privilege_guards.sql`:

```sql
-- LAYER 1: column-level grants. A trainee lacks the Postgres privilege to
-- write role/status at all, whatever their query says.
revoke all on public.profiles from authenticated;
grant select on public.profiles to authenticated;
grant update (name, avatar) on public.profiles to authenticated;

revoke all on public.trainee_stats from authenticated;
grant select on public.trainee_stats to authenticated;

revoke all on public.allowed_domains from authenticated, anon;

-- LAYER 2: RLS. Row ownership, plus WITH CHECK asserting the privileged
-- columns are unchanged. The original schema had no WITH CHECK at all.
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (auth.uid() = id)
  with check (
    auth.uid() = id
    and role   = (select p.role   from public.profiles p where p.id = auth.uid())
    and status = (select p.status from public.profiles p where p.id = auth.uid())
  );

-- LAYER 3: a trigger, so even a mistake in layers 1 or 2 is not a breach.
create or replace function public.prevent_role_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if current_setting('role', true) = 'service_role' then
    return new;
  end if;
  if new.role is distinct from old.role then
    raise exception 'role may only be changed by an administrator';
  end if;
  if new.status is distinct from old.status then
    raise exception 'status may only be changed by an administrator';
  end if;
  return new;
end;
$$;

create trigger profiles_prevent_role_change
  before update on public.profiles
  for each row execute function public.prevent_role_change();
```

- [ ] **Step 4: Apply and run tests**

Run:
```bash
npx supabase db reset
npm run test:db -- privilege-escalation
```
Expected: PASS (10 tests)

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260821000400_privilege_guards.sql supabase/tests/privilege-escalation.test.js
git commit -m "feat(db): three-layer guard against privilege escalation"
```

---

## Task 5: RLS helper functions and supervisor hierarchy

**Files:**
- Create: `supabase/migrations/20260821000500_helpers.sql`
- Create: `supabase/tests/helpers-fn.test.js`

**Interfaces:**
- Consumes: `profiles` from Task 2
- Produces: table `public.supervisor_trainers(supervisor_id, trainer_id)`; functions `app.current_role() returns public.app_role`, `app.is_admin() returns boolean`, `app.is_active() returns boolean`, `app.supervises(uuid) returns boolean`

- [ ] **Step 1: Write the failing test**

Create `supabase/tests/helpers-fn.test.js`:

```javascript
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { serviceClient, createUser, signIn, resetDb, uniqueEmail } from './helpers.js';

const svc = serviceClient();
let admin, supervisor, trainer, trainee;

beforeEach(async () => {
  await resetDb();
  admin      = await createUser({ email: uniqueEmail(), role: 'admin' });
  supervisor = await createUser({ email: uniqueEmail(), role: 'supervisor' });
  trainer    = await createUser({ email: uniqueEmail(), role: 'trainer' });
  trainee    = await createUser({ email: uniqueEmail(), role: 'trainee' });
  await svc.from('supervisor_trainers')
    .insert({ supervisor_id: supervisor.id, trainer_id: trainer.id });
});
afterAll(resetDb);

describe('app.current_role', () => {
  it('reports the caller role', async () => {
    const c = await signIn(trainer.email);
    const { data } = await c.rpc('current_role_probe');
    expect(data).toBe('trainer');
  });
});

describe('app.is_admin', () => {
  it('is true for an admin', async () => {
    const c = await signIn(admin.email);
    const { data } = await c.rpc('is_admin_probe');
    expect(data).toBe(true);
  });

  it('is false for a trainee', async () => {
    const c = await signIn(trainee.email);
    const { data } = await c.rpc('is_admin_probe');
    expect(data).toBe(false);
  });

  it('is false for a suspended admin', async () => {
    await svc.from('profiles').update({ status: 'suspended' }).eq('id', admin.id);
    const c = await signIn(admin.email);
    const { data } = await c.rpc('is_admin_probe');
    expect(data).toBe(false);
  });
});

describe('app.supervises', () => {
  it('is true for a managed trainer', async () => {
    const c = await signIn(supervisor.email);
    const { data } = await c.rpc('supervises_probe', { target: trainer.id });
    expect(data).toBe(true);
  });

  it('is false for an unmanaged trainer', async () => {
    const other = await createUser({ email: uniqueEmail(), role: 'trainer' });
    const c = await signIn(supervisor.email);
    const { data } = await c.rpc('supervises_probe', { target: other.id });
    expect(data).toBe(false);
  });

  it('is false for a trainee asking about a trainer', async () => {
    const c = await signIn(trainee.email);
    const { data } = await c.rpc('supervises_probe', { target: trainer.id });
    expect(data).toBe(false);
  });
});

describe('supervisor_trainers is not client-writable', () => {
  it('rejects a supervisor adding themselves to a trainer', async () => {
    const other = await createUser({ email: uniqueEmail(), role: 'trainer' });
    const c = await signIn(supervisor.email);
    const { error } = await c.from('supervisor_trainers')
      .insert({ supervisor_id: supervisor.id, trainer_id: other.id });
    expect(error).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:db -- helpers-fn`
Expected: FAIL — `relation "public.supervisor_trainers" does not exist`

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260821000500_helpers.sql`:

```sql
create schema if not exists app;

-- Normalised from the prototype's managedTrainers text array: array
-- containment inside RLS policies is awkward and defeats the indexes the
-- three-hop supervisor check needs.
create table public.supervisor_trainers (
  supervisor_id uuid not null references public.profiles(id) on delete cascade,
  trainer_id    uuid not null references public.profiles(id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (supervisor_id, trainer_id)
);

alter table public.supervisor_trainers enable row level security;
revoke all on public.supervisor_trainers from authenticated, anon;
grant select on public.supervisor_trainers to authenticated;

create index supervisor_trainers_trainer_idx on public.supervisor_trainers(trainer_id);

-- A policy on profiles that needed the caller's role would itself query
-- profiles, recursing forever. SECURITY DEFINER bypasses RLS inside the
-- function and breaks the cycle. search_path is pinned to close the
-- SECURITY DEFINER search-path injection hole.
create or replace function app.current_role()
returns public.app_role
language sql stable security definer set search_path = ''
as $$ select p.role from public.profiles p where p.id = auth.uid() $$;

create or replace function app.is_active()
returns boolean
language sql stable security definer set search_path = ''
as $$ select coalesce((select p.status = 'active' from public.profiles p where p.id = auth.uid()), false) $$;

create or replace function app.is_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select p.role = 'admin' and p.status = 'active'
       from public.profiles p where p.id = auth.uid()),
    false)
$$;

create or replace function app.supervises(target uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
      from public.supervisor_trainers st
      join public.profiles p on p.id = st.supervisor_id
     where st.supervisor_id = auth.uid()
       and st.trainer_id    = target
       and p.status = 'active'
  )
$$;

grant usage on schema app to authenticated;
grant execute on all functions in schema app to authenticated;

-- Thin public wrappers so tests and PostgREST can call the helpers by RPC.
create or replace function public.current_role_probe() returns public.app_role
  language sql stable security invoker set search_path = '' as $$ select app.current_role() $$;
create or replace function public.is_admin_probe() returns boolean
  language sql stable security invoker set search_path = '' as $$ select app.is_admin() $$;
create or replace function public.supervises_probe(target uuid) returns boolean
  language sql stable security invoker set search_path = '' as $$ select app.supervises(target) $$;
```

- [ ] **Step 4: Apply and run tests**

Run:
```bash
npx supabase db reset
npm run test:db -- helpers-fn
```
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260821000500_helpers.sql supabase/tests/helpers-fn.test.js
git commit -m "feat(db): add RLS helper functions and supervisor hierarchy table"
```

---

## Task 6: Profile read visibility

**Files:**
- Create: `supabase/migrations/20260821000600_profiles_rls.sql`
- Create: `supabase/tests/profile-visibility.test.js`

**Interfaces:**
- Consumes: `app.is_admin()`, `app.supervises()` from Task 5
- Produces: view `public.public_profiles(id, name, avatar, role)`; SELECT policies on `profiles`

- [ ] **Step 1: Write the failing test**

Create `supabase/tests/profile-visibility.test.js`:

```javascript
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { serviceClient, anonClient, createUser, signIn, resetDb, uniqueEmail } from './helpers.js';

const svc = serviceClient();
let admin, supervisor, trainer, traineeA, traineeB;

beforeEach(async () => {
  await resetDb();
  admin      = await createUser({ email: uniqueEmail(), role: 'admin',      name: 'Admin' });
  supervisor = await createUser({ email: uniqueEmail(), role: 'supervisor', name: 'Super' });
  trainer    = await createUser({ email: uniqueEmail(), role: 'trainer',    name: 'Trainer' });
  traineeA   = await createUser({ email: uniqueEmail(), role: 'trainee',    name: 'Amira' });
  traineeB   = await createUser({ email: uniqueEmail(), role: 'trainee',    name: 'Marcus' });
  await svc.from('supervisor_trainers')
    .insert({ supervisor_id: supervisor.id, trainer_id: trainer.id });
});
afterAll(resetDb);

describe('RED TEAM: email harvesting', () => {
  it('an anonymous visitor reads no profiles at all', async () => {
    const { data } = await anonClient().from('profiles').select('email');
    expect(data ?? []).toHaveLength(0);
  });

  it('a trainee cannot read another trainee email', async () => {
    const c = await signIn(traineeA.email);
    const { data } = await c.from('profiles').select('email').eq('id', traineeB.id);
    expect(data ?? []).toHaveLength(0);
  });

  it('a trainee cannot enumerate the whole user table', async () => {
    const c = await signIn(traineeA.email);
    const { data } = await c.from('profiles').select('id,email');
    expect(data).toHaveLength(1);
    expect(data[0].id).toBe(traineeA.id);
  });
});

describe('legitimate visibility', () => {
  it('a trainee reads their own profile', async () => {
    const c = await signIn(traineeA.email);
    const { data } = await c.from('profiles').select('email').eq('id', traineeA.id).single();
    expect(data.email).toBe(traineeA.email);
  });

  it('an admin reads every profile', async () => {
    const c = await signIn(admin.email);
    const { data } = await c.from('profiles').select('id');
    expect(data.length).toBeGreaterThanOrEqual(5);
  });

  it('a supervisor reads a managed trainer profile', async () => {
    const c = await signIn(supervisor.email);
    const { data } = await c.from('profiles').select('id').eq('id', trainer.id);
    expect(data).toHaveLength(1);
  });

  it('a supervisor cannot read an unmanaged trainer profile', async () => {
    const other = await createUser({ email: uniqueEmail(), role: 'trainer' });
    const c = await signIn(supervisor.email);
    const { data } = await c.from('profiles').select('id').eq('id', other.id);
    expect(data ?? []).toHaveLength(0);
  });
});

describe('public_profiles view', () => {
  it('lets a trainee see display names for chat', async () => {
    const c = await signIn(traineeA.email);
    const { data } = await c.from('public_profiles').select('id,name,role').eq('id', traineeB.id).single();
    expect(data.name).toBe('Marcus');
  });

  it('does NOT expose email — the column does not exist on the view', async () => {
    const c = await signIn(traineeA.email);
    const { error } = await c.from('public_profiles').select('email').limit(1);
    expect(error).not.toBeNull();
    expect(error.message).toMatch(/column .*email.* does not exist/i);
  });

  it('is closed to anonymous visitors', async () => {
    const { data } = await anonClient().from('public_profiles').select('id');
    expect(data ?? []).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:db -- profile-visibility`
Expected: FAIL — no SELECT policy exists, and `public_profiles` is missing

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260821000600_profiles_rls.sql`:

```sql
-- The original schema used `using (true)`, publishing every user's email to
-- anyone holding the anon key, which ships in the browser bundle.
create policy profiles_select_self on public.profiles
  for select to authenticated
  using (auth.uid() = id);

create policy profiles_select_admin on public.profiles
  for select to authenticated
  using (app.is_admin());

create policy profiles_select_supervised on public.profiles
  for select to authenticated
  using (app.supervises(id));

create policy trainee_stats_select_self on public.trainee_stats
  for select to authenticated
  using (auth.uid() = profile_id);

create policy trainee_stats_select_admin on public.trainee_stats
  for select to authenticated
  using (app.is_admin());

-- Display identity for chat and rosters, without contact details.
-- security_invoker = off so the view is readable regardless of the base-table
-- policies, but it exposes only non-sensitive columns.
create view public.public_profiles
  with (security_invoker = off)
  as select id, name, avatar, role from public.profiles where status = 'active';

revoke all on public.public_profiles from anon, authenticated;
grant select on public.public_profiles to authenticated;
```

- [ ] **Step 4: Apply and run tests**

Run:
```bash
npx supabase db reset
npm run test:db -- profile-visibility
```
Expected: PASS (9 tests)

- [ ] **Step 5: Run the whole database suite for regressions**

Run: `npm run test:db`
Expected: PASS (all files)

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260821000600_profiles_rls.sql supabase/tests/profile-visibility.test.js
git commit -m "feat(db): restrict profile reads and add public_profiles view"
```

---

## Task 7: Append-only audit log

**Files:**
- Create: `supabase/migrations/20260821000700_audit_log.sql`
- Create: `supabase/tests/audit-log.test.js`

**Interfaces:**
- Consumes: `app.is_admin()` from Task 5
- Produces: table `public.audit_log(id bigserial, actor_id, action, entity_type, entity_id, before jsonb, after jsonb, created_at)`

- [ ] **Step 1: Write the failing test**

Create `supabase/tests/audit-log.test.js`:

```javascript
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { serviceClient, createUser, signIn, resetDb, uniqueEmail } from './helpers.js';

const svc = serviceClient();
let admin, trainee;

beforeEach(async () => {
  await resetDb();
  admin   = await createUser({ email: uniqueEmail(), role: 'admin' });
  trainee = await createUser({ email: uniqueEmail(), role: 'trainee' });
  await svc.from('audit_log').insert({
    actor_id: admin.id, action: 'test.action', entity_type: 'profile', entity_id: trainee.id,
  });
});
afterAll(resetDb);

describe('audit_log access', () => {
  it('an admin can read it', async () => {
    const c = await signIn(admin.email);
    const { data } = await c.from('audit_log').select('*');
    expect(data.length).toBeGreaterThan(0);
  });

  it('a trainee cannot read it', async () => {
    const c = await signIn(trainee.email);
    const { data } = await c.from('audit_log').select('*');
    expect(data ?? []).toHaveLength(0);
  });
});

describe('audit_log is append-only', () => {
  it('an admin cannot update an entry', async () => {
    const c = await signIn(admin.email);
    const { error } = await c.from('audit_log').update({ action: 'tampered' }).neq('id', 0);
    expect(error).not.toBeNull();
  });

  it('an admin cannot delete an entry', async () => {
    const c = await signIn(admin.email);
    await c.from('audit_log').delete().neq('id', 0);
    const { data } = await svc.from('audit_log').select('id');
    expect(data.length).toBeGreaterThan(0);
  });

  it('even the service role cannot update an entry', async () => {
    const { error } = await svc.from('audit_log').update({ action: 'tampered' }).neq('id', 0);
    expect(error).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:db -- audit-log`
Expected: FAIL — `relation "public.audit_log" does not exist`

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260821000700_audit_log.sql`:

```sql
create table public.audit_log (
  id          bigserial primary key,
  actor_id    uuid references public.profiles(id) on delete set null,
  action      text not null,
  entity_type text not null,
  entity_id   text,
  before      jsonb,
  after       jsonb,
  created_at  timestamptz not null default now()
);

alter table public.audit_log enable row level security;

create index audit_log_actor_idx  on public.audit_log(actor_id);
create index audit_log_entity_idx on public.audit_log(entity_type, entity_id);

revoke all on public.audit_log from anon, authenticated;
grant select on public.audit_log to authenticated;

create policy audit_log_select_admin on public.audit_log
  for select to authenticated using (app.is_admin());

-- Append-only, enforced for every role including service_role. An audit trail
-- that can be rewritten is not an audit trail.
create or replace function public.audit_log_is_immutable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'audit_log is append-only';
end;
$$;

create trigger audit_log_no_update
  before update or delete on public.audit_log
  for each row execute function public.audit_log_is_immutable();
```

- [ ] **Step 4: Apply and run tests**

Run:
```bash
npx supabase db reset
npm run test:db -- audit-log
```
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260821000700_audit_log.sql supabase/tests/audit-log.test.js
git commit -m "feat(db): add append-only audit log"
```

---

## Task 8: Shared Edge Function helpers

**Files:**
- Create: `supabase/functions/_shared/auth.ts`
- Create: `supabase/functions/_shared/audit.ts`
- Create: `supabase/functions/_shared/cors.ts`

**Interfaces:**
- Consumes: `profiles`, `audit_log`
- Produces:
  - `requireRole(req, roles: string[]): Promise<{ profile, service }>` — throws `HttpError` on failure
  - `writeAudit(service, { actorId, action, entityType, entityId, before, after }): Promise<void>`
  - `class HttpError extends Error { status: number }`
  - `corsHeaders`, `handleOptions(req): Response | null`

- [ ] **Step 1: Write the CORS helper**

Create `supabase/functions/_shared/cors.ts`:

```typescript
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function handleOptions(req: Request): Response | null {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  return null;
}
```

- [ ] **Step 2: Write the auth helper**

Create `supabase/functions/_shared/auth.ts`:

```typescript
import { createClient, SupabaseClient } from 'jsr:@supabase/supabase-js@2';

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export interface Profile {
  id: string;
  role: 'admin' | 'supervisor' | 'trainer' | 'trainee';
  status: 'pending' | 'active' | 'suspended' | 'rejected';
  name: string;
  email: string;
}

export function serviceClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );
}

/**
 * Verifies the caller and returns their profile READ FROM THE DATABASE.
 * The JWT role claim is deliberately ignored here: it can be up to an hour
 * stale, and a privileged write must never act on stale authority.
 */
export async function requireRole(
  req: Request,
  roles: Array<Profile['role']>,
): Promise<{ profile: Profile; service: SupabaseClient }> {
  const header = req.headers.get('Authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) throw new HttpError(401, 'Missing bearer token');

  const service = serviceClient();
  const { data: userData, error: userErr } = await service.auth.getUser(token);
  if (userErr || !userData?.user) throw new HttpError(401, 'Invalid token');

  const { data: profile, error } = await service
    .from('profiles')
    .select('id, role, status, name, email')
    .eq('id', userData.user.id)
    .single();

  if (error || !profile) throw new HttpError(403, 'No profile');
  if (profile.status !== 'active') throw new HttpError(403, 'Account is not active');
  if (!roles.includes(profile.role)) throw new HttpError(403, 'Insufficient role');

  return { profile: profile as Profile, service };
}

export function errorResponse(err: unknown, headers: Record<string, string>): Response {
  const status = err instanceof HttpError ? err.status : 500;
  const message = err instanceof Error ? err.message : 'Unexpected error';
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}
```

- [ ] **Step 3: Write the audit helper**

Create `supabase/functions/_shared/audit.ts`:

```typescript
import { SupabaseClient } from 'jsr:@supabase/supabase-js@2';

export async function writeAudit(
  service: SupabaseClient,
  entry: {
    actorId: string;
    action: string;
    entityType: string;
    entityId: string;
    before?: unknown;
    after?: unknown;
  },
): Promise<void> {
  const { error } = await service.from('audit_log').insert({
    actor_id: entry.actorId,
    action: entry.action,
    entity_type: entry.entityType,
    entity_id: entry.entityId,
    before: entry.before ?? null,
    after: entry.after ?? null,
  });
  // An unwritten audit entry means the action must not be reported as done.
  if (error) throw new Error(`audit write failed: ${error.message}`);
}
```

- [ ] **Step 4: Verify the functions runtime loads the shared modules**

Run:
```bash
npx supabase functions serve --no-verify-jwt
```
Expected: starts without a module resolution error. Stop with Ctrl+C.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared
git commit -m "feat(fn): add shared auth, audit and CORS helpers for Edge Functions"
```

---

## Task 9: `admin-set-role` Edge Function

**Files:**
- Create: `supabase/functions/admin-set-role/index.ts`
- Create: `supabase/tests/fn-admin-set-role.test.js`

**Interfaces:**
- Consumes: `requireRole`, `writeAudit`, `HttpError`, `errorResponse` from Task 8
- Produces: `POST /functions/v1/admin-set-role` with body `{ userId: string, role: 'admin'|'supervisor'|'trainer'|'trainee' }`, returning `{ ok: true, profile }`

- [ ] **Step 1: Write the failing test**

Create `supabase/tests/fn-admin-set-role.test.js`:

```javascript
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { serviceClient, createUser, signIn, resetDb, uniqueEmail, SUPABASE_URL } from './helpers.js';

const svc = serviceClient();
let admin, trainer, trainee;

async function call(client, body) {
  const { data: { session } } = await client.auth.getSession();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/admin-set-role`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

const roleOf = async (id) =>
  (await svc.from('profiles').select('role').eq('id', id).single()).data.role;

beforeEach(async () => {
  await resetDb();
  admin   = await createUser({ email: uniqueEmail(), role: 'admin' });
  trainer = await createUser({ email: uniqueEmail(), role: 'trainer' });
  trainee = await createUser({ email: uniqueEmail(), role: 'trainee' });
});
afterAll(resetDb);

describe('admin-set-role', () => {
  it('lets an admin promote a trainee to trainer', async () => {
    const c = await signIn(admin.email);
    const res = await call(c, { userId: trainee.id, role: 'trainer' });
    expect(res.status).toBe(200);
    expect(await roleOf(trainee.id)).toBe('trainer');
  });

  it('writes an audit entry recording before and after', async () => {
    const c = await signIn(admin.email);
    await call(c, { userId: trainee.id, role: 'trainer' });
    const { data } = await svc.from('audit_log').select('*').eq('action', 'profile.role_changed');
    expect(data).toHaveLength(1);
    expect(data[0].actor_id).toBe(admin.id);
    expect(data[0].before.role).toBe('trainee');
    expect(data[0].after.role).toBe('trainer');
  });

  it('REJECTS a trainee calling it', async () => {
    const c = await signIn(trainee.email);
    const res = await call(c, { userId: trainee.id, role: 'admin' });
    expect(res.status).toBe(403);
    expect(await roleOf(trainee.id)).toBe('trainee');
  });

  it('REJECTS a trainer calling it', async () => {
    const c = await signIn(trainer.email);
    const res = await call(c, { userId: trainer.id, role: 'admin' });
    expect(res.status).toBe(403);
  });

  it('rejects an unauthenticated caller', async () => {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/admin-set-role`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: trainee.id, role: 'admin' }),
    });
    expect([401, 403]).toContain(res.status);
  });

  it('rejects a suspended admin', async () => {
    const c = await signIn(admin.email);
    await svc.from('profiles').update({ status: 'suspended' }).eq('id', admin.id);
    const res = await call(c, { userId: trainee.id, role: 'trainer' });
    expect(res.status).toBe(403);
  });

  it('rejects an invalid role value', async () => {
    const c = await signIn(admin.email);
    const res = await call(c, { userId: trainee.id, role: 'superuser' });
    expect(res.status).toBe(400);
  });

  it('refuses to demote the last remaining admin', async () => {
    const c = await signIn(admin.email);
    const res = await call(c, { userId: admin.id, role: 'trainee' });
    expect(res.status).toBe(409);
    expect(await roleOf(admin.id)).toBe('admin');
  });

  it('allows demoting an admin when another admin remains', async () => {
    const second = await createUser({ email: uniqueEmail(), role: 'admin' });
    const c = await signIn(admin.email);
    const res = await call(c, { userId: second.id, role: 'trainee' });
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Start the function runtime in a second terminal: `npx supabase functions serve`

Run: `npm run test:db -- fn-admin-set-role`
Expected: FAIL — 404, the function does not exist

- [ ] **Step 3: Write the function**

Create `supabase/functions/admin-set-role/index.ts`:

```typescript
import { requireRole, errorResponse, HttpError } from '../_shared/auth.ts';
import { writeAudit } from '../_shared/audit.ts';
import { corsHeaders, handleOptions } from '../_shared/cors.ts';

const VALID_ROLES = ['admin', 'supervisor', 'trainer', 'trainee'];

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const { profile: actor, service } = await requireRole(req, ['admin']);
    const { userId, role } = await req.json();

    if (!userId || !VALID_ROLES.includes(role)) {
      throw new HttpError(400, 'userId and a valid role are required');
    }

    const { data: target, error: readErr } = await service
      .from('profiles').select('id, role, status, name, email').eq('id', userId).single();
    if (readErr || !target) throw new HttpError(404, 'User not found');

    // Locking everyone out of administration is unrecoverable without
    // database access, so it is refused rather than merely warned about.
    if (target.role === 'admin' && role !== 'admin') {
      const { count } = await service
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'admin').eq('status', 'active');
      if ((count ?? 0) <= 1) throw new HttpError(409, 'Cannot demote the last active admin');
    }

    const { data: updated, error: updErr } = await service
      .from('profiles').update({ role }).eq('id', userId)
      .select('id, role, status, name, email').single();
    if (updErr) throw new HttpError(500, updErr.message);

    await writeAudit(service, {
      actorId: actor.id,
      action: 'profile.role_changed',
      entityType: 'profile',
      entityId: userId,
      before: { role: target.role },
      after: { role: updated.role },
    });

    return new Response(JSON.stringify({ ok: true, profile: updated }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return errorResponse(err, corsHeaders);
  }
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:db -- fn-admin-set-role`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/admin-set-role supabase/tests/fn-admin-set-role.test.js
git commit -m "feat(fn): add admin-set-role with last-admin protection and audit"
```

---

## Task 10: `admin-review-signup` and `admin-suspend-user`

**Files:**
- Create: `supabase/functions/admin-review-signup/index.ts`
- Create: `supabase/functions/admin-suspend-user/index.ts`
- Create: `supabase/tests/fn-admin-review.test.js`

**Interfaces:**
- Consumes: `requireRole`, `writeAudit` from Task 8
- Produces:
  - `POST /functions/v1/admin-review-signup` body `{ userId, decision: 'approve'|'reject', role? }` → `{ ok: true, profile }`
  - `POST /functions/v1/admin-suspend-user` body `{ userId, suspend: boolean }` → `{ ok: true, profile }`

- [ ] **Step 1: Write the failing test**

Create `supabase/tests/fn-admin-review.test.js`:

```javascript
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { serviceClient, createUser, signIn, resetDb, uniqueEmail, SUPABASE_URL } from './helpers.js';

const svc = serviceClient();
let admin, pending, trainee;

async function call(fn, client, body) {
  const { data: { session } } = await client.auth.getSession();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

const profileOf = async (id) =>
  (await svc.from('profiles').select('role,status').eq('id', id).single()).data;

beforeEach(async () => {
  await resetDb();
  admin   = await createUser({ email: uniqueEmail(), role: 'admin' });
  pending = await createUser({ email: uniqueEmail(), role: 'trainee', status: 'pending' });
  trainee = await createUser({ email: uniqueEmail(), role: 'trainee', status: 'active' });
});
afterAll(resetDb);

describe('admin-review-signup', () => {
  it('approves a pending user and assigns a role', async () => {
    const c = await signIn(admin.email);
    const res = await call('admin-review-signup', c, { userId: pending.id, decision: 'approve', role: 'trainer' });
    expect(res.status).toBe(200);
    expect(await profileOf(pending.id)).toEqual({ role: 'trainer', status: 'active' });
  });

  it('defaults an approved user to trainee when no role is given', async () => {
    const c = await signIn(admin.email);
    await call('admin-review-signup', c, { userId: pending.id, decision: 'approve' });
    expect((await profileOf(pending.id)).role).toBe('trainee');
  });

  it('rejects a pending user', async () => {
    const c = await signIn(admin.email);
    await call('admin-review-signup', c, { userId: pending.id, decision: 'reject' });
    expect((await profileOf(pending.id)).status).toBe('rejected');
  });

  it('writes an audit entry', async () => {
    const c = await signIn(admin.email);
    await call('admin-review-signup', c, { userId: pending.id, decision: 'approve' });
    const { data } = await svc.from('audit_log').select('*').eq('action', 'profile.signup_reviewed');
    expect(data).toHaveLength(1);
  });

  it('REJECTS a non-admin caller', async () => {
    const c = await signIn(trainee.email);
    const res = await call('admin-review-signup', c, { userId: pending.id, decision: 'approve', role: 'admin' });
    expect(res.status).toBe(403);
    expect((await profileOf(pending.id)).status).toBe('pending');
  });

  it('refuses to review a user who is not pending', async () => {
    const c = await signIn(admin.email);
    const res = await call('admin-review-signup', c, { userId: trainee.id, decision: 'approve' });
    expect(res.status).toBe(409);
  });
});

describe('admin-suspend-user', () => {
  it('suspends an active user', async () => {
    const c = await signIn(admin.email);
    const res = await call('admin-suspend-user', c, { userId: trainee.id, suspend: true });
    expect(res.status).toBe(200);
    expect((await profileOf(trainee.id)).status).toBe('suspended');
  });

  it('reinstates a suspended user', async () => {
    const c = await signIn(admin.email);
    await call('admin-suspend-user', c, { userId: trainee.id, suspend: true });
    await call('admin-suspend-user', c, { userId: trainee.id, suspend: false });
    expect((await profileOf(trainee.id)).status).toBe('active');
  });

  it('refuses to suspend the last active admin', async () => {
    const c = await signIn(admin.email);
    const res = await call('admin-suspend-user', c, { userId: admin.id, suspend: true });
    expect(res.status).toBe(409);
  });

  it('REJECTS a non-admin caller', async () => {
    const c = await signIn(trainee.email);
    const res = await call('admin-suspend-user', c, { userId: admin.id, suspend: true });
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:db -- fn-admin-review`
Expected: FAIL — 404 for both functions

- [ ] **Step 3: Write `admin-review-signup`**

Create `supabase/functions/admin-review-signup/index.ts`:

```typescript
import { requireRole, errorResponse, HttpError } from '../_shared/auth.ts';
import { writeAudit } from '../_shared/audit.ts';
import { corsHeaders, handleOptions } from '../_shared/cors.ts';

const VALID_ROLES = ['admin', 'supervisor', 'trainer', 'trainee'];

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const { profile: actor, service } = await requireRole(req, ['admin']);
    const { userId, decision, role = 'trainee' } = await req.json();

    if (!userId || !['approve', 'reject'].includes(decision)) {
      throw new HttpError(400, 'userId and decision (approve|reject) are required');
    }
    if (!VALID_ROLES.includes(role)) throw new HttpError(400, 'Invalid role');

    const { data: target, error: readErr } = await service
      .from('profiles').select('id, role, status').eq('id', userId).single();
    if (readErr || !target) throw new HttpError(404, 'User not found');
    if (target.status !== 'pending') throw new HttpError(409, 'User is not awaiting review');

    const patch = decision === 'approve'
      ? { status: 'active', role }
      : { status: 'rejected' };

    const { data: updated, error: updErr } = await service
      .from('profiles').update(patch).eq('id', userId)
      .select('id, role, status, name, email').single();
    if (updErr) throw new HttpError(500, updErr.message);

    await writeAudit(service, {
      actorId: actor.id,
      action: 'profile.signup_reviewed',
      entityType: 'profile',
      entityId: userId,
      before: { role: target.role, status: target.status },
      after: { role: updated.role, status: updated.status },
    });

    return new Response(JSON.stringify({ ok: true, profile: updated }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return errorResponse(err, corsHeaders);
  }
});
```

- [ ] **Step 4: Write `admin-suspend-user`**

Create `supabase/functions/admin-suspend-user/index.ts`:

```typescript
import { requireRole, errorResponse, HttpError } from '../_shared/auth.ts';
import { writeAudit } from '../_shared/audit.ts';
import { corsHeaders, handleOptions } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const { profile: actor, service } = await requireRole(req, ['admin']);
    const { userId, suspend } = await req.json();

    if (!userId || typeof suspend !== 'boolean') {
      throw new HttpError(400, 'userId and boolean suspend are required');
    }

    const { data: target, error: readErr } = await service
      .from('profiles').select('id, role, status').eq('id', userId).single();
    if (readErr || !target) throw new HttpError(404, 'User not found');

    if (suspend && target.role === 'admin') {
      const { count } = await service
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'admin').eq('status', 'active');
      if ((count ?? 0) <= 1) throw new HttpError(409, 'Cannot suspend the last active admin');
    }

    // Users are suspended rather than deleted so their training records,
    // which are compliance evidence, survive.
    const { data: updated, error: updErr } = await service
      .from('profiles').update({ status: suspend ? 'suspended' : 'active' }).eq('id', userId)
      .select('id, role, status, name, email').single();
    if (updErr) throw new HttpError(500, updErr.message);

    await writeAudit(service, {
      actorId: actor.id,
      action: suspend ? 'profile.suspended' : 'profile.reinstated',
      entityType: 'profile',
      entityId: userId,
      before: { status: target.status },
      after: { status: updated.status },
    });

    return new Response(JSON.stringify({ ok: true, profile: updated }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return errorResponse(err, corsHeaders);
  }
});
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run test:db -- fn-admin-review`
Expected: PASS (10 tests)

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/admin-review-signup supabase/functions/admin-suspend-user supabase/tests/fn-admin-review.test.js
git commit -m "feat(fn): add signup review and user suspension functions"
```

---

## Task 11: Frontend API layer

**Files:**
- Create: `src/api/client.js`
- Create: `src/api/auth.js`
- Create: `src/api/profiles.js`
- Create: `src/api/auth.test.js`
- Modify: `src/lib/supabaseClient.js`
- Modify: `.env.local.example`

**Interfaces:**
- Consumes: the database and functions from Tasks 2–10
- Produces:
  - `src/api/client.js`: `supabase`, `isConfigured`
  - `src/api/auth.js`: `signIn(email, password)`, `signUp({email, password, name})`, `signOut()`, `resetPassword(email)`, `getSession()`, `onAuthChange(cb)`
  - `src/api/profiles.js`: `toCamel(row)`, `fetchMyProfile()`, `updateMyProfile({name, avatar})`, `setUserRole(userId, role)`, `reviewSignup(userId, decision, role)`

- [ ] **Step 1: Write the failing test**

Create `src/api/auth.test.js`:

```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockAuth = {
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
};

vi.mock('./client', () => ({ supabase: { auth: mockAuth }, isConfigured: true }));

const { signIn, signUp, signOut, resetPassword } = await import('./auth');
const { toCamel } = await import('./profiles');

beforeEach(() => vi.clearAllMocks());

describe('auth wrapper', () => {
  it('signs in with trimmed lowercase email', async () => {
    mockAuth.signInWithPassword.mockResolvedValue({ data: { user: { id: '1' } }, error: null });
    await signIn('  Amira@Example.COM ', 'pw');
    expect(mockAuth.signInWithPassword)
      .toHaveBeenCalledWith({ email: 'amira@example.com', password: 'pw' });
  });

  it('throws a readable error when sign-in fails', async () => {
    mockAuth.signInWithPassword.mockResolvedValue({ data: null, error: { message: 'Invalid login credentials' } });
    await expect(signIn('a@b.com', 'pw')).rejects.toThrow(/Invalid login credentials/);
  });

  it('passes only the name through signup metadata, never a role', async () => {
    mockAuth.signUp.mockResolvedValue({ data: { user: { id: '1' } }, error: null });
    await signUp({ email: 'a@b.com', password: 'pw', name: 'Amira', role: 'admin' });
    const arg = mockAuth.signUp.mock.calls[0][0];
    expect(arg.options.data).toEqual({ name: 'Amira' });
  });

  it('signs out', async () => {
    mockAuth.signOut.mockResolvedValue({ error: null });
    await signOut();
    expect(mockAuth.signOut).toHaveBeenCalled();
  });

  it('requests a password reset', async () => {
    mockAuth.resetPasswordForEmail.mockResolvedValue({ error: null });
    await resetPassword('a@b.com');
    expect(mockAuth.resetPasswordForEmail).toHaveBeenCalled();
  });
});

describe('toCamel', () => {
  it('maps snake_case columns to camelCase', () => {
    expect(toCamel({
      id: 'u1', role: 'trainee', status: 'active', name: 'Amira',
      email: 'a@b.com', avatar: 'AA', created_at: '2026-01-01T00:00:00Z',
    })).toEqual({
      id: 'u1', role: 'trainee', status: 'active', name: 'Amira',
      email: 'a@b.com', avatar: 'AA', createdAt: '2026-01-01T00:00:00Z',
    });
  });

  it('returns null for a missing row', () => {
    expect(toCamel(null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/api/auth.test.js`
Expected: FAIL — cannot resolve `./client`

- [ ] **Step 3: Write the client module**

Create `src/api/client.js`:

```javascript
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isConfigured = Boolean(url && anonKey);

if (!isConfigured) {
  console.warn('Supabase is not configured; auth is unavailable.');
}

export const supabase = isConfigured
  ? createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;
```

- [ ] **Step 4: Write the auth module**

Create `src/api/auth.js`:

```javascript
import { supabase } from './client';

const normalise = (email) => String(email ?? '').trim().toLowerCase();

function unwrap({ data, error }) {
  if (error) throw new Error(error.message);
  return data;
}

export async function signIn(email, password) {
  return unwrap(await supabase.auth.signInWithPassword({
    email: normalise(email), password,
  }));
}

/**
 * Registers a user. Only `name` is sent as metadata: the database trigger
 * decides role and status, so passing a role here would achieve nothing.
 */
export async function signUp({ email, password, name }) {
  return unwrap(await supabase.auth.signUp({
    email: normalise(email),
    password,
    options: { data: { name: String(name ?? '').trim() } },
  }));
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error(error.message);
}

export async function resetPassword(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(normalise(email), {
    redirectTo: `${window.location.origin}/reset-password`,
  });
  if (error) throw new Error(error.message);
}

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data?.session ?? null;
}

export function onAuthChange(callback) {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => callback(session));
  return () => data?.subscription?.unsubscribe();
}
```

- [ ] **Step 5: Write the profiles module**

Create `src/api/profiles.js`:

```javascript
import { supabase } from './client';

/** The single place snake_case becomes camelCase. */
export function toCamel(row) {
  if (!row) return null;
  return {
    id: row.id,
    role: row.role,
    status: row.status,
    name: row.name,
    email: row.email,
    avatar: row.avatar,
    createdAt: row.created_at,
  };
}

export async function fetchMyProfile() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from('profiles').select('*').eq('id', user.id).maybeSingle();
  if (error) throw new Error(error.message);
  return toCamel(data);
}

export async function updateMyProfile({ name, avatar }) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');
  const { data, error } = await supabase
    .from('profiles').update({ name, avatar }).eq('id', user.id).select().single();
  if (error) throw new Error(error.message);
  return toCamel(data);
}

async function invokeAdmin(fn, body) {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return data;
}

export const setUserRole = (userId, role) =>
  invokeAdmin('admin-set-role', { userId, role });

export const reviewSignup = (userId, decision, role) =>
  invokeAdmin('admin-review-signup', { userId, decision, role });

export const suspendUser = (userId, suspend) =>
  invokeAdmin('admin-suspend-user', { userId, suspend });
```

- [ ] **Step 6: Point the legacy client at the new module**

Replace the contents of `src/lib/supabaseClient.js`:

```javascript
// Retained so existing imports keep working while AppContext is migrated.
export { supabase, isConfigured } from '../api/client';
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run src/api/auth.test.js`
Expected: PASS (7 tests)

Run: `npm test`
Expected: PASS — all existing tests still green

- [ ] **Step 8: Commit**

```bash
git add src/api src/lib/supabaseClient.js .env.local.example
git commit -m "feat(api): add Supabase api layer with snake/camel mapping"
```

---

## Task 12: Session hook and TanStack Query

**Files:**
- Create: `src/hooks/useSession.js`
- Create: `src/hooks/useSession.test.jsx`
- Modify: `src/main.jsx`
- Modify: `package.json`

**Interfaces:**
- Consumes: `getSession`, `onAuthChange` from Task 11; `fetchMyProfile` from Task 11
- Produces: `useSession()` returning `{ session, profile, status, isLoading }` where `status` is `'loading'|'signed-out'|'pending'|'active'|'suspended'`

- [ ] **Step 1: Install TanStack Query**

```bash
npm install @tanstack/react-query
```

- [ ] **Step 2: Write the failing test**

Create `src/hooks/useSession.test.jsx`:

```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthChange: vi.fn(() => () => {}),
  fetchMyProfile: vi.fn(),
}));

vi.mock('../api/auth', () => ({ getSession: mocks.getSession, onAuthChange: mocks.onAuthChange }));
vi.mock('../api/profiles', () => ({ fetchMyProfile: mocks.fetchMyProfile }));

const { useSession } = await import('./useSession');

beforeEach(() => vi.clearAllMocks());

describe('useSession', () => {
  it('reports signed-out when there is no session', async () => {
    mocks.getSession.mockResolvedValue(null);
    const { result } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.status).toBe('signed-out'));
    expect(result.current.profile).toBeNull();
  });

  it('reports active for an active profile', async () => {
    mocks.getSession.mockResolvedValue({ user: { id: 'u1' } });
    mocks.fetchMyProfile.mockResolvedValue({ id: 'u1', role: 'trainee', status: 'active' });
    const { result } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.status).toBe('active'));
    expect(result.current.profile.role).toBe('trainee');
  });

  it('reports pending for a profile awaiting approval', async () => {
    mocks.getSession.mockResolvedValue({ user: { id: 'u1' } });
    mocks.fetchMyProfile.mockResolvedValue({ id: 'u1', role: 'trainee', status: 'pending' });
    const { result } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.status).toBe('pending'));
  });

  it('reports suspended for a suspended profile', async () => {
    mocks.getSession.mockResolvedValue({ user: { id: 'u1' } });
    mocks.fetchMyProfile.mockResolvedValue({ id: 'u1', role: 'trainee', status: 'suspended' });
    const { result } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.status).toBe('suspended'));
  });

  it('subscribes to auth changes and unsubscribes on unmount', async () => {
    const unsub = vi.fn();
    mocks.onAuthChange.mockReturnValue(unsub);
    mocks.getSession.mockResolvedValue(null);
    const { unmount } = renderHook(() => useSession());
    await waitFor(() => expect(mocks.onAuthChange).toHaveBeenCalled());
    unmount();
    expect(unsub).toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/hooks/useSession.test.jsx`
Expected: FAIL — cannot resolve `./useSession`

- [ ] **Step 4: Write the hook**

Create `src/hooks/useSession.js`:

```javascript
import { useEffect, useState, useCallback } from 'react';
import { getSession, onAuthChange } from '../api/auth';
import { fetchMyProfile } from '../api/profiles';

/**
 * Single source of truth for "who is signed in and may they use the app".
 * Status is derived from the profile row rather than the JWT, so a
 * suspension takes effect on the next load without waiting for token refresh.
 */
export function useSession() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async (nextSession) => {
    setSession(nextSession);
    if (!nextSession) {
      setProfile(null);
      setIsLoading(false);
      return;
    }
    try {
      setProfile(await fetchMyProfile());
    } catch {
      setProfile(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    getSession().then((s) => { if (active) load(s); });
    const unsubscribe = onAuthChange((s) => { if (active) load(s); });
    return () => { active = false; unsubscribe?.(); };
  }, [load]);

  let status = 'loading';
  if (!isLoading) {
    if (!session || !profile) status = 'signed-out';
    else status = profile.status === 'active' ? 'active' : profile.status;
  }

  return { session, profile, status, isLoading };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/hooks/useSession.test.jsx`
Expected: PASS (5 tests)

- [ ] **Step 6: Wire the QueryClient provider**

Modify `src/main.jsx` to wrap the tree:

```jsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './styles/globals.css'
import App from './App.jsx'
import { AppProvider } from './context/AppContext.jsx'
import ErrorBoundary from './components/shared/ErrorBoundary.jsx'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000, refetchOnWindowFocus: false } },
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary title="NC Spark failed to start">
      <QueryClientProvider client={queryClient}>
        <AppProvider>
          <App />
        </AppProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
)
```

- [ ] **Step 7: Run the full frontend suite**

Run: `npm test`
Expected: PASS — all tests green

- [ ] **Step 8: Commit**

```bash
git add src/hooks src/main.jsx package.json package-lock.json
git commit -m "feat(web): add useSession hook and TanStack Query provider"
```

---

## Task 13: Authentication screens

**Files:**
- Create: `src/pages/auth/LoginPage.jsx`
- Create: `src/pages/auth/SignupPage.jsx`
- Create: `src/pages/auth/PendingApprovalPage.jsx`
- Create: `src/pages/auth/ResetPasswordPage.jsx`
- Create: `src/pages/auth/LoginPage.test.jsx`
- Delete: `src/pages/LoginPage.jsx`

**Interfaces:**
- Consumes: `signIn`, `signUp`, `resetPassword` from Task 11
- Produces: four default-exported route components

- [ ] **Step 1: Write the failing test**

Create `src/pages/auth/LoginPage.test.jsx`:

```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const mocks = vi.hoisted(() => ({ signIn: vi.fn(), resetPassword: vi.fn() }));
vi.mock('../../api/auth', () => ({ signIn: mocks.signIn, resetPassword: mocks.resetPassword }));

const { default: LoginPage } = await import('./LoginPage');

const renderPage = () => render(<MemoryRouter><LoginPage /></MemoryRouter>);
beforeEach(() => vi.clearAllMocks());

describe('LoginPage', () => {
  it('renders email and password fields, not a role picker', () => {
    renderPage();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.queryByText(/Enter as Admin/i)).not.toBeInTheDocument();
  });

  it('submits the credentials', async () => {
    mocks.signIn.mockResolvedValue({ user: { id: 'u1' } });
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText(/email/i), 'amira@example.com');
    await user.type(screen.getByLabelText(/password/i), 'secret123');
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    expect(mocks.signIn).toHaveBeenCalledWith('amira@example.com', 'secret123');
  });

  it('shows the server error message on failure', async () => {
    mocks.signIn.mockRejectedValue(new Error('Invalid login credentials'));
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText(/email/i), 'a@b.com');
    await user.type(screen.getByLabelText(/password/i), 'wrong');
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Invalid login credentials/);
  });

  it('disables the button while submitting', async () => {
    let resolve;
    mocks.signIn.mockReturnValue(new Promise((r) => { resolve = r; }));
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText(/email/i), 'a@b.com');
    await user.type(screen.getByLabelText(/password/i), 'pw');
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    expect(screen.getByRole('button', { name: /signing in/i })).toBeDisabled();
    resolve({ user: {} });
  });

  it('does not submit with an empty password', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText(/email/i), 'a@b.com');
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    expect(mocks.signIn).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/pages/auth/LoginPage.test.jsx`
Expected: FAIL — cannot resolve `./LoginPage`

- [ ] **Step 3: Write `LoginPage`**

Create `src/pages/auth/LoginPage.jsx`:

```jsx
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { signIn } from '../../api/auth';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setBusy(true);
    setError(null);
    try {
      await signIn(email, password);
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-container" style={{ maxWidth: 420 }}>
        <div className="login-header">
          <div className="login-logo">
            <div className="login-logo-mark">NC</div>
            <strong> Spark </strong>
          </div>
          <h1>Welcome back</h1>
          <p>Sign in to continue your training.</p>
        </div>

        <form onSubmit={handleSubmit} className="card no-hover"
              style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1.5rem' }}>
          {error && (
            <div role="alert" style={{ color: 'var(--brand-accent)', fontSize: '0.85rem' }}>
              {error}
            </div>
          )}

          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Email</span>
            <input type="email" value={email} autoComplete="email" required
                   onChange={(e) => setEmail(e.target.value)}
                   style={{ padding: '0.7rem 0.9rem', borderRadius: 'var(--r-md)', border: '1.5px solid var(--border)', background: 'var(--surface-alt)', color: 'var(--text)' }} />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Password</span>
            <input type="password" value={password} autoComplete="current-password" required
                   onChange={(e) => setPassword(e.target.value)}
                   style={{ padding: '0.7rem 0.9rem', borderRadius: 'var(--r-md)', border: '1.5px solid var(--border)', background: 'var(--surface-alt)', color: 'var(--text)' }} />
          </label>

          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
            <Link to="/reset-password">Forgot password?</Link>
            <Link to="/signup">Create an account</Link>
          </div>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/pages/auth/LoginPage.test.jsx`
Expected: PASS (5 tests)

- [ ] **Step 5: Write `SignupPage`**

Create `src/pages/auth/SignupPage.jsx`:

```jsx
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { signUp } from '../../api/auth';

export default function SignupPage() {
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function handleSubmit(e) {
    e.preventDefault();
    if (form.password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await signUp(form);
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="login-page">
        <div className="login-container" style={{ maxWidth: 420 }}>
          <div className="card no-hover" style={{ textAlign: 'center', padding: '2.5rem' }}>
            <div style={{ fontSize: '3rem' }}>📧</div>
            <h2 style={{ fontFamily: 'var(--font-heading)', margin: '1rem 0 0.5rem' }}>Check your inbox</h2>
            <p style={{ color: 'var(--text-2)' }}>
              Confirm your email address to finish creating your account.
            </p>
            <Link to="/login" className="btn btn-ghost" style={{ marginTop: '1.5rem' }}>Back to sign in</Link>
          </div>
        </div>
      </div>
    );
  }

  const field = { padding: '0.7rem 0.9rem', borderRadius: 'var(--r-md)', border: '1.5px solid var(--border)', background: 'var(--surface-alt)', color: 'var(--text)' };

  return (
    <div className="login-page">
      <div className="login-container" style={{ maxWidth: 420 }}>
        <div className="login-header">
          <h1>Create your account</h1>
          <p>Accounts outside an approved domain need administrator approval.</p>
        </div>
        <form onSubmit={handleSubmit} className="card no-hover"
              style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1.5rem' }}>
          {error && <div role="alert" style={{ color: 'var(--brand-accent)', fontSize: '0.85rem' }}>{error}</div>}

          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Full name</span>
            <input type="text" value={form.name} required onChange={set('name')} style={field} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Email</span>
            <input type="email" value={form.email} required autoComplete="email" onChange={set('email')} style={field} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Password</span>
            <input type="password" value={form.password} required autoComplete="new-password" onChange={set('password')} style={field} />
          </label>

          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
            {busy ? 'Creating account…' : 'Create account'}
          </button>
          <div style={{ fontSize: '0.8rem', textAlign: 'center' }}>
            <Link to="/login">Already have an account?</Link>
          </div>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Write `PendingApprovalPage` and `ResetPasswordPage`**

Create `src/pages/auth/PendingApprovalPage.jsx`:

```jsx
import { signOut } from '../../api/auth';

export default function PendingApprovalPage({ status = 'pending' }) {
  const copy = status === 'suspended'
    ? { icon: '🚫', title: 'Account suspended', body: 'Your access has been suspended. Contact your administrator if you believe this is a mistake.' }
    : { icon: '⏳', title: 'Awaiting approval', body: 'Your account has been created and is waiting for an administrator to approve it. You will be able to sign in once approved.' };

  return (
    <div className="login-page">
      <div className="login-container" style={{ maxWidth: 460 }}>
        <div className="card no-hover" style={{ textAlign: 'center', padding: '3rem 2rem' }}>
          <div style={{ fontSize: '3rem' }}>{copy.icon}</div>
          <h2 style={{ fontFamily: 'var(--font-heading)', margin: '1rem 0 0.5rem' }}>{copy.title}</h2>
          <p style={{ color: 'var(--text-2)', maxWidth: '44ch', margin: '0 auto 1.5rem' }}>{copy.body}</p>
          <button className="btn btn-ghost" onClick={() => signOut()}>Sign out</button>
        </div>
      </div>
    </div>
  );
}
```

Create `src/pages/auth/ResetPasswordPage.jsx`:

```jsx
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { resetPassword } from '../../api/auth';

export default function ResetPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await resetPassword(email);
      setSent(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-container" style={{ maxWidth: 420 }}>
        <div className="login-header"><h1>Reset your password</h1></div>
        <form onSubmit={handleSubmit} className="card no-hover"
              style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1.5rem' }}>
          {error && <div role="alert" style={{ color: 'var(--brand-accent)', fontSize: '0.85rem' }}>{error}</div>}
          {sent
            ? <p style={{ color: 'var(--text-2)' }}>If that address has an account, a reset link is on its way.</p>
            : (
              <>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Email</span>
                  <input type="email" value={email} required autoComplete="email"
                         onChange={(e) => setEmail(e.target.value)}
                         style={{ padding: '0.7rem 0.9rem', borderRadius: 'var(--r-md)', border: '1.5px solid var(--border)', background: 'var(--surface-alt)', color: 'var(--text)' }} />
                </label>
                <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
                  {busy ? 'Sending…' : 'Send reset link'}
                </button>
              </>
            )}
          <div style={{ fontSize: '0.8rem', textAlign: 'center' }}><Link to="/login">Back to sign in</Link></div>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Delete the role picker**

```bash
git rm src/pages/LoginPage.jsx
```

This removes the role-dropdown login permanently.

- [ ] **Step 8: Commit**

```bash
git add src/pages/auth
git commit -m "feat(web): add real auth screens and delete the role picker"
```

---

## Task 14: Route wiring and AppContext migration

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/context/AppContext.jsx`
- Create: `src/App.auth.test.jsx`
- Delete: `src/App.logout.test.jsx`

**Interfaces:**
- Consumes: `useSession()` from Task 12; the four auth pages from Task 13
- Produces: routing where `status` decides the destination; `AppContext` no longer owns authentication

- [ ] **Step 1: Write the failing test**

Create `src/App.auth.test.jsx`:

```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({ useSession: vi.fn() }));
vi.mock('./hooks/useSession', () => ({ useSession: mocks.useSession }));
vi.mock('./context/AppContext', async (orig) => {
  const actual = await orig();
  return { ...actual };
});

const { default: App } = await import('./App');
const { AppProvider } = await import('./context/AppContext');

const renderApp = (path = '/') => {
  window.history.pushState({}, '', path);
  return render(<AppProvider><App /></AppProvider>);
};

beforeEach(() => vi.clearAllMocks());

describe('routing by session status', () => {
  it('shows the login screen when signed out', async () => {
    mocks.useSession.mockReturnValue({ status: 'signed-out', profile: null, isLoading: false });
    renderApp('/trainee');
    expect(await screen.findByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('shows a loading state while resolving the session', () => {
    mocks.useSession.mockReturnValue({ status: 'loading', profile: null, isLoading: true });
    renderApp('/');
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows the pending screen for an unapproved account', async () => {
    mocks.useSession.mockReturnValue({
      status: 'pending', profile: { id: 'u1', role: 'trainee', status: 'pending' }, isLoading: false,
    });
    renderApp('/');
    expect(await screen.findByText(/Awaiting approval/i)).toBeInTheDocument();
  });

  it('shows the suspended screen for a suspended account', async () => {
    mocks.useSession.mockReturnValue({
      status: 'suspended', profile: { id: 'u1', role: 'trainee', status: 'suspended' }, isLoading: false,
    });
    renderApp('/');
    expect(await screen.findByText(/Account suspended/i)).toBeInTheDocument();
  });

  it('keeps a trainee out of the admin area', async () => {
    mocks.useSession.mockReturnValue({
      status: 'active', profile: { id: 'u1', role: 'trainee', status: 'active' }, isLoading: false,
    });
    renderApp('/admin');
    await waitFor(() => expect(screen.queryByText(/Platform Analytics/i)).not.toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/App.auth.test.jsx`
Expected: FAIL — `App` still reads `currentUser` from context

- [ ] **Step 3: Rewrite `App.jsx`**

Replace `src/App.jsx`:

```jsx
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useSession } from './hooks/useSession';
import LoginPage from './pages/auth/LoginPage';
import SignupPage from './pages/auth/SignupPage';
import PendingApprovalPage from './pages/auth/PendingApprovalPage';
import ResetPasswordPage from './pages/auth/ResetPasswordPage';
import TraineeShell from './pages/trainee/TraineeShell';
import TrainerShell from './pages/trainer/TrainerShell';
import SupervisorShell from './pages/supervisor/SupervisorShell';
import AdminShell from './pages/admin/AdminShell';
import NotificationToast from './components/shared/NotificationToast';
import ErrorBoundary from './components/shared/ErrorBoundary';

export default function App() {
  return (
    <BrowserRouter>
      <NotificationToast />
      <AppRoutes />
    </BrowserRouter>
  );
}

function AppRoutes() {
  const { status, profile } = useSession();
  const location = useLocation();

  if (status === 'loading') {
    return (
      <div role="status" className="page-body" style={{ textAlign: 'center', padding: '4rem' }}>
        Loading…
      </div>
    );
  }

  if (status === 'pending' || status === 'suspended') {
    return <PendingApprovalPage status={status} />;
  }

  const signedIn = status === 'active';
  const home = signedIn ? `/${profile.role}` : '/login';

  return (
    <ErrorBoundary key={location.pathname}>
      <Routes>
        <Route path="/login" element={signedIn ? <Navigate to={home} replace /> : <LoginPage />} />
        <Route path="/signup" element={signedIn ? <Navigate to={home} replace /> : <SignupPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/trainee/*"    element={profile?.role === 'trainee'    ? <TraineeShell />    : <Navigate to={home} replace />} />
        <Route path="/trainer/*"    element={profile?.role === 'trainer'    ? <TrainerShell />    : <Navigate to={home} replace />} />
        <Route path="/supervisor/*" element={profile?.role === 'supervisor' ? <SupervisorShell /> : <Navigate to={home} replace />} />
        <Route path="/admin/*"      element={profile?.role === 'admin'      ? <AdminShell />      : <Navigate to={home} replace />} />
        <Route path="*" element={<Navigate to={home} replace />} />
      </Routes>
    </ErrorBoundary>
  );
}
```

- [ ] **Step 4: Strip authentication from `AppContext`**

In `src/context/AppContext.jsx`:

1. Delete the `login` function entirely (both the mock branch and the Supabase branch containing `const password = 'Password123!'`).
2. Delete the `logout` function and the `fetchUserProfile` function.
3. Delete the `useEffect` that calls `supabase.auth.getSession()` and `onAuthStateChange`.
4. Delete the `import { supabase } from '../lib/supabaseClient';` line.
5. Replace the `currentUser` state with a prop-driven value: change the signature to `export function AppProvider({ children, currentUser = null })` and delete `const [currentUser, setCurrentUser] = useState(null);`.
6. Because several functions still call `setCurrentUser`, add a local shim immediately after the signature so the remaining mock behaviour keeps working during M2:

```jsx
  // Auth now lives in useSession; this local copy exists only so the
  // not-yet-migrated mock mutations (XP, badges, quiz attempts) keep working.
  const [localUser, setLocalUser] = useState(currentUser);
  useEffect(() => { setLocalUser(currentUser); }, [currentUser]);
  const setCurrentUser = setLocalUser;
```

Then rename every remaining read of `currentUser` in the file to `localUser`:

```bash
# The shim above is the only place `currentUser` may still appear as a prop.
sed -i 's/\bcurrentUser\b/localUser/g' src/context/AppContext.jsx
```

Afterwards, manually restore the two intentional occurrences: the destructured
prop `AppProvider({ children, currentUser = null })` and its use in
`useState(currentUser)` / `useEffect(..., [currentUser])`. Then export the
value under the name consumers already expect:

```jsx
      currentUser: localUser,
```

7. Remove `login` and `logout` from the context value object. Every component
   that called them must be updated: `Sidebar.jsx` calls `logout()` — change it
   to `import { signOut } from '../../api/auth'` and call `signOut()`.

Run `grep -rn "login\|logout" src/ --include=*.jsx | grep -v api/` to find any
remaining callers before moving on.

- [ ] **Step 5: Pass the session profile into the provider**

Modify `src/main.jsx` so `AppProvider` receives the profile. Add a bridging component:

```jsx
import { useSession } from './hooks/useSession'

function ProvidersWithSession({ children }) {
  const { profile } = useSession()
  return <AppProvider currentUser={profile}>{children}</AppProvider>
}
```

and use `<ProvidersWithSession><App /></ProvidersWithSession>` in place of `<AppProvider><App /></AppProvider>`.

- [ ] **Step 6: Remove the obsolete logout test**

```bash
git rm src/App.logout.test.jsx
```

It asserted behaviour of the mock `logout` that no longer exists; Task 14's routing tests cover the replacement.

- [ ] **Step 7: Run the full suite**

Run: `npm test`
Expected: PASS. Tests in `CoursePage.test.jsx` and `AppContext.bugs.test.jsx` that called `login(...)` must be updated to pass a `currentUser` prop to `AppProvider` instead. Update them as follows — in `CoursePage.test.jsx`, replace the `SignedInAs` component with a direct prop:

```jsx
import { USERS } from '../../data/dummyData';
const trainee = USERS.trainees.find((t) => t.id === 's1');

function renderAt(path) {
  return render(
    <AppProvider currentUser={trainee}>
      <MemoryRouter initialEntries={[path]}>
        <NavProbe />
        <Routes>
          <Route path="/course/:courseId" element={<CoursePage />} />
        </Routes>
      </MemoryRouter>
    </AppProvider>
  );
}
```

Apply the equivalent change in `AppContext.test.jsx` and `AppContext.bugs.test.jsx`: replace `signedInTrainee()`'s `login(...)` call with a wrapper that passes `currentUser={trainee}`.

- [ ] **Step 8: Verify the hardcoded password is gone**

Run: `grep -rn "Password123" src/`
Expected: no output.

- [ ] **Step 9: Run lint and build**

Run: `npm run lint && npm run build`
Expected: 0 errors, build succeeds

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat(web): route by session status and remove auth from AppContext"
```

---

## Task 15: Seed script and CI

**Files:**
- Create: `supabase/seed.sql`
- Create: `.github/workflows/ci.yml`
- Modify: `README.md`

**Interfaces:**
- Consumes: every migration from Tasks 2–7
- Produces: a seeded local database; CI running lint, frontend tests, and build on every push

- [ ] **Step 1: Write the seed**

Create `supabase/seed.sql`:

```sql
-- Applied automatically by `supabase db reset`.
insert into public.allowed_domains (domain) values
  ('ncspark.ca'),
  ('speedpro-logis.com')
on conflict do nothing;
```

- [ ] **Step 2: Verify the seed applies**

Run:
```bash
npx supabase db reset
npm run test:db
```
Expected: PASS (all database tests)

- [ ] **Step 3: Write the CI workflow**

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main, 'feat/**', 'fix/**']
  pull_request:
    branches: [main]

jobs:
  frontend:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: nc-spark
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: npm
          cache-dependency-path: nc-spark/package-lock.json
      - run: npm ci
      - run: npm run lint
      - run: npm test
      - run: npm run build
      - name: Fail if a known-bad credential reappears
        run: |
          if grep -rn "Password123" src/; then
            echo "Hardcoded development password found"; exit 1
          fi
```

Database tests are excluded from CI: they need a running Supabase stack. Run `npm run test:db` locally before opening a pull request.

- [ ] **Step 4: Document setup in the README**

Replace the stock Vite template `README.md` with:

````markdown
# NC Spark

Role-based learning management platform. React 19 + Vite frontend, Supabase backend.

## Setup

```bash
npm install
cp .env.local.example .env.local   # fill in your Supabase project values
npm run dev
```

## Local backend

```bash
npm run db:start     # start local Supabase (Docker required)
npm run db:reset     # apply migrations and seed
npm run test:db      # run RLS and Edge Function tests
npm run db:stop
```

Copy the anon key printed by `db:start` into `.env.local`, and into `.env.test`
along with the service-role key, for the database tests.

## Testing

| Command | Scope |
|---|---|
| `npm test` | Frontend unit and component tests |
| `npm run test:db` | RLS policies and Edge Functions (needs local Supabase) |
| `npm run lint` | oxlint |
| `npm run build` | Production build |

## Documentation

- Backend design: `docs/superpowers/specs/2026-08-21-nc-spark-backend-design.md`
- M1 plan: `docs/superpowers/plans/2026-08-21-m1-identity-and-access.md`
````

- [ ] **Step 5: Final verification**

Run:
```bash
npm run lint && npm test && npm run build && npm run test:db
```
Expected: all pass

- [ ] **Step 6: Commit**

```bash
git add supabase/seed.sql .github/workflows/ci.yml README.md
git commit -m "chore: add seed data, CI workflow and project README"
```

---

## Verification checklist

After Task 15, confirm each spec requirement:

- [ ] A trainee cannot set their own role — `privilege-escalation.test.js`
- [ ] A trainee cannot read another user's email — `profile-visibility.test.js`
- [ ] An anonymous client reads nothing — `profile-visibility.test.js`
- [ ] Client-supplied roles at signup are ignored — `provisioning.test.js`
- [ ] Allowlisted domains auto-activate; others queue — `provisioning.test.js`
- [ ] Only admins change roles, and never the last admin — `fn-admin-set-role.test.js`
- [ ] Every privileged action writes an audit entry — `fn-admin-set-role.test.js`, `fn-admin-review.test.js`
- [ ] The audit log cannot be modified by anyone — `audit-log.test.js`
- [ ] `grep -rn "Password123" src/` returns nothing
- [ ] The role picker no longer exists — `src/pages/LoginPage.jsx` deleted
- [ ] The pre-existing 56 frontend tests still pass

## Deferred to later milestones

Not in M1, by design: the JWT custom-claims hook (§3.2 — the `useSession` hook reads status from the database instead, so this is a performance optimisation deferred until query volume justifies it); an admin UI for the pending-signup queue (M2, alongside the other admin screens); and migrating the remaining `AppContext` mock state, which happens per-milestone as each subsystem lands.
