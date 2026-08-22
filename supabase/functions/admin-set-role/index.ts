import { requireRole, readJson, jsonResponse, errorResponse, HttpError, type Role } from '../_shared/auth.ts';
import { writeAudit, assertNotLastAdmin } from '../_shared/audit.ts';
import { corsHeaders, handleOptions } from '../_shared/cors.ts';

const VALID_ROLES: Role[] = ['admin', 'supervisor', 'trainer', 'trainee'];

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const { profile: actor, service } = await requireRole(req, ['admin']);
    const { userId, role } = await readJson(req) as { userId?: string; role?: Role };

    if (!userId || !role || !VALID_ROLES.includes(role)) {
      throw new HttpError(400, 'userId and a valid role are required');
    }

    const { data: target, error: readErr } = await service
      .from('profiles').select('id, role, status, name, email').eq('id', userId).single();
    if (readErr || !target) throw new HttpError(404, 'User not found');

    // Demoting the final administrator is unrecoverable without database access.
    if (role !== 'admin') await assertNotLastAdmin(service, target.id, target.role);

    if (target.role === role) {
      return jsonResponse({ ok: true, profile: target, unchanged: true }, corsHeaders);
    }

    const { data: updated, error: updErr } = await service
      .from('profiles').update({ role }).eq('id', userId)
      .select('id, role, status, name, email').single();
    if (updErr) throw new HttpError(500, updErr.message);

    await writeAudit(service, {
      actor,
      action: 'profile.role_changed',
      entityType: 'profile',
      entityId: userId,
      before: { role: target.role },
      after: { role: updated.role },
    });

    return jsonResponse({ ok: true, profile: updated }, corsHeaders);
  } catch (err) {
    return errorResponse(err, corsHeaders);
  }
});
