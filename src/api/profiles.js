import { supabase } from './client';
import { unwrap, invokeFn, currentUserId } from './helpers';

/** The single place snake_case becomes camelCase. */
export function toCamel(row) {
  if (!row) return null;
  return {
    id: row.id,
    role: row.role,
    status: row.status,
    name: row.name,
    email: row.email,
    avatar: row.avatar,
    createdAt: row.created_at,
  };
}

export async function fetchMyProfile() {
  const { data } = await supabase.auth.getSession();
  const id = data?.session?.user?.id;
  if (!id) return null;
  return toCamel(unwrap(await supabase
    .from('profiles').select('*').eq('id', id).maybeSingle()));
}

export async function updateMyProfile({ name, avatar }) {
  const id = await currentUserId();
  return toCamel(unwrap(await supabase
    .from('profiles').update({ name, avatar }).eq('id', id).select().single()));
}

export const setUserRole = (userId, role) =>
  invokeFn('admin-set-role', { userId, role });

export const reviewSignup = (userId, decision, role) =>
  invokeFn('admin-review-signup', { userId, decision, role });

export const suspendUser = (userId, suspend) =>
  invokeFn('admin-suspend-user', { userId, suspend });
