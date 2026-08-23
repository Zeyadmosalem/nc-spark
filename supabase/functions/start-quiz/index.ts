import { requireRole, readJson, jsonResponse, errorResponse, HttpError } from '../_shared/auth.ts';
import { corsFor, handleOptions } from '../_shared/cors.ts';

// Exactly the columns a trainee may see. quiz_answer_keys is a separate table
// with no grant to any browser role, so there is nothing here to filter — but
// naming the columns keeps it that way if a future migration adds one.
const QUESTION_COLUMNS = 'id, type, position, prompt, options, points';

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  const cors = corsFor(req);
  try {
    const { profile: actor, service } = await requireRole(req, ['trainee']);
    const { quizId } = await readJson(req) as { quizId?: string };
    if (!quizId) throw new HttpError(400, 'quizId is required');

    const { data: quiz, error: quizErr } = await service
      .from('quizzes')
      .select('id, course_id, activity_id, title, pass_mark, time_limit_seconds')
      .eq('id', quizId).maybeSingle();
    if (quizErr) throw new HttpError(500, quizErr.message);
    if (!quiz) throw new HttpError(404, 'Quiz not found');

    const { data: enrollment, error: enrErr } = await service
      .from('enrollments')
      .select('id, status')
      .eq('course_id', quiz.course_id).eq('trainee_id', actor.id).maybeSingle();
    if (enrErr) throw new HttpError(500, enrErr.message);
    if (!enrollment || !['active', 'completed'].includes(enrollment.status)) {
      throw new HttpError(403, 'You are not enrolled in this course');
    }

    // Two different gates, because a module quiz and a course final are
    // unlocked by different things.
    if (quiz.activity_id) {
      const { data: activity, error: actErr } = await service
        .from('activities').select('module_id').eq('id', quiz.activity_id).maybeSingle();
      if (actErr) throw new HttpError(500, actErr.message);
      if (!activity) throw new HttpError(404, 'Quiz activity not found');

      const { data: unlocked, error: lockErr } = await service
        .rpc('is_module_unlocked_for', { enrollment: enrollment.id, module: activity.module_id });
      if (lockErr) throw new HttpError(500, lockErr.message);
      if (unlocked !== true) throw new HttpError(423, 'Finish the previous module first');
    } else {
      const { data: ready, error: readyErr } = await service
        .rpc('all_modules_complete_for', { enrollment: enrollment.id });
      if (readyErr) throw new HttpError(500, readyErr.message);
      if (ready !== true) throw new HttpError(423, 'Finish every module before the final assessment');
    }

    const { data: attempts, error: attErr } = await service
      .from('quiz_attempts')
      .select('id, attempt_no, status, started_at')
      .eq('quiz_id', quizId).eq('trainee_id', actor.id)
      .order('attempt_no', { ascending: false });
    if (attErr) throw new HttpError(500, attErr.message);

    // A refresh mid-quiz must not burn the single attempt, so an in-progress
    // attempt is resumed rather than refused or duplicated.
    let attempt = (attempts ?? []).find((a) => a.status === 'in_progress') ?? null;

    if (!attempt) {
      if ((attempts ?? []).length > 0) {
        const { data: granted, error: grantErr } = await service
          .rpc('has_unconsumed_retake_for', { quiz: quizId, trainee: actor.id });
        if (grantErr) throw new HttpError(500, grantErr.message);
        if (granted !== true) {
          throw new HttpError(409, 'You have already used your attempt at this quiz');
        }
        // Spend the grant BEFORE opening the attempt. Ordered this way a
        // failure here costs the trainee a retake they must ask for again,
        // which is recoverable; the reverse would leave a spent-looking grant
        // that still opens attempts.
        const { error: consumeErr } = await service
          .from('quiz_retake_grants')
          .update({ consumed_at: new Date().toISOString() })
          .eq('quiz_id', quizId).eq('trainee_id', actor.id).is('consumed_at', null);
        if (consumeErr) throw new HttpError(500, consumeErr.message);
      }

      const nextNo = Math.max(0, ...(attempts ?? []).map((a) => a.attempt_no)) + 1;
      const { data: created, error: createErr } = await service
        .from('quiz_attempts')
        .insert({
          quiz_id: quizId, trainee_id: actor.id,
          enrollment_id: enrollment.id, attempt_no: nextNo,
        })
        .select('id, attempt_no, status, started_at').single();
      if (createErr) throw new HttpError(500, createErr.message);
      attempt = created;
    }

    const { data: questions, error: qErr } = await service
      .from('quiz_questions')
      .select(QUESTION_COLUMNS).eq('quiz_id', quizId).order('position');
    if (qErr) throw new HttpError(500, qErr.message);

    const deadline = quiz.time_limit_seconds
      ? new Date(new Date(attempt.started_at).getTime() + quiz.time_limit_seconds * 1000).toISOString()
      : null;

    return jsonResponse({
      ok: true,
      quiz: {
        id: quiz.id, title: quiz.title,
        passMark: Number(quiz.pass_mark),
        timeLimitSeconds: quiz.time_limit_seconds,
      },
      attempt: {
        id: attempt.id,
        attemptNo: attempt.attempt_no,
        startedAt: attempt.started_at,
        deadline,
      },
      questions: questions ?? [],
    }, cors);
  } catch (err) {
    return errorResponse(err, cors);
  }
});
