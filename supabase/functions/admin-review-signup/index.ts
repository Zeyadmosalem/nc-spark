import { requireRole, readJson, jsonResponse, errorResponse, HttpError, type Role } from '../_shared/auth.ts';
import { writeAudit } from '../_shared/audit.ts';
import { corsHeaders, handleOptions } from '../_shared/cors.ts';

const VALID_ROLES: Role[] = ['admin', 'supervisor', 'trainer', 'trainee'];

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const { profile: actor, service } = await requireRole(req, ['admin']);
    const body = await readJson(req) as { userId?: string; decision?: string; role?: Role };
    const { userId, decision } = body;
    const role = body.role ?? 'trainee';

    if (!userId || !decision || !['approve', 'reject'].includes(decision)) {
      throw new HttpError(400, 'userId and decision (approve|reject) are required');
    }
    if (!VALID_ROLES.includes(role)) throw new HttpError(400, 'Invalid role');

    const { data: target, error: readErr } = await service
      .from('profiles').select('id, role, status').eq('id', userId).single();
    if (readErr || !target) throw new HttpError(404, 'User not found');

    // Reviewing an already-decided account would silently re-open or re-close
    // it, so it is refused rather than treated as idempotent.
    if (target.status !== 'pending') throw new HttpError(409, 'User is not awaiting review');

    const patch = decision === 'approve'
      ? { status: 'active', role }
      : { status: 'rejected' };

    const { data: updated, error: updErr } = await service
      .from('profiles').update(patch).eq('id', userId)
      .select('id, role, status, name, email').single();
    if (updErr) throw new HttpError(500, updErr.message);

    await writeAudit(service, {
      actor,
      action: 'profile.signup_reviewed',
      entityType: 'profile',
      entityId: userId,
      before: { role: target.role, status: target.status },
      after: { role: updated.role, status: updated.status },
    });

    return jsonResponse({ ok: true, profile: updated }, corsHeaders);
  } catch (err) {
    return errorResponse(err, corsHeaders);
  }
});
