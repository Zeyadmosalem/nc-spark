import { requireClient } from './client';
import { unwrap, currentUserId } from './helpers';

/**
 * What a trainee has actually done.
 *
 * This is the honest replacement for the prototype's XP, streaks and rank.
 * Nothing awards XP yet (backlog B7), but completions and quiz results are
 * real and have been since M3 and M4 — they were simply never read.
 */

const num = (v) => (v === null || v === undefined ? null : Number(v));

/**
 * Every quiz the caller has finished, newest first.
 *
 * Scoped to the caller explicitly rather than leaning on quiz_attempts_select,
 * which also matches admins and trainers. A function called `myAttempts` that
 * silently returns the whole cohort for an admin is a trap.
 */
export async function myQuizResults() {
  const rows = unwrap(await requireClient()
    .from('quiz_attempts')
    .select(`
      id, quiz_id, attempt_no, status, submitted_at, auto_score, final_score, passed,
      quizzes(id, title, pass_mark, courses(id, title))
    `)
    .eq('trainee_id', await currentUserId())
    .not('submitted_at', 'is', null)
    .order('submitted_at', { ascending: false }));

  return (rows ?? []).map((r) => ({
    id: r.id,
    quizId: r.quiz_id,
    quizTitle: r.quizzes?.title ?? 'Untitled quiz',
    courseTitle: r.quizzes?.courses?.title ?? '',
    attemptNo: r.attempt_no,
    status: r.status,
    submittedAt: r.submitted_at,
    // final_score is null until a paragraph is marked; auto_score is what
    // exists in the meantime. Neither is coerced to 0 — "not scored yet" and
    // "scored zero" are different things to show a trainee.
    score: num(r.final_score) ?? num(r.auto_score),
    passed: r.passed,
  }));
}

/**
 * How many activities the caller has completed, across the enrolments given.
 *
 * Takes the ids rather than reading every completion row, so the count is
 * scoped by something visible in the caller's own code instead of by whichever
 * policy happens to apply. Returns 0 for an empty list without a round trip.
 */
export async function completedActivityCount(enrollmentIds = []) {
  if (enrollmentIds.length === 0) return 0;
  const { count, error } = await requireClient()
    .from('activity_completions')
    .select('id', { count: 'exact', head: true })
    .in('enrollment_id', enrollmentIds);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/**
 * Which activities the caller has finished on one enrolment.
 *
 * A Set, because every use is a membership test. activity_completions_select
 * matches app.owns_enrollment, so passing somebody else's enrolment id returns
 * nothing rather than their progress.
 */
export async function myCompletions(enrollmentId) {
  if (!enrollmentId) return new Set();
  const rows = unwrap(await requireClient()
    .from('activity_completions')
    .select('activity_id')
    .eq('enrollment_id', enrollmentId));
  return new Set((rows ?? []).map((r) => r.activity_id));
}

/**
 * Which modules are open, mirroring app.is_module_unlocked.
 *
 * The SQL is the authority — complete-activity refuses a locked activity
 * server-side, and always will. This exists so a trainee can SEE the lock
 * instead of discovering it by clicking into an activity and being turned
 * away. supabase/tests/trainee-progress.test.js checks the two agree against
 * is_module_unlocked_probe for a real enrolment, so drift is a failing test
 * rather than a trainee stuck on a course.
 *
 * Deriving it here rather than calling the probe once per module keeps the
 * page to one round trip. The rule, verbatim from the migration: a module is
 * unlocked when it has no prerequisite, or when every activity in its
 * prerequisite has a completion for this enrolment. A prerequisite with no
 * activities counts as satisfied — `not exists` over no rows is true — rather
 * than locking the course permanently.
 */
export function moduleLockState(modules = [], completed = new Set()) {
  const byId = new Map(modules.map((m) => [m.id, m]));

  return new Map(modules.map((m) => {
    if (!m.unlockAfterModuleId) return [m.id, { unlocked: true, blockedBy: null }];

    const prerequisite = byId.get(m.unlockAfterModuleId);
    // A gate pointing at a module that is not in this course cannot be
    // evaluated, and the migration says callers must treat NULL as locked.
    if (!prerequisite) return [m.id, { unlocked: false, blockedBy: null }];

    const remaining = (prerequisite.activities ?? [])
      .filter((a) => !completed.has(a.id)).length;

    return [m.id, {
      unlocked: remaining === 0,
      blockedBy: remaining === 0 ? null : { module: prerequisite, remaining },
    }];
  }));
}
