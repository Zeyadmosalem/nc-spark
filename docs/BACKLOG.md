# Backlog

Work that has been deliberately deferred, with the reasoning. Anything here was
seen, weighed and postponed — not missed.

Last reviewed: 2026-08-30, after the security audit and the live test-suite
work. Nothing in the running app reads invented data. The site is live at
`https://nc-spark-gate.ncspark.workers.dev` — the older
`nc-spark.ncspark.workers.dev` in this file was dead and returned 404.

## Next sprint

| # | Item | Why it is waiting | Cost |
|---|---|---|---|
| **B2** | **Delete or expire the review accounts** | Four admin-capable logins on `ncspark-review.local`, a domain nobody can receive mail at, so there is no password-reset path. Kept for now because review is ongoing. Password was rotated on 2026-08-23 after being found in the public repo. | ~1 min |

## Done since this list was written

| # | Item | Outcome |
|---|---|---|
| **B1** | Access gate in front of the live site | **Built**, not as predicted. The entry assumed Cloudflare Access, "~5 min, dashboard only"; that would have gated the URL but not the app, because Supabase Auth is a different origin the gate never sees — anyone with the public anon key could mint a token. `worker/index.js` therefore checks the session AND the profile's `status`, caches and de-duplicates the decision so one page load costs one round trip rather than ten, throttles sign-in, and carries the site's security headers. 48 tests. |
| **B6** | Quiz question authoring | **Closed.** `QuizEditor` is mounted inside `CourseBuilder`, and every write goes through the `author-quiz` Edge Function — `quiz_answer_keys` still has no grant for `authenticated`, so the key never passes through a browser. The condition B6 set is met rather than worked around. |
| **B14** | Editors for flashcards, matching and scenario | **Closed.** `StructuredEditors.jsx` supplies all three, so all 7 activity types now have a real editor and none needs raw JSON. |
| **B7** | XP and gamification awarding | **Closed.** `xp_events` is an append-only ledger; a trigger maintains `trainee_stats.xp`, the streak and `last_active_on`, and badges are evaluated from the ledger so a badge cannot disagree with the record it came from. Seven badges and a per-course leaderboard. |
| **B8** | M5 — realtime chat | **Closed.** `messages` with RLS scoped to course membership, Realtime, pagination, and one chat surface shared by all four roles. Built as B8 specified, not restored from the prototype. |
| **B9** | framer-motion 12 -> 13 | **Closed.** v13's only breaking change is the removal of the optional @emotion/is-prop-valid dependency, which this app never had — the single MotionConfig passes reducedMotion and nothing else. v13 also fixes AnimatePresence under React 19 strict mode, which is the mode this app runs in. Verified in a browser as well as the suite: cards mount and settle at opacity 1 rather than sticking at their initial state. |
| **B19** | Fixture writes that could not fail | **Closed.** must() and mustWrite() in helpers.js; 147 bare writes now assert. It found one immediately: schema-profiles had been inserting a profile and a trainee_stats row that handle_new_user already creates, so both had failed on duplicate key every run since the trigger landed, silently, while the tests passed on the trigger's work. |
| **B20** | Five components over 400 lines | **Closed.** Every one split, verbatim, with only imports rewritten: UserManager 495->275, ContentManager 463->171, SupportInbox 466->192, CourseBuilder 566->163, QuizEditor 533->82. Nothing in the app is over 400 lines now; the largest is CoursePage at 351. |
| **B21** | Inline style props | **Closed.** 292 -> 201. Two passes, and the second found what the count was hiding: the screens had grown a SECOND type scale. 23 distinct font sizes written inline — 0.7, 0.72, 0.78, 0.8, 0.82, 0.85 among them — where the scale has `--text-xs` 0.75 and `--text-sm` 0.8125. Six sizes doing the work of two, none of them the documented ones. Each is snapped to the nearest token only where the move is under 0.05rem, under a pixel; 1.4rem is left inline because moving it to 1.5 is a design decision rather than drift. The first pass had already replaced the 46 hardcoded status colours, which never changed with the theme at all. Verified by screenshotting the screens that actually changed, before and after via git stash: six of eight byte-identical, two differing by under 1% from antialiasing. Of the 201 left, 31 are computed from data and belong inline. |
| **B22** | Code coverage | **Closed at 91%.** The 74% it was filed at measured one suite and called it the whole picture: `src/api` is exercised against the real database by the live suite, under a config the frontend coverage run never sees — `library.js` reads 2% in one and 98% in the other. Counted as "either suite reaches it", the honest starting point was 81.8%; it is 90.8% now, and the frontend suite alone went 74% -> 86.7% (lines 88.6%). Every hook has a test; so does every api module. What remains is thin and spread — defensive branches, and `main.jsx`, which is the bootstrap and has nothing to assert. |

## Security, reviewed and accepted

| # | Item | Decision |
|---|---|---|
| **B3** | Scenario activities send `isCorrect` to the browser and grade client-side | Same class as the quiz leak M4 closed, materially lower severity: a scenario completes via "Mark as Complete", so correctness gates nothing. It is formative practice, and instant feedback needs the answer client-side. Reviewed and left. Revisit only if scenarios ever gate progression. |
| **B4** | The repository is public | Fine in itself — no secrets remain in tracked files, and the anon key is public by design. It stops being fine the moment anything sensitive is committed, which is what B1 and the rotation in `seed-review-users.mjs` guard against. |

## Closed

| # | Item | Outcome |
|---|---|---|
| **B15** | Trainer authoring screens | **Closed.** The four prototype trainer pages are gone. `/trainer/courses` lists a trainer's own courses and the unassigned ones they can ask to teach; `/trainer/courses/:id` mounts the same `CourseBuilder` the admin console uses, because `modules_write` and `activities_write` authorise the owning trainer identically and a second implementation would only be a second thing to keep in step. The teaching-request loop is now closed end to end and tested live: a trainer asks, an admin approves, `trainer_id` is set. |
| **B18** | The domain allowlist had no UI | **Closed.** `allowed_domains` decides who skips administrator approval, and it has RLS on with no policy — even an admin's browser cannot read it, so onboarding an organisation meant somebody running SQL. Now behind `admin-allowed-domains`, which is deliberately the only door: one audited function beats a policy letting any admin's browser write the table. Every table in the schema now has a consumer. |
| **B17** | Course materials had no UI | **Closed.** The trainee Materials tab was a hardcoded "nothing uploaded yet" that could never say anything else, while `course_materials`, its RLS, the private bucket, four storage policies and `uploadCourseMaterial` had all existed since M3 unread. The fourth capability found built, tested and uncalled. |
| **B11** | 5 lint warnings | **Closed.** Zero warnings. All five lived in `AppContext`, `Confetti`, `QuizPreview` and the `main.jsx` wrapper that fed the prototype store — every one deleted rather than suppressed. |
| **B16** | Retire `AppContext` | **Closed.** `src/context/AppContext.jsx` and `src/data/dummyData.js` are deleted. Theme moved to `ThemeProvider` (same `nc_theme` key, so an existing preference survives; first visit now follows `prefers-color-scheme`). The sidebar reads identity from `useSession`, which is the row RLS authorises against, rather than a copy kept in sync by hand. |
| **B13** | Module and activity authoring | **Closed.** `src/pages/admin/CourseBuilder.jsx` at `/admin/content/:courseId`. No migration was needed: `modules_write` and `activities_write` have been `for all` policies covering an admin or the owning trainer since M2, with full grants — the database was ready and nothing called it. A live test now creates a course, adds an activity and publishes it, which is a loop that had never once closed. |
| **B5** | A supervisor cannot read `quizzes` | **Fixed** in `20260825000100_supervisor_reads.sql`, on the condition B5 set: a supervisor oversight screen now exists to need it. The migration also adds `courses_select_supervisor`, because `enrollments_select_supervisor` does not filter on course status and a supervisor could otherwise hold an enrolment on a draft course they could not name. Mutation-tested live: reverting the policy makes the title come back as "Unknown quiz". |

## Design system

`src/components/ui/` and `src/styles/ui.css`. Every status pill, alert,
skeleton, empty state, stat card and toast in the app comes from one place.
Before this there were four Alerts, four StatusPills and three stat cards, all
inline-styled and all slightly different from each other.

Rules worth keeping:

- **Errors are Alerts, next to the control.** They carry an assertive live
  region and must not time out. Successes are toasts, because the result is
  usually off-screen.
- **Loading is a skeleton with a hidden live label.** A shimmer says nothing to
  a screen reader; the label says the same sentence the old plain text did.
- **An empty list gets an EmptyState.** A blank space cannot be told apart from
  a failed request, which is the whole reason `QueryError` exists.
- **A dash is not a zero.** `StatCard` renders what it is given, so "not
  measured yet" stays distinct from "measured, and it is nothing".

`src/styles/utilities.css` is the one generic layer, and the exception that
needs a reason. Everything else here is a named component class, which is the
right default and stays the right default. It exists because counting the
inline styles one DECLARATION at a time — rather than one style object at a
time — showed they were not one-offs at all: `display: flex` alone appeared 50
times, and six ad-hoc font sizes were clustered where the type scale has two.
It is loaded last, it holds nothing that is not already a token, and a value
further than 0.05rem from a token is deliberately left inline rather than
nudged onto the scale.

Accessibility invariants now under test: a `<main>` landmark and skip link on
every portal, `document.title` per page, focus moved to content on navigation,
`prefers-reduced-motion` honoured in both CSS and framer-motion, no
`display: none` on anything a screen reader needs, and — since the audit — a
matching activity that can be completed from the keyboard, which it could not
be when both its columns were `<div onClick>`.

## Frontend

Every routed screen reads the server. `src/data/dummyData.js` no longer exists,
and neither does anything that could only be built on it.

Counting the routes each shell serves, redirects excluded:

| Role | Screens |
|---|---|
| Auth | 4 |
| Trainee | 12 |
| Trainer | 7 |
| Admin | 7 |
| Supervisor | 3 |

Deleted rather than wired, each being a UI for something that had no
server-side model **at the time**: `ContentReview` (content approval still has
no table or status), `SupervisorCoursePage`, `TrainerCatalog` (duplicated
`/trainer/courses` on invented data, down to rendering raw trainer ids as
"Current Instructor"), the four trainer authoring forms (replaced by the shared
`CourseBuilder`), `NotificationToast` and `Confetti`, `QuizPreview`,
`TraineeQuizzesPage` and `VideosPage` (demo pages behind redirects), and
`src/data/schema.sql` — an 82-line schema sketch nothing referenced, sitting
beside the migrations that disagreed with it.

Three of those were about features that have since been **built rather than
restored**: course chat (B8), and `GamificationWidgets` / `LearningPathMap`
(B7). Deleting them first was the point — what shipped is backed by
`messages`, `xp_events` and `trainee_badges`, not by a UI kept alive in hope
of a backend.

`JourneyMap` went the same way later, for a different reason: it was simply
unreachable — nothing had imported it since the prototype, so it was deleted
rather than given tests it could never justify.

## Maintenance

| # | Item | Detail |
|---|---|---|
| **B10** | Main bundle 632 kB / 189 kB gzip | Already code-split per role shell. What remains is React, framer-motion and supabase-js. No further easy win. |

| **B12** | Two intermittent test failures — cause class found and handled | `fn-catalog` and `provisioning` each failed once in a full run and passed alone and on re-run. Neither was ever reproduced *individually*, and that is still true. What was reproduced is the class they belong to. **The suite ran its files in a different order every time** — vitest sequences slowest-first from the previous run's cached durations — so no full run repeated the conditions of the last one; it now runs in a fixed order. **A transport blip killed a whole `beforeAll`**: `AuthRetryableFetchError: fetch failed` was caught doing exactly that to `rls-quizzes`, skipping 30 tests. B12's stated likely cause was "platform transients on live Auth or Edge Function calls", and both of those paths now retry the transport only — `retryTransport` for auth, `callFunction` for Edge Functions, which also replaced six hand-rolled copies that never retried. A status is never retried, because a 5xx is the function's own answer. Covered by `harness.test.js`. |

## Operational notes

- `npm run test:db` deletes every user except those on `ncspark-review.local`,
  and every course. Restoring the review environment takes three commands:
  `db:seed-catalog`, `db:seed-quizzes`, `db:seed-review`.
- `ALLOWED_ORIGINS` currently lists the live Worker URL plus the Vite dev and
  preview ports. Any new deployment origin must be added, or the browser blocks
  every Edge Function call.
