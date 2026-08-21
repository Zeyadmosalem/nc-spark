import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { serviceClient, createUser, signIn, resetDb, uniqueEmail } from './helpers.js';

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
    await svc.from('profiles').update({ role: 'trainer' }).eq('id', victim.id);
    expect((await stateOf(victim.id)).role).toBe('trainer');
    await svc.from('profiles').update({ role: 'trainee' }).eq('id', victim.id);
  });
});
