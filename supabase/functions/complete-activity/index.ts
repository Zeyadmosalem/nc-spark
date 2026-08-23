import { requireRole, readJson, jsonResponse, errorResponse, HttpError } from '../_shared/auth.ts';
import { corsFor, handleOptions } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  const cors = corsFor(req);
  try {
    const { profile: actor, service } = await requireRole(req, ['trainee']);
    const { activityId, payload } = await readJson(req) as
      { activityId?: string; payload?: Record<string, unknown> };

    if (!activityId) throw new HttpError(400, 'activityId is required');

    // Resolve the activity and the course it belongs to.
    const { data: activity, error: actErr } = await service
      .from('activities')
      .select('id, module_id, modules(id, course_id)')
      .eq('id', activityId).single();
    if (actErr || !activity) throw new HttpError(404, 'Activity not found');

    const courseId = activity.modules?.course_id;
    if (!courseId) throw new HttpError(404, 'Activity has no course');

    const { data: enrollment, error: enrErr } = await service
      .from('enrollments')
      .select('id, status')
      .eq('course_id', courseId).eq('trainee_id', actor.id).maybeSingle();
    if (enrErr) throw new HttpError(500, enrErr.message);
    if (!enrollment || !['active', 'completed'].includes(enrollment.status)) {
      throw new HttpError(403, 'You are not enrolled in this course');
    }

    // The prerequisite check the client cannot be trusted to make.
    //
    // is_module_unlocked_for, not is_module_unlocked_probe: the probe derives
    // the caller from auth.uid(), which is NULL here, and service_role cannot
    // reach schema app at all. Ownership is already established above.
    const { data: unlocked, error: lockErr } = await service
      .rpc('is_module_unlocked_for', { enrollment: enrollment.id, module: activity.module_id });
    if (lockErr) throw new HttpError(500, lockErr.message);
    // NULL means the module does not exist; treat anything but true as locked.
    if (unlocked !== true) throw new HttpError(423, 'Finish the previous module first');

    // Idempotent: repeating a completion is a no-op, not an error, because a
    // double-submit from a flaky connection should not fail the trainee.
    const { error: insErr } = await service
      .from('activity_completions')
      .upsert(
        { enrollment_id: enrollment.id, activity_id: activityId, payload: payload ?? {} },
        { onConflict: 'enrollment_id,activity_id', ignoreDuplicates: true },
      );
    if (insErr) throw new HttpError(500, insErr.message);

    const { data: progress, error: pErr } = await service
      .from('enrollment_progress')
      .select('percent, completed_activities, total_activities')
      .eq('enrollment_id', enrollment.id).single();
    if (pErr) throw new HttpError(500, pErr.message);

    // Finishing every activity completes the enrollment — UNLESS the course
    // has a final assessment, in which case 100% only unlocks it and passing
    // it is what completes the course. M4 supersedes the M3 rule here; a
    // course with no final behaves exactly as it did before.
    if (progress.percent === 100 && enrollment.status !== 'completed') {
      const { data: final, error: finalErr } = await service
        .from('quizzes').select('id')
        .eq('course_id', courseId).is('activity_id', null).maybeSingle();
      if (finalErr) throw new HttpError(500, finalErr.message);

      if (!final) {
        await service.from('enrollments')
          .update({ status: 'completed', completed_at: new Date().toISOString() })
          .eq('id', enrollment.id);
      }
    }

    return jsonResponse({
      ok: true,
      completion: { activityId, enrollmentId: enrollment.id },
      progress: {
        percent: progress.percent,
        completed: progress.completed_activities,
        total: progress.total_activities,
      },
    }, cors);
  } catch (err) {
    return errorResponse(err, cors);
  }
});
