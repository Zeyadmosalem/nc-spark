import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'HttpError';
  }
}

export type Role = 'admin' | 'supervisor' | 'trainer' | 'trainee';
export type Status = 'pending' | 'active' | 'suspended' | 'rejected';

export interface Profile {
  id: string;
  role: Role;
  status: Status;
  name: string;
  email: string;
}

export function serviceClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );
}

/**
 * Verifies the caller and returns their profile READ FROM THE DATABASE.
 *
 * The JWT role claim is deliberately ignored: it can be up to an hour stale,
 * and a privileged write must never act on stale authority. A user suspended
 * thirty seconds ago still holds a valid token saying otherwise.
 */
export async function requireRole(
  req: Request,
  roles: Role[],
): Promise<{ profile: Profile; service: SupabaseClient }> {
  const header = req.headers.get('Authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) throw new HttpError(401, 'Missing bearer token');

  const service = serviceClient();
  const { data: userData, error: userErr } = await service.auth.getUser(token);
  if (userErr || !userData?.user) throw new HttpError(401, 'Invalid token');

  const { data: profile, error } = await service
    .from('profiles')
    .select('id, role, status, name, email')
    .eq('id', userData.user.id)
    .single();

  if (error || !profile) throw new HttpError(403, 'No profile');
  if (profile.status !== 'active') throw new HttpError(403, 'Account is not active');
  if (!roles.includes(profile.role as Role)) throw new HttpError(403, 'Insufficient role');

  return { profile: profile as Profile, service };
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    return await req.json();
  } catch {
    throw new HttpError(400, 'Body must be valid JSON');
  }
}

export function jsonResponse(body: unknown, headers: Record<string, string>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}

/**
 * Turns a thrown error into a response.
 *
 * Deliberate 4xx messages are the API's contract and are returned verbatim —
 * "Finish the previous module first" is meant to be read by a trainee. A 5xx
 * is different: its message is usually raw Postgres text naming columns and
 * constraints, which tells an attacker about the schema and tells the user
 * nothing useful. Those are logged in full and replaced with a reference the
 * caller can quote, so a support request stays traceable to one log line.
 */
export function errorResponse(err: unknown, headers: Record<string, string>): Response {
  const status = err instanceof HttpError ? err.status : 500;

  if (status >= 500) {
    const ref = crypto.randomUUID().slice(0, 8);
    console.error(`[${ref}] Unhandled function error:`, err);
    return jsonResponse({ error: 'Something went wrong. Reference: ' + ref, ref }, headers, status);
  }

  const message = err instanceof Error ? err.message : 'Unexpected error';
  return jsonResponse({ error: message }, headers, status);
}
