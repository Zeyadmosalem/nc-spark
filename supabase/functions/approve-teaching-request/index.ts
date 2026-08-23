import { requireRole, readJson, jsonResponse, errorResponse, HttpError } from '../_shared/auth.ts';
import { writeAudit } from '../_shared/audit.ts';
import { corsFor, handleOptions } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  const cors = corsFor(req);
  try {
    // Admin only. A trainer approving their own request would defeat the whole
    // point of the workflow.
    const { profile: actor, service } = await requireRole(req, ['admin']);
    const { requestId, decision } = await readJson(req) as
      { requestId?: string; decision?: string };

    if (!requestId || !['approve', 'deny'].includes(decision ?? '')) {
      throw new HttpError(400, 'requestId and decision (approve|deny) are required');
    }

    const { data: request, error: readErr } = await service
      .from('teaching_requests').select('id, status, trainer_id, course_id')
      .eq('id', requestId).single();
    if (readErr || !request) throw new HttpError(404, 'Request not found');
    if (request.status !== 'pending') throw new HttpError(409, 'Request has already been decided');

    const nextStatus = decision === 'approve' ? 'approved' : 'denied';
    const { data: updated, error: updErr } = await service
      .from('teaching_requests')
      .update({ status: nextStatus, decided_by: actor.id, decided_at: new Date().toISOString() })
      .eq('id', requestId).select('id, status, trainer_id, course_id').single();
    if (updErr) throw new HttpError(500, updErr.message);

    if (decision === 'approve') {
      const { error: assignErr } = await service
        .from('courses').update({ trainer_id: request.trainer_id }).eq('id', request.course_id);
      if (assignErr) throw new HttpError(500, assignErr.message);
    }

    await writeAudit(service, {
      actor,
      action: 'teaching_request.decided',
      entityType: 'teaching_request',
      entityId: requestId,
      before: { status: request.status },
      after: { status: updated.status, trainerAssigned: decision === 'approve' },
    });

    return jsonResponse({ ok: true, request: updated }, cors);
  } catch (err) {
    return errorResponse(err, cors);
  }
});
