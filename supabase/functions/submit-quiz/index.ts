import { requireRole, readJson, jsonResponse, errorResponse, HttpError } from '../_shared/auth.ts';
import { corsFor, handleOptions } from '../_shared/cors.ts';

interface Question {
  id: string;
  type: 'mcq' | 'truefalse' | 'paragraph';
  points: number;
}

/**
 * The only place a response meets an answer key, and it runs on the server.
 *
 * A paragraph returns null rather than false: "not yet marked" has to stay
 * distinguishable from "marked wrong", because the first holds the attempt at
 * pending_review and the second does not.
 */
function isCorrect(question: Question, response: unknown, key: Record<string, unknown> | undefined) {
  if (question.type === 'paragraph') return null;
  if (!key || response === null || response === undefined) return false;
  const given = response as Record<string, unknown>;
  if (question.type === 'mcq') return given.index === key.index;
  return given.value === key.value;
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  const cors = corsFor(req);
  try {
    const { profile: actor, service } = await requireRole(req, ['trainee']);
    const { attemptId, answers } = await readJson(req) as {
      attemptId?: string;
      answers?: Array<{ questionId: string; response: unknown }>;
    };
    if (!attemptId) throw new HttpError(400, 'attemptId is required');
    const submitted = Array.isArray(answers) ? answers : [];

    const { data: attempt, error: attErr } = await service
      .from('quiz_attempts')
      .select('id, quiz_id, trainee_id, enrollment_id, status, started_at')
      .eq('id', attemptId).maybeSingle();
    if (attErr) throw new HttpError(500, attErr.message);
    if (!attempt) throw new HttpError(404, 'Attempt not found');
    if (attempt.trainee_id !== actor.id) throw new HttpError(403, 'Not your attempt');
    if (attempt.status !== 'in_progress') {
      throw new HttpError(409, 'This attempt has already been submitted');
    }

    const { data: quiz, error: quizErr } = await service
      .from('quizzes')
      .select('id, course_id, activity_id, pass_mark, time_limit_seconds')
      .eq('id', attempt.quiz_id).single();
    if (quizErr) throw new HttpError(500, quizErr.message);

    // The client's countdown is display only; this is what decides.
    const expired = quiz.time_limit_seconds !== null
      && Date.now() > new Date(attempt.started_at).getTime() + quiz.time_limit_seconds * 1000;

    const { data: questions, error: qErr } = await service
      .from('quiz_questions').select('id, type, points').eq('quiz_id', attempt.quiz_id);
    if (qErr) throw new HttpError(500, qErr.message);

    const { data: keys, error: keyErr } = await service
      .from('quiz_answer_keys')
      .select('question_id, answer')
      .in('question_id', (questions ?? []).map((q) => q.id));
    if (keyErr) throw new HttpError(500, keyErr.message);
    const keyFor = new Map((keys ?? []).map((k) => [k.question_id, k.answer]));

    // A response naming a question from some other quiz is dropped, not stored.
    const given = new Map(
      submitted
        .filter((a) => (questions ?? []).some((q) => q.id === a.questionId))
        .map((a) => [a.questionId, a.response]),
    );

    let earned = 0;
    let possible = 0;
    let hasParagraph = false;
    const rows = [];
    const perQuestion = [];

    for (const q of (questions ?? []) as Question[]) {
      const response = given.has(q.id) ? given.get(q.id) : null;
      const correct = isCorrect(q, response, keyFor.get(q.id));

      if (correct === null) {
        hasParagraph = true;                 // graded later by a trainer
      } else {
        possible += q.points;
        if (correct) earned += q.points;
      }

      rows.push({
        attempt_id: attempt.id,
        question_id: q.id,
        response: response ?? {},
        is_correct: correct,
        awarded: correct === null ? null : (correct ? q.points : 0),
      });
      perQuestion.push({ questionId: q.id, isCorrect: correct });
    }

    const { error: insErr } = await service.from('quiz_answers').insert(rows);
    if (insErr) throw new HttpError(500, insErr.message);

    const autoScore = possible === 0 ? 0 : Math.round((earned / possible) * 100);
    const passMark = Number(quiz.pass_mark) * 100;

    // Three outcomes, and only one of them completes anything. An expired
    // attempt fails outright: grading what arrived still records the work,
    // but a late submission cannot earn a pass.
    let status: string;
    let passed: boolean | null;
    if (expired) {
      status = 'expired';
      passed = false;
    } else if (hasParagraph) {
      status = 'pending_review';
      passed = null;
    } else {
      passed = autoScore >= passMark;
      status = passed ? 'passed' : 'failed';
    }

    const { error: updErr } = await service.from('quiz_attempts').update({
      status,
      submitted_at: new Date().toISOString(),
      auto_score: autoScore,
      final_score: hasParagraph ? null : autoScore,
      passed,
      graded_at: hasParagraph ? null : new Date().toISOString(),
    }).eq('id', attempt.id);
    if (updErr) throw new HttpError(500, updErr.message);

    if (passed === true) {
      if (quiz.activity_id) {
        // Only a pass completes the activity, so failing leaves the module
        // locked. Idempotent, because a retry must not error.
        const { error: compErr } = await service.from('activity_completions').upsert(
          {
            enrollment_id: attempt.enrollment_id,
            activity_id: quiz.activity_id,
            payload: { attemptId: attempt.id, score: autoScore },
          },
          { onConflict: 'enrollment_id,activity_id', ignoreDuplicates: true },
        );
        if (compErr) throw new HttpError(500, compErr.message);
      } else {
        // Passing the final is what completes the course, superseding M3's
        // rule that 100% of activities does.
        const { error: enrErr } = await service.from('enrollments')
          .update({ status: 'completed', completed_at: new Date().toISOString() })
          .eq('id', attempt.enrollment_id);
        if (enrErr) throw new HttpError(500, enrErr.message);
      }
    }

    return jsonResponse({
      ok: true,
      status,
      score: autoScore,
      passed,
      // Right or wrong per question, never the right answer and never the
      // explanation: with one attempt each, anything shown can be screenshotted
      // and handed to the next trainee.
      perQuestion,
    }, cors);
  } catch (err) {
    return errorResponse(err, cors);
  }
});
