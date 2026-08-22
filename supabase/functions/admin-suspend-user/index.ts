import { requireRole, readJson, jsonResponse, errorResponse, HttpError } from '../_shared/auth.ts';
import { writeAudit, assertNotLastAdmin } from '../_shared/audit.ts';
import { corsHeaders, handleOptions } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const { profile: actor, service } = await requireRole(req, ['admin']);
    const { userId, suspend } = await readJson(req) as { userId?: string; suspend?: boolean };

    if (!userId || typeof suspend !== 'boolean') {
      throw new HttpError(400, 'userId and boolean suspend are required');
    }

    const { data: target, error: readErr } = await service
      .from('profiles').select('id, role, status').eq('id', userId).single();
    if (readErr || !target) throw new HttpError(404, 'User not found');

    if (suspend) await assertNotLastAdmin(service, target.id, target.role);

    // Users are suspended rather than deleted so their training records, which
    // are compliance evidence, survive.
    const nextStatus = suspend ? 'suspended' : 'active';
    if (target.status === nextStatus) {
      return jsonResponse({ ok: true, profile: target, unchanged: true }, corsHeaders);
    }

    const { data: updated, error: updErr } = await service
      .from('profiles').update({ status: nextStatus }).eq('id', userId)
      .select('id, role, status, name, email').single();
    if (updErr) throw new HttpError(500, updErr.message);

    await writeAudit(service, {
      actor,
      action: suspend ? 'profile.suspended' : 'profile.reinstated',
      entityType: 'profile',
      entityId: userId,
      before: { status: target.status },
      after: { status: updated.status },
    });

    return jsonResponse({ ok: true, profile: updated }, corsHeaders);
  } catch (err) {
    return errorResponse(err, corsHeaders);
  }
});
