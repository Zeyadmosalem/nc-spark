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

## Testing

| Command | Scope |
|---|---|
| `npm test` | Frontend unit and component tests |
| `npm run test:db` | RLS policies and Edge Functions |
| `npm run lint` | oxlint |
| `npm run build` | Production build |

Database tests include **red-team suites** asserting that a trainee cannot
promote itself, read another user's email, enumerate the user table, or award
itself XP. Treat a failure there as a security regression, not a flaky test.

## Architecture notes

- **Authentication** is Supabase Auth. Profiles are created by a database
  trigger that ignores any client-supplied role, so a role cannot be
  self-assigned at signup.
- **Privilege escalation** is blocked by three independent layers: column-level
  grants, an RLS `WITH CHECK`, and a `BEFORE UPDATE` trigger.
- **Signup** auto-activates allowlisted email domains; everything else is
  queued for admin approval.
- `src/api/` is the only place Supabase is touched and the only place
  `snake_case` becomes `camelCase`.

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
