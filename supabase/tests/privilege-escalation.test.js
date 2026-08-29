import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  serviceClient, anonClient, createUser, signIn, resetDb, uniqueEmail,
  mustWrite,
} from './helpers.js';

const svc = serviceClient();
let trainee, client, victim;

// Fixtures are built once and the escalation attempts are read-only with
// respect to each other, which keeps auth-endpoint usage well under the
// hosted project's rate limits.
beforeAll(async () => {
  await resetDb();
  trainee = await createUser({ email: uniqueEmail(), role: 'trainee', status: 'active' });
  victim  = await createUser({ email: uniqueEmail(), role: 'trainee', status: 'active' });
  client  = await signIn(trainee.email);
});
afterAll(resetDb);

async function stateOf(id) {
  const { data } = await svc.from('profiles').select('role,status').eq('id', id).single();
  return data;
}

describe('RED TEAM: a trainee tries to escalate', () => {
  it('cannot promote itself to admin', async () => {
    await client.from('profiles').update({ role: 'admin' }).eq('id', trainee.id);
    expect((await stateOf(trainee.id)).role).toBe('trainee');
  });

  it('cannot change its own status', async () => {
    await client.from('profiles').update({ status: 'suspended' }).eq('id', trainee.id);
    expect((await stateOf(trainee.id)).status).toBe('active');
  });

  it('cannot smuggle a role change alongside a legitimate name change', async () => {
    await client.from('profiles').update({ name: 'Legit', role: 'admin' }).eq('id', trainee.id);
    expect((await stateOf(trainee.id)).role).toBe('trainee');
  });

  it('cannot promote another user', async () => {
    await client.from('profiles').update({ role: 'admin' }).eq('id', victim.id);
    expect((await stateOf(victim.id)).role).toBe('trainee');
  });

  it('cannot insert a fresh admin profile row', async () => {
    const { error } = await client.from('profiles')
      .insert({ id: crypto.randomUUID(), role: 'admin', email: uniqueEmail(), name: 'X' });
    expect(error).not.toBeNull();
  });

  it('cannot delete its own profile to escape a suspension', async () => {
    await client.from('profiles').delete().eq('id', trainee.id);
    expect(await stateOf(trainee.id)).toBeTruthy();
  });

  it('cannot award itself XP', async () => {
    await client.from('trainee_stats').update({ xp: 999999 }).eq('profile_id', trainee.id);
    const { data } = await svc.from('trainee_stats').select('xp').eq('profile_id', trainee.id).single();
    expect(data.xp).toBe(0);
  });

  it('cannot add its own domain to the allowlist', async () => {
    const { error } = await client.from('allowed_domains').insert({ domain: 'evil.test' });
    expect(error).not.toBeNull();
  });
});

describe('legitimate self-service still works', () => {
  it('can change its own display name', async () => {
    const { error } = await client.from('profiles').update({ name: 'Amira A.' }).eq('id', trainee.id);
    expect(error).toBeNull();
    const { data } = await svc.from('profiles').select('name').eq('id', trainee.id).single();
    expect(data.name).toBe('Amira A.');
  });

  it('can change its own avatar', async () => {
    const { error } = await client.from('profiles').update({ avatar: 'AA' }).eq('id', trainee.id);
    expect(error).toBeNull();
  });

  it('cannot rename another user', async () => {
    await client.from('profiles').update({ name: 'Hacked' }).eq('id', victim.id);
    const { data } = await svc.from('profiles').select('name').eq('id', victim.id).single();
    expect(data.name).not.toBe('Hacked');
  });
});

describe('service role retains full control', () => {
  it('can promote a user', async () => {
    await mustWrite('update profiles', svc.from('profiles').update({ role: 'trainer' }).eq('id', victim.id));
    expect((await stateOf(victim.id)).role).toBe('trainer');
    await mustWrite('update profiles', svc.from('profiles').update({ role: 'trainee' }).eq('id', victim.id));
  });
});

/**
 * S4. anon held every privilege on profiles and trainee_stats — SELECT,
 * INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, on every column,
 * profiles.role and profiles.status included. Both tables predate the
 * `revoke all ... from anon, authenticated` line every table since has opened
 * with.
 *
 * Nothing was reachable through it, because RLS is on and every policy on
 * both tables is `to authenticated`. That is the part worth testing: the
 * grant made the refusal SILENT. A read returned [] and a delete reported 204
 * having matched nothing, so a policy written without `TO authenticated` —
 * which is what omitting the clause gives you — would have handed an
 * anonymous caller the user table with nothing anywhere to say so.
 *
 * These assert the loud failure, not the quiet one. `permission denied` is
 * the whole point; an empty array would mean the grant is back.
 */
describe('RED TEAM: a caller with only the public anon key', () => {
  const anon = anonClient();

  const denied = (error) => {
    expect(error).toBeTruthy();
    // 42501 is permission denied. RLS filtering to nothing does not raise.
    expect(error.code).toBe('42501');
  };

  it('is refused reading profiles outright, not handed an empty list', async () => {
    const { error } = await anon.from('profiles').select('id, email, role');
    denied(error);
  });

  it('is refused reading trainee_stats', async () => {
    const { error } = await anon.from('trainee_stats').select('profile_id, xp');
    denied(error);
  });

  it('cannot delete profiles', async () => {
    const { error } = await anon.from('profiles').delete().eq('id', victim.id);
    denied(error);
    expect(await stateOf(victim.id)).toBeTruthy();
  });

  it('cannot rewrite somebody\'s XP', async () => {
    const { error } = await anon.from('trainee_stats').update({ xp: 999999 })
      .eq('profile_id', victim.id);
    denied(error);
  });

  it('cannot insert an active admin profile', async () => {
    const { error } = await anon.from('profiles').insert({
      id: '11111111-1111-1111-1111-111111111111',
      email: 'x@example.com', name: 'x', role: 'admin', status: 'active',
    });
    denied(error);
  });

  /**
   * The signup trigger is SECURITY DEFINER and runs as the owner, so revoking
   * anon must not have broken account creation. It fires on any insert into
   * auth.users, which is now always an administrator (S2). Without this, the
   * revoke could silently take account provisioning with it.
   */
  it('still gets a profile and stats row when an admin creates one', async () => {
    const email = uniqueEmail();
    const { data, error } = await svc.auth.admin.createUser({
      email, password: 'Test-Passw0rd!', email_confirm: true,
    });
    expect(error).toBeNull();

    const { data: profile } = await svc.from('profiles')
      .select('role, status').eq('id', data.user.id).single();
    expect(profile).toMatchObject({ role: 'trainee', status: 'pending' });

    const { data: stats } = await svc.from('trainee_stats')
      .select('xp').eq('profile_id', data.user.id).single();
    expect(stats.xp).toBe(0);

    await svc.auth.admin.deleteUser(data.user.id);
  });
});
