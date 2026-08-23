# Backlog

Work that has been deliberately deferred, with the reasoning. Anything here was
seen, weighed and postponed — not missed.

Last reviewed: 2026-08-23, after the admin console, the trainee record screens
and the supervisor role were wired to the server. The site is live at
`https://nc-spark.ncspark.workers.dev`.

## Next sprint

| # | Item | Why it is waiting | Cost |
|---|---|---|---|
| **B1** | **Put an access gate in front of the live site** | Anyone with the URL reaches the login page. Cloudflare Access (free tier) adds an email allowlist with no code change. Agreed to revisit next sprint rather than before review. | ~5 min, dashboard only |
| **B2** | **Delete or expire the review accounts** | Four admin-capable logins on `ncspark-review.local`, a domain nobody can receive mail at, so there is no password-reset path. Kept for now because review is ongoing. Password was rotated on 2026-08-23 after being found in the public repo. | ~1 min |

## Security, reviewed and accepted

| # | Item | Decision |
|---|---|---|
| **B3** | Scenario activities send `isCorrect` to the browser and grade client-side | Same class as the quiz leak M4 closed, materially lower severity: a scenario completes via "Mark as Complete", so correctness gates nothing. It is formative practice, and instant feedback needs the answer client-side. Reviewed and left. Revisit only if scenarios ever gate progression. |
| **B4** | The repository is public | Fine in itself — no secrets remain in tracked files, and the anon key is public by design. It stops being fine the moment anything sensitive is committed, which is what B1 and the rotation in `seed-review-users.mjs` guard against. |

## Closed

| # | Item | Outcome |
|---|---|---|
| **B5** | A supervisor cannot read `quizzes` | **Fixed** in `20260825000100_supervisor_reads.sql`, on the condition B5 set: a supervisor oversight screen now exists to need it. The migration also adds `courses_select_supervisor`, because `enrollments_select_supervisor` does not filter on course status and a supervisor could otherwise hold an enrolment on a draft course they could not name. Mutation-tested live: reverting the policy makes the title come back as "Unknown quiz". |

## Deferred milestones

| # | Item | Decision |
|---|---|---|
| **B6** | **M4b — trainer quiz authoring** | Chosen in the M4 design session: quizzes are admin/seed-only for now. `CreateQuiz` still writes to the prototype's in-memory context. Until this ships, loading real quiz content means running `npm run db:seed-quizzes`. |
| **B13** | **Module and activity authoring** | **The sharpest gap in the product.** `src/api/activities.js` has read paths only, and no api function anywhere creates a module or an activity. The admin Curriculum page can now create a course, but nothing can put content in it, and publish-course refuses a course with zero activities — so a course created through the UI can never be published. The only route to content is `npm run db:seed-catalog` or SQL. The Curriculum page shows the counts and disables Publish with the reason, so this fails honestly rather than as a mystery 422, but it is the thing standing between the admin console and a usable authoring loop. Bigger than B6 and should probably absorb it. |
| **B7** | **XP and gamification awarding** | XP has been display-only since M1 — nothing grants it. Deferred deliberately so M4 stayed about grading integrity. Badges, streaks and the leaderboard should land together with it. |
| **B8** | **M5 — realtime chat** | `CourseChatDrawer` and the course chat tab are still the prototype's in-memory implementation. Messages do not persist or reach anyone else. |

## Frontend still on prototype data

Counted 2026-08-23, after this sprint. A page is "wired" if it reads from
`src/api/` or `src/hooks/`; the rest still read `AppContext` and
`src/data/dummyData`.

| Role | Wired | Still prototype |
|---|---|---|
| Auth | 4/4 | — |
| Admin | 3/3 | — |
| Supervisor | 2/2 | — |
| Trainee | 7/8 | `QuizPreview` |
| Trainer | 3/7 | `CourseManagement`, `CreateActivity`, `CreateQuiz`, `TrainerCoursePage` |

Trainer is the only role left with prototype screens, and all four of them are
authoring — the same gap as B6 and B13. Nothing can create a module, an
activity or a quiz from the app, which is why they could not be wired in this
sprint: there is no server-side write to wire them to.

`QuizPreview` is a standalone demo of the quiz UI on canned questions. It is
reachable at `/trainee/quiz/preview` and is not part of any flow.

`SupervisorCoursePage` and `ContentReview` were deleted rather than wired.
The first was built around course chat (M5, unbuilt); the second approved
content through a workflow with no table, status or Edge Function behind it.

## Maintenance

| # | Item | Detail |
|---|---|---|
| **B9** | `framer-motion` 12.43.0 → 13.1.1 | A major version. The app uses a narrow surface — only `motion` (179 uses) and `AnimatePresence` (41), across 24 files — so the upgrade is probably small, but it needs the migration notes read and the suite run rather than a blind bump. |
| **B10** | Main bundle 632 kB / 189 kB gzip | Already code-split per role shell. What remains is React, framer-motion and supabase-js. No further easy win. |
| **B11** | 5 lint warnings, 0 errors | All in prototype code: `QuizPreview` (self-referencing callback), `AppContext` and `Confetti` (setState in effect), `main.jsx` and `AppContext` (fast-refresh exports). Cosmetic. |
| **B12** | Two intermittent test failures, never reproduced | `fn-catalog` and `provisioning` each failed once in a full run and passed alone and on re-run. Both involve live Auth or Edge Function calls, so platform transients are the likely cause. Neither is fixed; both were made to **name their own cause** next time — `callOk()` asserts a 2xx, and the `allowed_domains` fixture asserts its insert. If either recurs, the message will say what actually broke. |

## Operational notes

- `npm run test:db` deletes every user except those on `ncspark-review.local`,
  and every course. Restoring the review environment takes three commands:
  `db:seed-catalog`, `db:seed-quizzes`, `db:seed-review`.
- `ALLOWED_ORIGINS` currently lists the live Worker URL plus the Vite dev and
  preview ports. Any new deployment origin must be added, or the browser blocks
  every Edge Function call.
