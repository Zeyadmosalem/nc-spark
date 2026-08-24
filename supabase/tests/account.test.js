// The account page's api, against the live project.
//
// What a trainee may NOT change about itself is already covered twelve ways in
// privilege-escalation.test.js, at the SQL level. This is the other half: that
// the two columns the grant does cover actually round-trip through the api the
// page calls.
//
// The specific risk a mocked test cannot see is the `.select().single()` on
// the end of the update. An UPDATE that succeeds but whose returning row is
// filtered out by the SELECT policy comes back as an error, not as a silent
// null — so the write would land and the page would still report failure.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { serviceClient, createUser, uniqueEmail } from './helpers.js';

const localPath = new URL('../../.env.test.local', import.meta.url);
const hostedPath = new URL('../../.env.test', import.meta.url);
const env = Object.fromEntries(
  readFileSync(existsSync(localPath) ? localPath : hostedPath, 'utf8')
    .split('\n')
    .filter((l) => l.trim() && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }));

process.env.VITE_SUPABASE_URL = env.SUPABASE_URL;
process.env.VITE_SUPABASE_ANON_KEY = env.SUPABASE_ANON_KEY;

const { supabase } = await import('../../src/api/client.js');
const { updateMyProfile, fetchMyProfile } = await import('../../src/api/profiles.js');
const { changePassword, signIn } = await import('../../src/api/auth.js');

const svc = serviceClient();
const PASSWORD = 'Test-Passw0rd!';
const madeUsers = [];

let trainee;

async function mk(role) {
  const u = await createUser({ email: uniqueEmail(), role });
  madeUsers.push(u.id);
  return u;
}

beforeAll(async () => {
  trainee = await mk('trainee');
  await supabase.auth.signOut();
  await signIn(trainee.email, PASSWORD);
}, 60000);

afterAll(async () => {
  await supabase.auth.signOut();
  for (const id of madeUsers) {
    await svc.auth.admin.deleteUser(id).catch(() => null);
  }
});

describe('editing your own profile', () => {
  it('saves a name and reads it back', async () => {
    const updated = await updateMyProfile({ name: 'Renamed Person', avatar: 'RP' });
    expect(updated.name).toBe('Renamed Person');
    expect(updated.avatar).toBe('RP');

    // Through fetchMyProfile too, which is what useSession reloads with.
    const fresh = await fetchMyProfile();
    expect(fresh.name).toBe('Renamed Person');
  });

  /** An empty badge is "no badge". The column is nullable for exactly this. */
  it('clears the badge with null', async () => {
    await updateMyProfile({ name: 'Renamed Person', avatar: null });
    const fresh = await fetchMyProfile();
    expect(fresh.avatar).toBeNull();
  });

  /**
   * The grant is `update (name, avatar)`. The page never offers these, and
   * this is why it does not have to: the request fails at the grant rather
   * than at anything the UI remembered to leave out.
   */
  it('cannot reach role or status through the same client', async () => {
    const { error } = await supabase
      .from('profiles').update({ role: 'admin' }).eq('id', trainee.id);
    expect(error).toBeTruthy();

    const { data } = await svc.from('profiles').select('role').eq('id', trainee.id).single();
    expect(data.role).toBe('trainee');
  });
});

describe('changing your own password', () => {
  const NEXT = 'Test-Passw0rd!2';

  it('takes effect on the next sign-in', async () => {
    await changePassword(NEXT);
    await supabase.auth.signOut();

    await expect(signIn(trainee.email, PASSWORD)).rejects.toThrow();
    const session = await signIn(trainee.email, NEXT);
    expect(session.user.id).toBe(trainee.id);
  });

  /** Supabase refuses a no-op, and the message is worth surfacing verbatim. */
  it('says something useful when the new password is the old one', async () => {
    await expect(changePassword(NEXT)).rejects.toThrow(/different|same/i);
  });
});
