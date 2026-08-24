import { requireRole, readJson, jsonResponse, errorResponse, HttpError } from '../_shared/auth.ts';
import { corsFor, handleOptions } from '../_shared/cors.ts';
import {
  newDataKey, wrapDataKey, unwrapDataKey, encryptBody, decryptBody,
} from '../_shared/envelope.ts';
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';

/**
 * Reading and writing support messages.
 *
 * This function exists because the bodies are encrypted and the master key
 * lives in its secrets, not in the database. It is the only thing that can
 * turn a stored row back into text.
 *
 * That makes it the door, so it has to re-check visibility itself. It runs as
 * service_role, which bypasses RLS — so `app.can_see_support` is called
 * explicitly, on behalf of the caller, rather than being relied on implicitly.
 * Getting that wrong here would expose every thread in the product, which is
 * why the live suite checks each role against it directly.
 */

type Action = 'list' | 'send' | 'mark-read';

interface Body {
  action?: Action;
  requestId?: string;
  body?: string;
}

/**
 * Whether `actor` may see `request`, decided the same way the RLS policy
 * decides it.
 *
 * Deliberately NOT a call to app.can_see_support: that helper reads
 * auth.uid(), which is null under service_role, so it would return false for
 * everybody and the function would appear to work while showing nothing. The
 * check is spelled out against the actor's own id instead.
 */
async function canSee(
  service: SupabaseClient,
  requestId: string,
  actor: { id: string; role: string },
): Promise<{ id: string; author_id: string; course_id: string | null; status: string }> {
  const { data: request, error } = await service
    .from('support_requests')
    .select('id, author_id, course_id, status')
    .eq('id', requestId)
    .maybeSingle();
  if (error) throw new HttpError(500, error.message);
  if (!request) throw new HttpError(404, 'No such request');

  if (request.author_id === actor.id) return request;
  if (actor.role === 'admin') return request;

  if (request.course_id && actor.role === 'trainer') {
    const { data: course, error: cErr } = await service
      .from('courses').select('trainer_id').eq('id', request.course_id).maybeSingle();
    if (cErr) throw new HttpError(500, cErr.message);
    if (course?.trainer_id === actor.id) return request;
  }

  // 404 rather than 403. Telling somebody that a thread exists but is not
  // theirs is itself a disclosure — it confirms that a given person filed a
  // request about a given course.
  throw new HttpError(404, 'No such request');
}

/** The thread's data key, created on first use. */
async function threadKey(service: SupabaseClient, requestId: string) {
  const { data: row, error } = await service
    .from('support_thread_keys')
    .select('wrapped_key, wrap_iv')
    .eq('request_id', requestId)
    .maybeSingle();
  if (error) throw new HttpError(500, error.message);

  if (row) return unwrapDataKey(row.wrapped_key, row.wrap_iv);

  const key = await newDataKey();
  const wrapped = await wrapDataKey(key);
  const { error: insErr } = await service
    .from('support_thread_keys')
    .insert({ request_id: requestId, ...wrapped });

  // Two messages sent at once both find no key and both try to make one. The
  // primary key stops the second, and the winner's key is the one to use —
  // otherwise the loser would encrypt with a key nobody stored.
  if (insErr) {
    if (!/duplicate key|unique/i.test(insErr.message)) {
      throw new HttpError(500, insErr.message);
    }
    const { data: winner } = await service
      .from('support_thread_keys')
      .select('wrapped_key, wrap_iv').eq('request_id', requestId).single();
    return unwrapDataKey(winner.wrapped_key, winner.wrap_iv);
  }

  return key;
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  const cors = corsFor(req);
  try {
    const { profile: actor, service } = await requireRole(
      req, ['admin', 'trainer', 'supervisor', 'trainee']);
    const { action, requestId, body } = await readJson(req) as Body;

    if (!requestId) throw new HttpError(400, 'requestId is required');
    const request = await canSee(service, requestId, actor);

    /* ----------------------------------------------------------- list --- */
    if (action === 'list') {
      const { data: rows, error } = await service
        .from('support_messages')
        .select('id, request_id, author_id, body, body_cipher, body_iv, created_at')
        .eq('request_id', requestId)
        .order('created_at');
      if (error) throw new HttpError(500, error.message);

      // Only unwrap the key if something actually needs it.
      const needsKey = (rows ?? []).some((m) => m.body_cipher);
      const key = needsKey ? await threadKey(service, requestId) : null;

      const messages = [];
      for (const m of rows ?? []) {
        let text: string;
        if (m.body_cipher && m.body_iv) {
          try {
            text = await decryptBody(key!, m.body_cipher, m.body_iv);
          } catch {
            // A body that will not decrypt is a real problem, but losing the
            // whole conversation to one bad row helps nobody. The rest of the
            // thread still reads.
            text = '[This message could not be decrypted.]';
          }
        } else {
          // Written before encryption landed. Migrated by the deploy script;
          // this is the fallback while that runs.
          text = m.body ?? '';
        }
        messages.push({
          id: m.id,
          request_id: m.request_id,
          author_id: m.author_id,
          body: text,
          created_at: m.created_at,
        });
      }

      // Named identities come from public_profiles, which carries no email —
      // a trainee cannot read their trainer's profiles row, and should not.
      const ids = [...new Set(messages.map((m) => m.author_id))];
      const { data: people } = await service
        .from('public_profiles').select('id, name, avatar, role').in('id', ids);
      const byId = new Map((people ?? []).map((p) => [p.id, p]));

      return jsonResponse({
        ok: true,
        messages: messages.map((m) => ({
          ...m,
          author: byId.get(m.author_id) ?? null,
        })),
      }, cors);
    }

    /* ----------------------------------------------------------- send --- */
    if (action === 'send') {
      const text = String(body ?? '').trim();
      if (!text) throw new HttpError(400, 'A message needs some text');
      if (text.length > 4000) throw new HttpError(400, 'That message is too long (4000 characters max)');

      // Enforced here as well as in the policy: this function writes as
      // service_role, so the policy that refuses a message on a closed thread
      // does not apply to it.
      if (request.status !== 'open') {
        throw new HttpError(409, 'This thread is closed. Reopen it to add anything else.');
      }

      const key = await threadKey(service, requestId);
      const encrypted = await encryptBody(key, text);

      const { data: inserted, error } = await service
        .from('support_messages')
        .insert({ request_id: requestId, author_id: actor.id, ...encrypted })
        .select('id, created_at')
        .single();
      if (error) throw new HttpError(500, error.message);

      // Bumps the thread so the inbox orders by real activity. The trigger
      // only fires on an update to the request itself.
      await service.from('support_requests')
        .update({ status: request.status }).eq('id', requestId);

      return jsonResponse({ ok: true, id: inserted.id, createdAt: inserted.created_at }, cors);
    }

    /* ------------------------------------------------------ mark-read --- */
    if (action === 'mark-read') {
      const { error } = await service.from('support_reads').upsert(
        { request_id: requestId, user_id: actor.id, last_read_at: new Date().toISOString() },
        { onConflict: 'request_id,user_id' });
      if (error) throw new HttpError(500, error.message);
      return jsonResponse({ ok: true }, cors);
    }

    throw new HttpError(400, 'action must be list, send or mark-read');
  } catch (err) {
    return errorResponse(err, cors);
  }
});
