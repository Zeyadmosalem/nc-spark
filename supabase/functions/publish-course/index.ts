import { requireRole, readJson, jsonResponse, errorResponse, HttpError } from '../_shared/auth.ts';
import { writeAudit } from '../_shared/audit.ts';
import { corsFor, handleOptions } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  const cors = corsFor(req);
  try {
    const { profile: actor, service } = await requireRole(req, ['admin', 'trainer']);
    const { courseId, publish } = await readJson(req) as
      { courseId?: string; publish?: boolean };

    if (!courseId || typeof publish !== 'boolean') {
      throw new HttpError(400, 'courseId and boolean publish are required');
    }

    const { data: course, error: readErr } = await service
      .from('courses').select('id, status, trainer_id, title').eq('id', courseId).single();
    if (readErr || !course) throw new HttpError(404, 'Course not found');

    if (actor.role !== 'admin' && course.trainer_id !== actor.id) {
      throw new HttpError(403, 'Not your course');
    }

    // Publishing an empty shell would put a course in the catalog that a
    // trainee can enrol in and then find nothing to do.
    if (publish) {
      const { count } = await service
        .from('activities')
        .select('id, modules!inner(course_id)', { count: 'exact', head: true })
        .eq('modules.course_id', courseId);
      if ((count ?? 0) === 0) {
        throw new HttpError(422, 'A course needs at least one activity before it can be published');
      }

      /*
       * An empty quiz is a wall, not an inconvenience. submit-quiz scores
       * `possible === 0 ? 0` and every pass mark is above zero, so a quiz
       * activity with no questions can never be passed — and a module quiz
       * gates the next module, so the whole course past it is unreachable for
       * every trainee who enrols. The same is true of a quiz activity that
       * has no quizzes row behind it at all.
       *
       * Checked at publish rather than at save, because a half-written quiz is
       * a normal thing to have in a draft.
       */
      const { data: quizActivities, error: qaErr } = await service
        .from('activities')
        .select('id, title, modules!inner(course_id)')
        .eq('type', 'quiz')
        .eq('modules.course_id', courseId);
      if (qaErr) throw new HttpError(500, qaErr.message);

      for (const activity of quizActivities ?? []) {
        const { data: quiz } = await service
          .from('quizzes').select('id').eq('activity_id', activity.id).maybeSingle();
        if (!quiz) {
          throw new HttpError(422,
            `"${activity.title}" is a quiz with nothing in it. Add its questions, `
            + 'or remove the activity — a trainee cannot pass an empty quiz and the '
            + 'rest of the course stays locked behind it.');
        }
        const { count: questions } = await service
          .from('quiz_questions').select('id', { count: 'exact', head: true })
          .eq('quiz_id', quiz.id);
        if ((questions ?? 0) === 0) {
          throw new HttpError(422,
            `"${activity.title}" has no questions yet. A trainee cannot pass an empty `
            + 'quiz, and the rest of the course stays locked behind it.');
        }
      }
    }

    const nextStatus = publish ? 'published' : 'draft';
    if (course.status === nextStatus) {
      return jsonResponse({ ok: true, course, unchanged: true }, cors);
    }

    const { data: updated, error: updErr } = await service
      .from('courses').update({ status: nextStatus }).eq('id', courseId)
      .select('id, status, title, trainer_id').single();
    if (updErr) throw new HttpError(500, updErr.message);

    await writeAudit(service, {
      actor,
      action: publish ? 'course.published' : 'course.unpublished',
      entityType: 'course',
      entityId: courseId,
      before: { status: course.status },
      after: { status: updated.status },
    });

    return jsonResponse({ ok: true, course: updated }, cors);
  } catch (err) {
    return errorResponse(err, cors);
  }
});
