import { requireRole, readJson, jsonResponse, errorResponse, HttpError } from '../_shared/auth.ts';
import { writeAudit } from '../_shared/audit.ts';
import { corsFor, handleOptions } from '../_shared/cors.ts';

/**
 * Reads and edits the email-domain allowlist.
 *
 * allowed_domains has RLS enabled and NO policy, so no browser session can
 * touch it at all — only the service role, which bypasses RLS. That was
 * deliberate and stays that way: this function is the single audited door,
 * rather than a policy that would let any admin's browser write the table
 * directly.
 *
 * The table decides who skips administrator approval at signup, so adding a
 * domain hands everyone with an address there an active account without
 * further review. That is the whole point, and it is also why every change is
 * written to the audit log.
 */

/**
 * Deliberately stricter than the RFC. It rejects a leading dot, a trailing
 * dot, consecutive dots, and anything without a TLD — the shapes most likely
 * to be a typo that quietly allowlists nothing, or a paste of a whole email
 * address.
 */
const DOMAIN = /^(?=.{1,253}$)[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/;

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  const cors = corsFor(req);
  try {
    const { profile: actor, service } = await requireRole(req, ['admin']);
    const { action, domain } = await readJson(req) as
      { action?: string; domain?: string };

    if (!action || !['list', 'add', 'remove'].includes(action)) {
      throw new HttpError(400, 'action must be list, add or remove');
    }

    if (action === 'list') {
      const { data, error } = await service
        .from('allowed_domains').select('domain, created_at').order('domain');
      if (error) throw new HttpError(500, error.message);
      return jsonResponse({ ok: true, domains: data ?? [] }, cors);
    }

    // The column has a `domain = lower(domain)` check, and a stray space or
    // capital is the difference between allowlisting a company and silently
    // allowlisting nothing. Normalise before validating.
    const normalised = String(domain ?? '').trim().toLowerCase().replace(/^@/, '');
    if (!DOMAIN.test(normalised)) {
      throw new HttpError(400, `"${domain}" is not a valid domain. Use the part after the @, such as niagaracollege.ca`);
    }

    if (action === 'add') {
      const { error } = await service
        .from('allowed_domains').insert({ domain: normalised });
      // Already allowlisted is the outcome the caller wanted, not a failure.
      if (error && !/duplicate key|unique/i.test(error.message)) {
        throw new HttpError(500, error.message);
      }
      await writeAudit(service, {
        actor,
        action: 'allowed_domain.added',
        entityType: 'allowed_domain',
        entityId: normalised,
        before: null,
        after: { domain: normalised },
      });
      return jsonResponse({ ok: true, domain: normalised }, cors);
    }

    const { data: existing } = await service
      .from('allowed_domains').select('domain').eq('domain', normalised).maybeSingle();
    if (!existing) throw new HttpError(404, `${normalised} is not on the list`);

    const { error: delErr } = await service
      .from('allowed_domains').delete().eq('domain', normalised);
    if (delErr) throw new HttpError(500, delErr.message);

    await writeAudit(service, {
      actor,
      action: 'allowed_domain.removed',
      entityType: 'allowed_domain',
      entityId: normalised,
      before: { domain: normalised },
      after: null,
    });

    // Removing a domain does not touch accounts that already exist. Anyone
    // already activated through it stays active; the change only affects who
    // skips review from now on.
    return jsonResponse({ ok: true, domain: normalised }, cors);
  } catch (err) {
    return errorResponse(err, cors);
  }
});
