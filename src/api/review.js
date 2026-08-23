import { requireClient } from './client';
import { unwrap, invokeFn } from './helpers';

const num = (v) => (v === null || v === undefined ? null : Number(v));

/**
 * Paragraph answers waiting to be marked, across every course the caller can
 * see. RLS already restricts attempts to the caller's own courses (or all of
 * them for an admin), so this asks for the queue without naming a trainer.
 *
 * The answer key is not joined. A trainer marking a paragraph reads the
 * trainee's words and the question, not a stored "right answer" — paragraph
 * keys hold guidance, and nothing here needs it.
 */
export async function pendingReviews() {
  const rows = unwrap(await requireClient()
    .from('quiz_attempts')
    .select(`
      id, quiz_id, attempt_no, status, submitted_at, auto_score,
      profiles!quiz_attempts_trainee_id_fkey(id, name, avatar),
      quizzes(id, title, pass_mark, courses(id, title)),
      quiz_answers(id, question_id, response, awarded,
                   quiz_questions(id, type, prompt, points))
    `)
    .eq('status', 'pending_review')
    .order('submitted_at', { ascending: true }));

  return (rows ?? []).map((r) => ({
    attemptId: r.id,
    quizId: r.quiz_id,
    quizTitle: r.quizzes?.title ?? '',
    courseTitle: r.quizzes?.courses?.title ?? '',
    traineeName: r.profiles?.name ?? 'Unknown',
    traineeAvatar: r.profiles?.avatar ?? '?',
    submittedAt: r.submitted_at,
    autoScore: num(r.auto_score),
    // Only the paragraphs need marking; the rest are already graded.
    paragraphs: (r.quiz_answers ?? [])
      .filter((a) => a.quiz_questions?.type === 'paragraph' && a.awarded === null)
      .map((a) => ({
        questionId: a.question_id,
        prompt: a.quiz_questions?.prompt ?? '',
        points: a.quiz_questions?.points ?? 1,
        text: a.response?.text ?? '',
      })),
  }));
}

/** Attempts a trainee cannot get past without a granted retake. */
export async function blockedAttempts() {
  const rows = unwrap(await requireClient()
    .from('quiz_attempts')
    .select(`
      id, quiz_id, attempt_no, status, submitted_at, final_score, auto_score,
      profiles!quiz_attempts_trainee_id_fkey(id, name, avatar),
      quizzes(id, title, courses(id, title))
    `)
    .in('status', ['failed', 'expired'])
    .order('submitted_at', { ascending: false }));

  return (rows ?? []).map((r) => ({
    attemptId: r.id,
    quizId: r.quiz_id,
    quizTitle: r.quizzes?.title ?? '',
    courseTitle: r.quizzes?.courses?.title ?? '',
    traineeId: r.profiles?.id,
    traineeName: r.profiles?.name ?? 'Unknown',
    traineeAvatar: r.profiles?.avatar ?? '?',
    status: r.status,
    score: num(r.final_score) ?? num(r.auto_score),
    attemptNo: r.attempt_no,
  }));
}

/** Retake grants already handed out and not yet used. */
export async function openRetakeGrants() {
  const rows = unwrap(await requireClient()
    .from('quiz_retake_grants')
    .select('id, quiz_id, trainee_id')
    .is('consumed_at', null));
  return rows ?? [];
}

export const gradeParagraph = ({ attemptId, questionId, awarded, comment }) =>
  invokeFn('grade-paragraph', { attemptId, questionId, awarded, comment });

export const grantRetake = ({ quizId, traineeId, reason }) =>
  invokeFn('grant-retake', { quizId, traineeId, reason });
