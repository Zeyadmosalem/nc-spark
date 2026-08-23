import { requireClient } from './client';
import { unwrap, invokeFn } from './helpers';

// Postgres numerics arrive as strings. Number(null) is 0, which would turn an
// ungraded attempt into a zero score, so null has to survive the conversion.
const num = (v) => (v === null || v === undefined ? null : Number(v));

export function attemptToCamel(row) {
  if (!row) return null;
  return {
    id: row.id,
    quizId: row.quiz_id,
    attemptNo: row.attempt_no,
    status: row.status,
    startedAt: row.started_at,
    submittedAt: row.submitted_at ?? null,
    autoScore: num(row.auto_score),
    finalScore: num(row.final_score),
    passed: row.passed ?? null,
  };
}

/** The quiz attached to a quiz activity, or null if none has been authored. */
export async function quizForActivity(activityId) {
  const row = unwrap(await requireClient()
    .from('quizzes')
    .select('id, title, pass_mark, time_limit_seconds')
    .eq('activity_id', activityId)
    .maybeSingle());
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    passMark: Number(row.pass_mark),
    timeLimitSeconds: row.time_limit_seconds,
  };
}

/** The caller's most recent attempt at a quiz, or null before the first. */
export async function myAttempt(quizId) {
  return attemptToCamel(unwrap(await requireClient()
    .from('quiz_attempts')
    .select('id, quiz_id, attempt_no, status, started_at, submitted_at, auto_score, final_score, passed')
    .eq('quiz_id', quizId)
    .order('attempt_no', { ascending: false })
    .limit(1)
    .maybeSingle()));
}

/**
 * Opens or resumes an attempt. The questions come back without answers: the
 * key lives in a table no browser role can read, and the function never
 * selects it.
 */
export const startQuiz = (quizId) => invokeFn('start-quiz', { quizId });

/** Grading happens server-side; the result carries no correct answers. */
export const submitQuiz = (attemptId, answers = []) =>
  invokeFn('submit-quiz', { attemptId, answers });
