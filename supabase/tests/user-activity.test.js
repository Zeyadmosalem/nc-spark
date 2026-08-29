// Usage tracking, against the live project.
//
// Two things can be quietly wrong here and a mocked test would catch neither:
// whether touch_activity records the CALLER (rather than accepting a user id
// from whoever calls it), and whether one person's usage is visible to
// another. Both are properties of the definer function and the policies.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { serviceClient, createUser, uniqueEmail, applyAppEnv } from './helpers.js';

applyAppEnv();

const { supabase } = await import('../../src/api/client.js');

const svc = serviceClient();
const PASSWORD = 'Test-Passw0rd!';

let alice, bob, admin;
const madeUsers = [];

async function mk(role, name) {
  const u = await createUser({ email: uniqueEmail(), role, name });
  madeUsers.push(u.id);
  return u;
}

const sessions = new Map();
async function become(email) {
  const cached = sessions.get(email);
  if (cached) {
    const { error } = await supabase.auth.setSession(cached);
    if (!error) return;
    sessions.delete(email);
  }
  await supabase.auth.signOut();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`could not sign in as ${email}: ${error.message}`);
  sessions.set(email, {
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  });
}

const rowFor = async (id) => (await svc
  .from('user_activity').select('hits, day, last_seen_at').eq('user_id', id).maybeSingle()).data;

beforeAll(async () => {
  alice = await mk('trainee', 'Alice Ahmed');
  bob = await mk('trainee', 'Bob Brown');
  admin = await mk('admin', 'Ada Admin');
}, 90000);

afterAll(async () => {
  await supabase.auth.signOut();
  for (const id of madeUsers) {
    await svc.auth.admin.deleteUser(id).catch(() => null);
  }
});

describe('recording a visit', () => {
  it('creates today\'s row on the first call', async () => {
    await become(alice.email);
    const { error } = await supabase.rpc('touch_activity');
    expect(error).toBeNull();

    const row = await rowFor(alice.id);
    expect(row.hits).toBe(1);
    expect(row.day).toBe(new Date().toISOString().slice(0, 10));
  });

  it('counts the next visit on the same row', async () => {
    await become(alice.email);
    await supabase.rpc('touch_activity');
    await supabase.rpc('touch_activity');

    const row = await rowFor(alice.id);
    expect(row.hits).toBe(3);
  });

  /**
   * The function takes no arguments, so there is no shape of call that writes
   * somebody else's row. This is the test that would fail if a future version
   * "helpfully" accepted a user id.
   */
  it('records the caller and nobody else', async () => {
    await become(bob.email);
    await supabase.rpc('touch_activity');

    expect((await rowFor(bob.id)).hits).toBe(1);
    // Alice's count is untouched by Bob signing in.
    expect((await rowFor(alice.id)).hits).toBe(3);
  });

  it('does nothing for a signed-out caller', async () => {
    await supabase.auth.signOut();
    sessions.clear();
    const before = (await svc.from('user_activity').select('user_id')).data.length;
    await supabase.rpc('touch_activity');
    const after = (await svc.from('user_activity').select('user_id')).data.length;
    expect(after).toBe(before);
  });
});

describe('who may read it', () => {
  it('lets somebody see their own usage', async () => {
    await become(alice.email);
    const { data } = await supabase.from('user_activity').select('user_id, hits');
    expect(data.length).toBeGreaterThan(0);
    expect(data.every((r) => r.user_id === alice.id)).toBe(true);
  });

  /** Not vacuous: the same call returns rows for Alice above. */
  it('does not let one person read another\'s', async () => {
    await become(bob.email);
    const { data } = await supabase.from('user_activity').select('user_id');
    expect(data.some((r) => r.user_id === alice.id)).toBe(false);
  });

  it('lets an admin see everybody', async () => {
    await become(admin.email);
    const { data } = await supabase.from('user_activity').select('user_id');
    const seen = new Set(data.map((r) => r.user_id));
    expect(seen.has(alice.id)).toBe(true);
    expect(seen.has(bob.id)).toBe(true);
  });

  it('refuses a client that tries to write activity directly', async () => {
    await become(bob.email);
    const { error } = await supabase.from('user_activity')
      .insert({ user_id: alice.id, day: '2020-01-01', hits: 9999 });
    expect(error).toBeTruthy();
  });
});

describe('the summary an administrator reads', () => {
  it('reports each account with its usage', async () => {
    await become(admin.email);
    const { data, error } = await supabase
      .from('user_activity_summary')
      .select('user_id, name, role, last_seen_at, days_active_30, visits_30');
    expect(error).toBeNull();

    const forAlice = data.find((r) => r.user_id === alice.id);
    expect(forAlice).toMatchObject({ name: 'Alice Ahmed', role: 'trainee', visits_30: 3 });
    expect(forAlice.days_active_30).toBe(1);
    expect(forAlice.last_seen_at).toBeTruthy();
  });

  /**
   * An account nobody has ever used is the most interesting row on that
   * screen, so it has to appear with a null rather than be dropped by the
   * join.
   */
  it('includes an account that has never been seen', async () => {
    const ghost = await mk('trainee', 'Never Signedin');
    await become(admin.email);

    const { data } = await supabase
      .from('user_activity_summary').select('user_id, last_seen_at, visits_30');
    const row = data.find((r) => r.user_id === ghost.id);

    expect(row).toBeTruthy();
    expect(row.last_seen_at).toBeNull();
    expect(row.visits_30).toBe(0);
  });

  /** security_invoker: the same view returns only your own row to a trainee. */
  it('returns only their own row to a trainee', async () => {
    await become(alice.email);
    const { data } = await supabase.from('user_activity_summary').select('user_id');
    expect(data.map((r) => r.user_id)).toEqual([alice.id]);
  });
});
