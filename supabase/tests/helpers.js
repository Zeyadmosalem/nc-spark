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

/**
 * Retries an auth call that failed at the transport layer.
 *
 * One run makes a few hundred auth round trips to a hosted service over the
 * internet, and a single `AuthRetryableFetchError: fetch failed` takes a whole
 * file's beforeAll with it — 30 tests skipped, with a message that says
 * nothing about the code under test. supabase-js names the error retryable and
 * then hands it back for the caller to deal with; this is that.
 *
 * Only transport failures are retried. An HTTP refusal — wrong password, rate
 * limited, user missing — is a real answer and is returned on the first try.
 */
async function retryTransport(run, attempts = 3) {
  for (let attempt = 1; ; attempt += 1) {
    const result = await run();
    const error = result?.error;
    const transport = error
      && (error.name === 'AuthRetryableFetchError'
        || /fetch failed|network|ECONNRESET|ETIMEDOUT|socket hang up/i.test(error.message ?? ''));

    if (!transport || attempt >= attempts) return result;
    await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
  }
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
  const { data, error } = await retryTransport(() => svc.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { name },
  }));
  if (error) throw error;

  const { error: upErr } = await svc
    .from('profiles').update({ role, status }).eq('id', data.user.id);
  if (upErr) throw upErr;

  return { id: data.user.id, email, password, role, status, name };
}

/** Returns a client authenticated as the given user. */
export async function signIn(email, password = 'Test-Passw0rd!') {
  const client = anonClient();
  const { error } = await retryTransport(
    () => client.auth.signInWithPassword({ email, password }));
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

/**
 * Builds a `become(email)` for a test file that plays several people in turn.
 *
 * Fourteen files each had their own copy of this, in four variants that had
 * drifted apart — and the fix that matters most, caching the session, had
 * reached three of them. The other eleven signed in from scratch on every
 * switch, which is what makes a long file fail against the hosted project's
 * auth rate limit while presenting as a permissions bug.
 *
 * Two things here are not obvious, and are the reason this is shared rather
 * than written out per file:
 *
 * - The session cache, and the absence of a signOut() before each sign-in,
 *   which is what makes the cache work at all. A file with seven people
 *   switching between them dozens of times is otherwise dozens of password
 *   grants against an endpoint that throttles.
 * - realtime.setAuth. The socket keeps the token it was opened with, so one
 *   client signing in as several people leaves a subscription authenticated as
 *   whoever ran first. No browser ever does this, which is why the app has no
 *   equivalent and why it belongs here rather than in production code.
 *
 * The cache lives in the closure, so one file cannot hand another a stale
 * session.
 */
export function becomeWith(client, password = 'Test-Passw0rd!') {
  const sessions = new Map();

  const become = async (email) => {
    const cached = sessions.get(email);
    if (cached) {
      const { data, error } = await client.auth.setSession(cached);
      if (!error) {
        await client.realtime.setAuth(data.session.access_token);
        return;
      }
      // A refresh token can expire mid-run; fall through and sign in properly.
      sessions.delete(email);
    }

    // No signOut() first, deliberately. signInWithPassword replaces the
    // session anyway, and signing out INVALIDATES the tokens this cache just
    // stored: setSession then fails with "Auth session missing!" for anyone
    // signed out since. Measured over one full run, that made the cache miss
    // every real identity switch and hit only when becoming whoever was
    // already signed in — 73 password grants for 80 attempts. Without it, the
    // same switching pattern costs one grant per person.
    const { data, error } = await retryTransport(
      () => client.auth.signInWithPassword({ email, password }));
    if (error) throw new Error(`could not sign in as ${email}: ${error.message}`);

    sessions.set(email, {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    });
    await client.realtime.setAuth(data.session.access_token);
  };

  /**
   * Drops the cache, for a test that signs out on purpose and needs the next
   * become to really sign in rather than restore a session.
   */
  become.forget = () => sessions.clear();

  return become;
}
