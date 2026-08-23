import { supabase, requireClient } from './client';
import { unwrap } from './helpers';

const normalise = (email) => String(email ?? '').trim().toLowerCase();

export async function signIn(email, password) {
  return unwrap(await requireClient().auth.signInWithPassword({
    email: normalise(email), password,
  }));
}

/**
 * Registers a user. Only `name` is sent as metadata: the database trigger
 * decides role and status, so passing a role here would achieve nothing.
 */
export async function signUp({ email, password, name }) {
  return unwrap(await requireClient().auth.signUp({
    email: normalise(email),
    password,
    options: { data: { name: String(name ?? '').trim() } },
  }));
}

export async function signOut() {
  const { error } = await requireClient().auth.signOut();
  if (error) throw new Error(error.message);
}

export async function resetPassword(email) {
  const { error } = await requireClient().auth.resetPasswordForEmail(normalise(email), {
    redirectTo: `${window.location.origin}/reset-password`,
  });
  if (error) throw new Error(error.message);
}

/**
 * Session lookup degrades to "nobody is signed in" rather than throwing.
 * This runs on first paint, so a failure here must never stop the app from
 * rendering — the readable configuration error belongs on the sign-in attempt.
 */
export async function getSession() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data?.session ?? null;
}

export function onAuthChange(callback) {
  if (!supabase) return () => {};
  const { data } = supabase.auth.onAuthStateChange((_event, session) => callback(session));
  return () => data?.subscription?.unsubscribe();
}
