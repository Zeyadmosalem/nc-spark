import { requireClient } from './client';

/**
 * Unpacks a PostgREST `{ data, error }` result, turning the error half into a
 * thrown Error so callers can use ordinary try/catch and TanStack Query can
 * see a rejection.
 */
export function unwrap({ data, error }) {
  if (error) throw new Error(error.message);
  return data;
}

/**
 * The signed-in user's id, read from the locally cached session.
 *
 * getUser() would be a network round-trip on every call. getSession() reads
 * memory, and nothing here trusts the value: it only ever narrows a query the
 * server is going to authorise anyway. RLS reads the id from the signed JWT,
 * so a tampered local session buys an attacker nothing.
 */
export async function currentUserId() {
  const { data } = await requireClient().auth.getSession();
  const id = data?.session?.user?.id;
  if (!id) throw new Error('Not signed in');
  return id;
}

/**
 * Digs the real message out of a failed Edge Function call.
 *
 * supabase-js turns any non-2xx into a FunctionsHttpError whose message is the
 * fixed string "Edge Function returned a non-2xx status code", and leaves
 * `data` null. Every message the functions carefully produce — "Cannot suspend
 * the last active admin", "A course needs at least one activity before it can
 * be published", "Finish the previous module first" — was being thrown away
 * and replaced with that. The Response is on `error.context`, and the body is
 * where the reason actually is.
 *
 * Returns null rather than throwing if anything about that is unavailable: a
 * generic message is a poor outcome, but losing the error entirely is worse.
 */
async function serverMessage(error) {
  const res = error?.context;
  if (!res || typeof res.json !== 'function') return null;
  try {
    // Clone where possible: reading the body consumes it, and the caller may
    // reasonably want the Response afterwards.
    const body = await (typeof res.clone === 'function' ? res.clone() : res).json();
    return typeof body?.error === 'string' && body.error ? body.error : null;
  } catch {
    return null;
  }
}

/**
 * Calls an Edge Function and normalises its two failure modes into one.
 *
 * A function can fail at the transport layer (`error`) or return 200 with an
 * `{ error }` body; both must reject, or a denied action looks like a success.
 */
export async function invokeFn(fn, body) {
  const { data, error } = await requireClient().functions.invoke(fn, { body });
  if (error) throw new Error((await serverMessage(error)) ?? error.message);
  if (data?.error) throw new Error(data.error);
  return data;
}
