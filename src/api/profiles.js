import { supabase, requireClient } from './client';
import { unwrap, invokeFn, currentUserId } from './helpers';

/**
 * Exactly the columns toCamel reads. Named rather than select('*') so a column
 * a later migration adds does not reach the browser just by existing.
 */
const PROFILE_COLUMNS = 'id, role, status, name, email, avatar, created_at';

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

/**
 * Runs on first paint from useSession, so — like getSession — it reports
 * "nobody is signed in" rather than throwing. The readable configuration
 * error belongs on an action the user took, not on page load.
 */
export async function fetchMyProfile() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  const id = data?.session?.user?.id;
  if (!id) return null;
  return toCamel(unwrap(await supabase
    .from('profiles').select(PROFILE_COLUMNS).eq('id', id).maybeSingle()));
}

export async function updateMyProfile({ name, avatar }) {
  const id = await currentUserId();
  return toCamel(unwrap(await requireClient()
    .from('profiles').update({ name, avatar }).eq('id', id).select().single()));
}

export const setUserRole = (userId, role) =>
  invokeFn('admin-set-role', { userId, role });

export const reviewSignup = (userId, decision, role) =>
  invokeFn('admin-review-signup', { userId, decision, role });

export const suspendUser = (userId, suspend) =>
  invokeFn('admin-suspend-user', { userId, suspend });
