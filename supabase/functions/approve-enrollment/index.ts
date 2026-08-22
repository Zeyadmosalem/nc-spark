import { requireRole, readJson, jsonResponse, errorResponse, HttpError } from '../_shared/auth.ts';
import { writeAudit } from '../_shared/audit.ts';
import { corsHeaders, handleOptions } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const { profile: actor, service } = await requireRole(req, ['admin', 'trainer']);
    const { enrollmentId, decision } = await readJson(req) as
      { enrollmentId?: string; decision?: string };

    if (!enrollmentId || !['approve', 'deny'].includes(decision ?? '')) {
      throw new HttpError(400, 'enrollmentId and decision (approve|deny) are required');
    }

    const { data: enrollment, error: readErr } = await service
      .from('enrollments')
      .select('id, status, course_id, trainee_id, courses(trainer_id)')
      .eq('id', enrollmentId).single();
    if (readErr || !enrollment) throw new HttpError(404, 'Enrollment not found');

    // A trainer may only decide enrollments on their own courses.
    const ownsCourse = enrollment.courses?.trainer_id === actor.id;
    if (actor.role !== 'admin' && !ownsCourse) {
      throw new HttpError(403, 'Not your course');
    }

    if (enrollment.status !== 'pending') {
      throw new HttpError(409, 'Enrollment has already been decided');
    }

    const nextStatus = decision === 'approve' ? 'active' : 'withdrawn';
    const { data: updated, error: updErr } = await service
      .from('enrollments')
      .update({ status: nextStatus, decided_by: actor.id, decided_at: new Date().toISOString() })
      .eq('id', enrollmentId)
      .select('id, status, course_id, trainee_id, decided_by, decided_at').single();
    if (updErr) throw new HttpError(500, updErr.message);

    await writeAudit(service, {
      actor,
      action: 'enrollment.decided',
      entityType: 'enrollment',
      entityId: enrollmentId,
      before: { status: enrollment.status },
      after: { status: updated.status },
    });

    return jsonResponse({ ok: true, enrollment: updated }, corsHeaders);
  } catch (err) {
    return errorResponse(err, corsHeaders);
  }
});
