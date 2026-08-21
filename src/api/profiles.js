import { supabase } from './client';

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
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from('profiles').select('*').eq('id', user.id).maybeSingle();
  if (error) throw new Error(error.message);
  return toCamel(data);
}

export async function updateMyProfile({ name, avatar }) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');
  const { data, error } = await supabase
    .from('profiles').update({ name, avatar }).eq('id', user.id).select().single();
  if (error) throw new Error(error.message);
  return toCamel(data);
}

async function invokeAdmin(fn, body) {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return data;
}

export const setUserRole = (userId, role) =>
  invokeAdmin('admin-set-role', { userId, role });

export const reviewSignup = (userId, decision, role) =>
  invokeAdmin('admin-review-signup', { userId, decision, role });

export const suspendUser = (userId, suspend) =>
  invokeAdmin('admin-suspend-user', { userId, suspend });
