import { supabase } from './client';

const normalise = (email) => String(email ?? '').trim().toLowerCase();

function unwrap({ data, error }) {
  if (error) throw new Error(error.message);
  return data;
}

export async function signIn(email, password) {
  return unwrap(await supabase.auth.signInWithPassword({
    email: normalise(email), password,
  }));
}

/**
 * Registers a user. Only `name` is sent as metadata: the database trigger
 * decides role and status, so passing a role here would achieve nothing.
 */
export async function signUp({ email, password, name }) {
  return unwrap(await supabase.auth.signUp({
    email: normalise(email),
    password,
    options: { data: { name: String(name ?? '').trim() } },
  }));
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error(error.message);
}

export async function resetPassword(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(normalise(email), {
    redirectTo: `${window.location.origin}/reset-password`,
  });
  if (error) throw new Error(error.message);
}

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data?.session ?? null;
}

export function onAuthChange(callback) {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => callback(session));
  return () => data?.subscription?.unsubscribe();
}
