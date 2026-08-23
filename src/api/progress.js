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
