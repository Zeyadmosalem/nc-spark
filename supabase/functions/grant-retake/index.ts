import { requireRole, readJson, jsonResponse, errorResponse, HttpError } from '../_shared/auth.ts';
import { writeAudit } from '../_shared/audit.ts';
import { corsFor, handleOptions } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  const cors = corsFor(req);
  try {
    // A trainee reaching this gets 403 from requireRole, before any lookup.
    const { profile: actor, service } = await requireRole(req, ['admin', 'trainer']);
    const { quizId, traineeId, reason } = await readJson(req) as {
      quizId?: string; traineeId?: string; reason?: string;
    };
    if (!quizId || !traineeId) throw new HttpError(400, 'quizId and traineeId are required');

    const { data: quiz, error: quizErr } = await service
      .from('quizzes').select('id, course_id, title').eq('id', quizId).maybeSingle();
    if (quizErr) throw new HttpError(500, quizErr.message);
    if (!quiz) throw new HttpError(404, 'Quiz not found');

    const { data: course, error: cErr } = await service
      .from('courses').select('trainer_id').eq('id', quiz.course_id).single();
    if (cErr) throw new HttpError(500, cErr.message);
    if (actor.role !== 'admin' && course.trainer_id !== actor.id) {
      throw new HttpError(403, 'Not your course');
    }

    // There must be something to retake. Granting against a quiz the trainee
    // has not finished would hand out a spare attempt they could bank.
    const { data: attempts, error: attErr } = await service
      .from('quiz_attempts').select('id, status')
      .eq('quiz_id', quizId).eq('trainee_id', traineeId);
    if (attErr) throw new HttpError(500, attErr.message);
    const retakeable = (attempts ?? []).some((a) => a.status === 'failed' || a.status === 'expired');
    if (!retakeable) {
      throw new HttpError(409, 'That trainee has no failed or expired attempt at this quiz');
    }

    const { data: existing, error: exErr } = await service
      .from('quiz_retake_grants').select('id')
      .eq('quiz_id', quizId).eq('trainee_id', traineeId).is('consumed_at', null);
    if (exErr) throw new HttpError(500, exErr.message);
    if ((existing ?? []).length > 0) {
      throw new HttpError(409, 'That trainee already has an unused retake');
    }

    const { data: grant, error: insErr } = await service.from('quiz_retake_grants')
      .insert({ quiz_id: quizId, trainee_id: traineeId, granted_by: actor.id, reason: reason ?? null })
      .select('id, created_at').single();
    if (insErr) throw new HttpError(500, insErr.message);

    // "Who let this person retake the fire safety assessment" is exactly the
    // question an auditor asks, so the reason is part of the record.
    await writeAudit(service, {
      actor, action: 'quiz.retake_granted', entityType: 'quiz', entityId: quizId,
      after: { traineeId, reason: reason ?? null, grantId: grant.id },
    });

    return jsonResponse({ ok: true, grant }, cors);
  } catch (err) {
    return errorResponse(err, cors);
  }
});
