import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';

// Prefer a local stack when one is configured, so `supabase start` followed by
// `npm run db:env` switches the suite to local without editing anything. Falls
// back to the hosted dev project.
const localPath = new URL('../../.env.test.local', import.meta.url);
const hostedPath = new URL('../../.env.test', import.meta.url);
const envPath = existsSync(localPath) ? localPath : hostedPath;

export const TARGET = existsSync(localPath) ? 'local' : 'hosted';

const env = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split('\n')
    .filter((l) => l.trim() && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);

/**
 * Publishes the project's credentials as the VITE_ names src/api/client.js
 * reads, so a test can exercise the real api layer.
 *
 * Call this BEFORE the dynamic import of anything under src/api/: client.js
 * reads import.meta.env at module scope, so a static import would evaluate it
 * first and get an unconfigured client.
 *
 * This block used to be copy-pasted into twelve test files verbatim.
 */
export function applyAppEnv() {
  process.env.VITE_SUPABASE_URL = env.SUPABASE_URL;
  process.env.VITE_SUPABASE_ANON_KEY = env.SUPABASE_ANON_KEY;
}

export const SUPABASE_URL = env.SUPABASE_URL;
export const DB_URL = env.SUPABASE_DB_URL;
export const PROJECT_REF = env.SUPABASE_PROJECT_REF;

const clientOpts = { auth: { persistSession: false, autoRefreshToken: false } };

/** Bypasses RLS. Use only for setup and assertions, never to prove access. */
export function serviceClient() {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, clientOpts);
}

/** An unauthenticated client, exactly what a browser starts with. */
export function anonClient() {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, clientOpts);
}

/** Creates a confirmed auth user, then forces role/status via service role. */
export async function createUser({
  email,
  password = 'Test-Passw0rd!',
  role = 'trainee',
  status = 'active',
  name = 'Test User',
}) {
  const svc = serviceClient();
  const { data, error } = await svc.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { name },
  });
  if (error) throw error;

  const { error: upErr } = await svc
    .from('profiles').update({ role, status }).eq('id', data.user.id);
  if (upErr) throw upErr;

  return { id: data.user.id, email, password, role, status, name };
}

/** Returns a client authenticated as the given user. */
export async function signIn(email, password = 'Test-Passw0rd!') {
  const client = anonClient();
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return client;
}

/** Removes every auth user and their cascading rows. Dev project only. */
// Accounts on this domain survive resetDb. The review environment shares one
// Supabase project with the test suite, so without this every db test run
// silently deletes the logins someone is using to look at the site.
export const REVIEW_DOMAIN = 'ncspark-review.local';

export async function resetDb() {
  const svc = serviceClient();
  const { data } = await svc.auth.admin.listUsers({ perPage: 1000 });
  for (const u of data?.users ?? []) {
    if (u.email?.endsWith(`@${REVIEW_DOMAIN}`)) continue;
    await svc.auth.admin.deleteUser(u.id);
  }
  await svc.from('allowed_domains').delete().neq('domain', '');
}

/** Unique email per test run to avoid collisions across reruns. */
let n = 0;
export const uniqueEmail = (domain = 'example.com') =>
  `user${Date.now()}-${n++}@${domain}`;
