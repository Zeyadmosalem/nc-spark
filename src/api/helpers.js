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
 * Calls an Edge Function and normalises its two failure modes into one.
 *
 * A function can fail at the transport layer (`error`) or return 200 with an
 * `{ error }` body; both must reject, or a denied action looks like a success.
 */
export async function invokeFn(fn, body) {
  const { data, error } = await requireClient().functions.invoke(fn, { body });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return data;
}
