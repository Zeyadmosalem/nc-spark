# Deploying NC Spark

The app is a static Vite build talking to Supabase. Any static host works;
these steps use **Cloudflare Pages**, whose free tier permits commercial use.

> Vercel's free Hobby tier is for non-commercial projects. NC Spark is a
> company training product, so it does not qualify. Netlify and Cloudflare
> Pages both allow commercial use on their free tiers.

## 1. Connect the repository

1. Sign in at <https://dash.cloudflare.com> → **Workers & Pages** → **Create**
   → **Pages** → **Connect to Git**
2. Authorise GitHub and pick `Zeyadmosalem/nc-spark`
3. Project name: **`nc-spark`** — this decides the URL, `nc-spark.pages.dev`

## 2. Build settings

| Field | Value |
|---|---|
| Framework preset | None (or Vite) |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory | **leave blank** |

**Leave Root directory blank.** `package.json` is at the repository root — the
repo *is* the app, despite the folder on disk being called `nc-spark`. Setting
Root directory to `nc-spark` makes Cloudflare look for `nc-spark/package.json`
inside the repo and fail with:

```
npm error code ENOENT
npm error path /opt/buildhome/repo/nc-spark/package.json
```

Verified by cloning the repo fresh and running `npm ci && npm run build` at the
root: it produces `dist/` with `_redirects`, which is exactly what Cloudflare
does.

## 3. Environment variables

Add both under **Settings → Environment variables → Production**:

| Name | Where to find it |
|---|---|
| `VITE_SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase → Project Settings → API → the **publishable** key |

Use the publishable/anon key, never the secret one. `VITE_` variables are
compiled into the JavaScript that every visitor downloads; the anon key is
designed for that, and RLS is what actually protects the data. The secret key
would hand every visitor full database access.

Without these the app builds fine and then shows a configuration error at
runtime rather than a blank screen — that is deliberate.

## 4. Deploy, then tell the backend about it

Cloudflare gives you `https://nc-spark.pages.dev`. The Edge Functions only
answer browsers from an allow-listed origin, so add it:

```bash
npx supabase secrets set \
  ALLOWED_ORIGINS="https://nc-spark.pages.dev,http://localhost:5173" \
  --project-ref hwlsbcgvxozxsjmojgxe
```

Then redeploy the functions so they pick it up:

```bash
for fn in admin-review-signup admin-set-role admin-suspend-user \
          approve-enrollment approve-teaching-request complete-activity \
          publish-course start-quiz submit-quiz grade-paragraph grant-retake; do
  npx supabase functions deploy "$fn" --project-ref hwlsbcgvxozxsjmojgxe --use-api
done
```

**Skipping this breaks every button that calls a function** — enrolling,
completing an activity, submitting a quiz — with a CORS error in the console
and no visible error in the UI.

## 5. Sign in

`npm run db:seed-review` creates one account per role:

| Role | Email |
|---|---|
| admin | `admin@ncspark-review.local` |
| trainer | `trainer@ncspark-review.local` |
| supervisor | `supervisor@ncspark-review.local` |
| trainee | `trainee@ncspark-review.local` |

Password for all four: `ReviewMe-2026!`

These are **review credentials on a shared project**. Change the password in
the script, or delete the accounts, before anyone outside the team has the URL.

## Notes

- `public/_redirects` sends every path to `index.html`. Without it, refreshing
  on `/trainee/courses` returns 404, because the router runs in the browser and
  the host has no such file.
- `npm run test:db` **deletes every user except the review accounts**, and all
  courses. Re-run `npm run db:seed-catalog`, `db:seed-quizzes` and
  `db:seed-review` afterwards to restore the review environment.
- Preview deployments get their own `*.pages.dev` subdomain, which will not be
  in `ALLOWED_ORIGINS`. Add them explicitly if you want previews to work
  against the live backend.
