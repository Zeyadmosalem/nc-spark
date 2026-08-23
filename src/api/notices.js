import { requireClient } from './client';
import { unwrap } from './helpers';

const num = (v) => (v === null || v === undefined ? null : Number(v));

// A week is long enough that a trainee who was away over a weekend still sees
// their result, short enough that the banner does not become a permanent
// history list nobody reads.
const RECENT_DAYS = 7;

const describeQuiz = (row) => ({
  quizId: row.quizzes?.id,
  quizTitle: row.quizzes?.title ?? 'a quiz',
  courseTitle: row.quizzes?.courses?.title ?? '',
});

/**
 * What has changed for the signed-in trainee since they last looked.
 *
 * Derived from the tables that already hold the facts rather than from a
 * notifications table: an attempt's status IS the notification, and a stored
 * copy could disagree with it. Nothing here needs a write, so no Edge Function
 * has to remember to fire one.
 */
export async function myNotices() {
  const client = requireClient();

  // RLS already restricts both reads to the caller's own rows.
  const [attempts, grants] = await Promise.all([
    unwrap(await client
      .from('quiz_attempts')
      .select(`
        id, status, submitted_at, graded_at, passed, final_score,
        quizzes(id, title, courses(title))
      `)
      .in('status', ['pending_review', 'passed', 'failed'])
      .order('submitted_at', { ascending: false })
      .limit(20)),
    unwrap(await client
      .from('quiz_retake_grants')
      .select('id, reason, quizzes(id, title, courses(title))')
      .is('consumed_at', null)),
  ]);

  const cutoff = Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000;

  const awaitingReview = (attempts ?? [])
    .filter((a) => a.status === 'pending_review')
    .map((a) => ({ attemptId: a.id, ...describeQuiz(a), submittedAt: a.submitted_at }));

  // Only a trainer-marked result counts as news. An auto-graded quiz showed
  // its score the moment it was submitted, so repeating it here would be
  // telling the trainee something they already saw.
  const recentlyGraded = (attempts ?? [])
    .filter((a) => a.graded_at && new Date(a.graded_at).getTime() >= cutoff
      && a.status !== 'pending_review')
    .map((a) => ({
      attemptId: a.id, ...describeQuiz(a),
      passed: a.passed, score: num(a.final_score), gradedAt: a.graded_at,
    }));

  const retakesReady = (grants ?? []).map((g) => ({
    grantId: g.id, ...describeQuiz(g), reason: g.reason ?? null,
  }));

  return {
    awaitingReview,
    retakesReady,
    recentlyGraded,
    total: awaitingReview.length + retakesReady.length + recentlyGraded.length,
  };
}
