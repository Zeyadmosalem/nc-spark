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

const QUIZ_COLUMNS = 'id, title, pass_mark, time_limit_seconds';

const quizToCamel = (row) => (row ? {
  id: row.id,
  title: row.title,
  passMark: Number(row.pass_mark),
  timeLimitSeconds: row.time_limit_seconds,
} : null);

/** A quiz by id, for the standalone quiz route. */
export async function getQuiz(quizId) {
  return quizToCamel(unwrap(await requireClient()
    .from('quizzes').select(QUIZ_COLUMNS).eq('id', quizId).maybeSingle()));
}

/** The quiz attached to a quiz activity, or null if none has been authored. */
export async function quizForActivity(activityId) {
  return quizToCamel(unwrap(await requireClient()
    .from('quizzes').select(QUIZ_COLUMNS).eq('activity_id', activityId).maybeSingle()));
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

/* --------------------------------------------------------------- authoring */

/**
 * Writing quizzes goes through one Edge Function, `author-quiz`.
 *
 * Not because a policy would be awkward, but because quiz_answer_keys has no
 * grant for `authenticated` at all — deliberately, so that "a trainee can
 * never read the answers" is a property of the grant table rather than of
 * every future select remembering to exclude a column. Giving trainers write
 * access through RLS would mean adding the grant that decision avoids.
 *
 * A trainer's own answer keys do reach their browser here. They are editing
 * them; the difference is that a function authorised the read first.
 */

/** The quiz behind a quiz activity, with its answer keys. null if none yet. */
export const quizForAuthoring = (activityId) =>
  invokeFn('author-quiz', { action: 'get', activityId });

/** Creates the quiz if quizId is absent, updates it if present. */
export const saveQuiz = ({ quizId, activityId, title, passMark, timeLimitSeconds }) =>
  invokeFn('author-quiz', {
    action: 'save-quiz', quizId, activityId, title, passMark, timeLimitSeconds,
  });

/**
 * One call writes the question and its answer key. They live in two tables and
 * a question without a key is one submit-quiz marks wrong for everybody, so
 * they are never saved apart.
 */
export const saveQuizQuestion = (payload) =>
  invokeFn('author-quiz', { action: 'save-question', ...payload });

export const deleteQuizQuestion = (questionId) =>
  invokeFn('author-quiz', { action: 'delete-question', questionId });

/** `order` is every question id in the quiz, in the order they should appear. */
export const reorderQuizQuestions = (quizId, order) =>
  invokeFn('author-quiz', { action: 'reorder', quizId, order });

const filled = (s) => typeof s === 'string' && s.trim() !== '';

/**
 * The same rules author-quiz enforces, said before the request rather than
 * after it. The function is still the authority — this only decides whether
 * Save is worth clicking.
 */
export function questionProblem(q) {
  if (!filled(q.prompt)) return 'The question needs a prompt.';
  if (!Number.isInteger(Number(q.points)) || Number(q.points) < 1) {
    return 'Points must be a whole number of at least 1.';
  }
  if (q.type === 'mcq') {
    const options = q.options ?? [];
    if (options.length < 2) return 'A multiple-choice question needs at least two options.';
    const blank = options.findIndex((o) => !filled(o));
    if (blank !== -1) return `Option ${blank + 1} is empty.`;
    const seen = options.map((o) => o.trim().toLowerCase());
    const dupe = seen.findIndex((o, i) => seen.indexOf(o) !== i);
    if (dupe !== -1) return `Option ${dupe + 1} repeats an earlier one.`;
    const i = q.answer?.index;
    if (!Number.isInteger(i) || i < 0 || i >= options.length) {
      return 'Mark which option is correct.';
    }
  }
  if (q.type === 'truefalse' && typeof q.answer?.value !== 'boolean') {
    return 'Mark whether the statement is true or false.';
  }
  return null;
}
