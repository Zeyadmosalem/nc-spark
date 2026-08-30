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

**On a Worker, put these under Build variables, not runtime variables.** The
dashboard has two places called "Variables and Secrets":

| Location | Applies |
|---|---|
| Settings → Variables and Secrets | at **runtime**, to the Worker script |
| Settings → Build → Build variables | during **`npm run build`** ← the one Vite needs |

Vite compiles `VITE_*` values into the JavaScript while building, so a runtime
variable arrives long after the bundle is finished. Getting this wrong produces
a site that deploys cleanly and then cannot reach Supabase at all. Check by
fetching the built bundle and grepping for the project URL:

```bash
curl -s https://<your-url>/assets/index-*.js | grep -c 'supabase.co'
```

`0` means the variables did not reach the build.

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

There is a second thing to tell it, and this one fails silently rather than
loudly. Supabase builds every link it mails — password reset, address
confirmation — from `site_url`, and honours a redirect the app asks for only
if it matches `site_url` or `uri_allow_list`. Both ship as the Supabase
default, which is `http://localhost:3000` and nothing:

```bash
node scripts/harden-auth.mjs show     # what the project has now
node scripts/harden-auth.mjs apply    # set them, keeping a snapshot to revert to
```

Change the `SITE` constant in that script when the deployment moves. Leave it
and the app still works perfectly, right up until somebody forgets a password
— the mail arrives and its link points at a machine that is not theirs.

## Optional: no-billing per-user access gate

Cloudflare Zero Trust may request a payment method even on its free plan. This
repository also contains a custom Worker gateway for that case. It validates
each user's existing Supabase email/password and serves the built site only
after authentication. The session is held in an `HttpOnly`, `Secure` cookie;
passwords are sent only to Supabase Auth and are never stored by the Worker.

Deploy it from the repository root after setting the two Worker secrets:

```bash
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_ANON_KEY
npm run build:worker
```

The Worker name is `nc-spark-gate`, so use its `*.workers.dev` hostname or
attach your own hostname. Do not put either secret in `worker/` or
`wrangler.jsonc`. This gate protects the built HTML, JavaScript, CSS and
assets from unauthenticated visitors, but an authenticated browser can still
inspect its downloaded frontend code. The app's normal Supabase sign-in still
establishes its own client session after the gateway login.

## 5. Sign in

`npm run db:seed-review` creates one account per role:

| Role | Email |
|---|---|
| admin | `admin@ncspark-review.local` |
| trainer | `trainer@ncspark-review.local` |
| supervisor | `supervisor@ncspark-review.local` |
| trainee | `trainee@ncspark-review.local` |

The script generates the password and prints it **once**. It is deliberately
not written down here: this file is in a public repository, and a password
committed beside the account names and the live URL is the whole break.

Set your own instead if you prefer:

```bash
REVIEW_PASSWORD='...' npm run db:seed-review
```

Delete these accounts once the review is over — they are admin-capable logins
on a domain nobody can receive mail at, so there is no password-reset path.

## Notes

- **Do not add a `_redirects` file with `/* /index.html 200`.** Cloudflare
  rejects it at deploy time — *"Infinite loop detected in this rule"* — because
  Pages already serves `index.html` for any path that does not match a static
  file, provided the build output has no top-level `404.html`. That default is
  what makes a refresh on `/trainee/courses` work. Adding the rule by hand
  fails the deployment; this project learned that the hard way.
- `npm run test:db` **deletes every user except the review accounts**, and all
  courses. Re-run `npm run db:seed-catalog`, `db:seed-quizzes` and
  `db:seed-review` afterwards to restore the review environment.
- Preview deployments get their own `*.pages.dev` subdomain, which will not be
  in `ALLOWED_ORIGINS`. Add them explicitly if you want previews to work
  against the live backend.
