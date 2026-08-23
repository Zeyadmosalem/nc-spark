import { requireRole, readJson, jsonResponse, errorResponse, HttpError } from '../_shared/auth.ts';
import { writeAudit } from '../_shared/audit.ts';
import { corsFor, handleOptions } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  const cors = corsFor(req);
  try {
    const { profile: actor, service } = await requireRole(req, ['admin', 'trainer']);
    const { attemptId, questionId, awarded, comment } = await readJson(req) as {
      attemptId?: string; questionId?: string; awarded?: number; comment?: string;
    };
    if (!attemptId || !questionId || typeof awarded !== 'number') {
      throw new HttpError(400, 'attemptId, questionId and a numeric awarded are required');
    }
    if (awarded < 0) throw new HttpError(400, 'awarded cannot be negative');

    const { data: attempt, error: attErr } = await service
      .from('quiz_attempts')
      .select('id, quiz_id, enrollment_id, status, quizzes(id, course_id, activity_id, pass_mark)')
      .eq('id', attemptId).maybeSingle();
    if (attErr) throw new HttpError(500, attErr.message);
    if (!attempt) throw new HttpError(404, 'Attempt not found');

    const quiz = attempt.quizzes;
    const { data: course, error: cErr } = await service
      .from('courses').select('trainer_id').eq('id', quiz.course_id).single();
    if (cErr) throw new HttpError(500, cErr.message);
    if (actor.role !== 'admin' && course.trainer_id !== actor.id) {
      throw new HttpError(403, 'Not your course');
    }

    if (attempt.status !== 'pending_review') {
      throw new HttpError(409, 'This attempt is not awaiting review');
    }

    const { data: question, error: qErr } = await service
      .from('quiz_questions').select('id, type, points').eq('id', questionId).maybeSingle();
    if (qErr) throw new HttpError(500, qErr.message);
    if (!question || question.type !== 'paragraph') {
      throw new HttpError(404, 'No paragraph question with that id');
    }
    if (awarded > question.points) {
      throw new HttpError(400, `awarded cannot exceed ${question.points}`);
    }

    const { error: ansErr } = await service.from('quiz_answers')
      .update({ awarded, is_correct: awarded > 0, comment: comment ?? null })
      .eq('attempt_id', attemptId).eq('question_id', questionId);
    if (ansErr) throw new HttpError(500, ansErr.message);

    // Recompute across every question, not just the graded one: the final
    // score has to account for the auto-marked half too.
    const { data: rows, error: rowErr } = await service
      .from('quiz_answers')
      .select('awarded, quiz_questions(points)')
      .eq('attempt_id', attemptId);
    if (rowErr) throw new HttpError(500, rowErr.message);

    const stillUngraded = (rows ?? []).some((r) => r.awarded === null);
    const possible = (rows ?? []).reduce((n, r) => n + (r.quiz_questions?.points ?? 0), 0);
    const earned   = (rows ?? []).reduce((n, r) => n + (r.awarded ?? 0), 0);
    const score    = possible === 0 ? 0 : Math.round((earned / possible) * 100);

    // More than one paragraph means more than one grading pass; the attempt
    // stays pending until the last of them is marked.
    if (stillUngraded) {
      await writeAudit(service, {
        actor, action: 'quiz.paragraph_graded', entityType: 'quiz_attempt', entityId: attemptId,
        after: { questionId, awarded, remaining: true },
      });
      return jsonResponse({ ok: true, status: 'pending_review', passed: null, score }, cors);
    }

    const passed = score >= Number(quiz.pass_mark) * 100;
    const status = passed ? 'passed' : 'failed';

    const { error: updErr } = await service.from('quiz_attempts').update({
      status, passed, final_score: score,
      graded_at: new Date().toISOString(), graded_by: actor.id,
    }).eq('id', attemptId);
    if (updErr) throw new HttpError(500, updErr.message);

    if (passed) {
      if (quiz.activity_id) {
        const { error: compErr } = await service.from('activity_completions').upsert(
          {
            enrollment_id: attempt.enrollment_id,
            activity_id: quiz.activity_id,
            payload: { attemptId, score, gradedBy: actor.id },
          },
          { onConflict: 'enrollment_id,activity_id', ignoreDuplicates: true },
        );
        if (compErr) throw new HttpError(500, compErr.message);
      } else {
        const { error: enrErr } = await service.from('enrollments')
          .update({ status: 'completed', completed_at: new Date().toISOString() })
          .eq('id', attempt.enrollment_id);
        if (enrErr) throw new HttpError(500, enrErr.message);
      }
    }

    await writeAudit(service, {
      actor, action: 'quiz.paragraph_graded', entityType: 'quiz_attempt', entityId: attemptId,
      after: { questionId, awarded, score, passed },
    });

    return jsonResponse({ ok: true, status, passed, score }, cors);
  } catch (err) {
    return errorResponse(err, cors);
  }
});
