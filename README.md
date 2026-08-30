# NC Spark

Role-based learning management platform. React 19 + Vite frontend, Supabase backend.

Four role portals (trainee, trainer, supervisor, admin), six activity types,
quizzes with a second-attempt approval workflow, course chat, and gamification.

## Quick start

```bash
npm install
npm run dev
```

The app needs Supabase credentials in `.env.local` to sign in. Either point it
at a hosted project (copy `.env.local.example`) or run the local stack below.

## Local backend

Requires Docker Desktop and WSL2. If you do not have them:

```powershell
# In an ELEVATED PowerShell (Run as administrator).
# Run it, reboot, then run it again — it detects which stage is needed.
npm run db:setup
```

Once Docker Desktop is running:

```bash
npm run db:start   # start Postgres, Auth, Storage, Realtime (first run pulls ~2 GB)
npm run db:env     # write .env.test.local and .env.local from the running stack
npm run db:reset   # apply all migrations and seed data
npm run test:db    # RLS and Edge Function tests
npm run db:stop
```

`npm run db:env` points both the dev server and the test suite at local.
Delete `.env.test.local` to switch the tests back to the hosted project.

### Working against a hosted project instead

Copy `.env.test.example` to `.env.test` and fill in the six values. Apply
migrations with:

```bash
npx supabase db push --db-url "$(grep '^SUPABASE_DB_URL=' .env.test | cut -d= -f2-)"
```

Use the **session pooler on port 5432**, not transaction mode on 6543 — the
migrations contain DDL that transaction pooling cannot run. Direct database
hosts (`db.<ref>.supabase.co`) are IPv6-only and unreachable on many networks.

Deploy Edge Functions without Docker using `npx supabase functions deploy <name> --use-api`.

### `ALLOWED_ORIGINS`

Edge Functions read a comma-separated allowlist of browser origins:

```bash
npx supabase secrets set ALLOWED_ORIGINS="https://your-app.example.com" --project-ref <ref>
```

It holds the deployed origin plus the Vite dev and preview ports. **Any new
origin has to be added here before the frontend is served from it, or the
browser blocks every function call.** That failure is loud and immediate, which
is the intended trade.

Unset, it does **not** fall back to `*`: `corsFor()` returns no
`Access-Control-Allow-Origin` at all and every cross-origin call fails closed.
An earlier version of this file claimed the opposite.

## Testing

| Command | Scope |
|---|---|
| `npm test` | Frontend unit and component tests |
| `npm run test:db` | RLS policies and Edge Functions |
| `npm run verify:m3` | Live end-to-end check of the learning loop |
| `npm run verify:m4` | Live check of assessment integrity, including a grep of the built bundle |
| `npm run verify:gate` | Live check of the access gate on a deployment |
| `npm run lint` | oxlint |
| `npm run build` | Production build |

Database tests include **red-team suites** asserting that a trainee cannot
promote itself, read another user's email, enumerate the user table, or award
itself XP. Treat a failure there as a security regression, not a flaky test.

### Reading a coverage number here

Coverage has to be counted across **both** suites or it lies. `src/api` is
barely touched by the frontend run and thoroughly exercised by the live one —
`library.js` reads 2% in the first and 98% in the second — because they run
under different vitest configs and neither sees the other's report. Counted as
"either suite reaches it", the app is at 90.8% of statements; the frontend
suite alone reads 86.7%.

```bash
npx vitest run --project app --coverage.enabled --coverage.include='src/**'
npx vitest run --config vitest.db.config.js --coverage.enabled --coverage.include='src/**'
```

Two helpers exist so a new test does not start by rebuilding them:
`src/test/queryHarness.jsx` wraps a hook in a React Query client (per render,
with retries off), and `src/test/supabaseStub.js` stands in for the PostgREST
builder and records the calls — so a test can assert the *filter* as well as
the result, which is what matters wherever RLS decides the rows.

`supabase/tests/admin-console.test.js` is the odd one out: instead of
reimplementing the queries it checks, it imports `src/api/` and runs the code
the browser runs against the live project. That is the only way to catch a
wrong PostgREST embed name — `profiles!teaching_requests_trainer_id_fkey(...)`
is a string, and the frontend unit tests mock `from`, so they pass whatever is
written there while the browser gets a 400.

## Deferred work

[docs/BACKLOG.md](docs/BACKLOG.md) lists everything postponed on purpose, with
the reasoning — including the access gate for the live site and the accepted
client-side grading in scenario activities.

## Architecture notes

- **The live site sits behind an access gate**: a Cloudflare Worker
  (`worker/index.js`) that checks both a valid Supabase session and the
  profile's `status` before serving a single asset, throttles sign-in
  attempts, and sets the site's security headers (CSP, HSTS, frame-ancestors,
  referrer policy). Checking the session alone would not gate anything —
  Supabase Auth is a different origin the Worker never sees.
- **Authentication** is Supabase Auth. Profiles are created by a database
  trigger that ignores any client-supplied role, so a role cannot be
  self-assigned at signup.
- **Privilege escalation** is blocked by three independent layers: column-level
  grants, an RLS `WITH CHECK`, and a `BEFORE UPDATE` trigger.
- **Public signup is closed.** Accounts are created by an administrator; the
  endpoint returns `422 signup_disabled`. Supabase Auth sits outside the access
  gate, so while it was open anyone holding the public anon key could write
  rows into `auth.users`, `profiles` and `trainee_stats`. The domain allowlist
  and the pending queue still govern every account the trigger sees, and email
  confirmation is now required — the trigger activates an allowlisted domain,
  which is only safe if the address has been proved.
- `src/api/` is the only place Supabase is touched and the only place
  `snake_case` becomes `camelCase`.
- `src/components/ui/` is the only place a pill, alert, skeleton, empty state,
  stat card or toast is defined. See the design-system notes in
  [docs/BACKLOG.md](docs/BACKLOG.md) for which to reach for.
- **Privileged writes never touch a table.** Role changes, suspensions, signup
  decisions, publishing and trainer assignment all go through Edge Functions so
  they are validated and audited. `courses.trainer_id` and `courses.status` are
  excluded from the column-level UPDATE grant, which is what makes that
  structural rather than a convention.

### Gotchas worth knowing

- `citext` cannot be used inside a function pinned to `SET search_path = ''` —
  the type lives in the `extensions` schema. Store lowercase `text` instead.
- An `UPDATE ... WHERE` applies **SELECT** policies to its row scan, so a table
  needs a SELECT policy before self-service updates work. The failure is
  silent: HTTP 200, zero rows, no error.
- A `WITH CHECK` subquery over the same table is itself RLS-filtered and
  returns NULL. Use a `SECURITY DEFINER` helper.

## Documentation

- Backend design: `docs/superpowers/specs/2026-08-21-nc-spark-backend-design.md`
- M1 plan and progress: `docs/superpowers/plans/2026-08-21-m1-identity-and-access.md`
