import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { serviceClient, anonClient, resetDb, uniqueEmail } from './helpers.js';

const svc = serviceClient();

async function signUp(email, extraMetadata = {}) {
  const { data, error } = await anonClient().auth.signUp({
    email,
    password: 'Test-Passw0rd!',
    options: { data: { name: 'New Person', ...extraMetadata } },
  });
  if (error) throw error;
  return data.user;
}

async function profileOf(id) {
  const { data } = await svc.from('profiles').select('*').eq('id', id).single();
  return data;
}

beforeEach(async () => {
  await resetDb();
  // Asserted, not assumed. Every auto-approval test here depends on this row
  // existing; if the insert quietly fails, they instead report "expected
  // pending to be active", which points at the trigger rather than the
  // fixture and sends you looking in the wrong place.
  const { error } = await svc.from('allowed_domains').insert({ domain: 'speedpro-logis.com' });
  if (error) throw new Error(`fixture failed to seed allowed_domains: ${error.message}`);
});
afterAll(resetDb);

describe('signup provisioning', () => {
  it('creates a profile row for every new auth user', async () => {
    const user = await signUp(uniqueEmail('outside.com'));
    expect(await profileOf(user.id)).toBeTruthy();
  });

  it('activates a user whose domain is allowlisted', async () => {
    const user = await signUp(uniqueEmail('speedpro-logis.com'));
    const p = await profileOf(user.id);
    expect(p.status).toBe('active');
    expect(p.role).toBe('trainee');
  });

  it('queues a user whose domain is not allowlisted', async () => {
    const user = await signUp(uniqueEmail('outside.com'));
    const p = await profileOf(user.id);
    expect(p.status).toBe('pending');
    expect(p.role).toBe('trainee');
  });

  it('IGNORES a client-supplied role, which is the escalation vector', async () => {
    const user = await signUp(uniqueEmail('speedpro-logis.com'), { role: 'admin' });
    expect((await profileOf(user.id)).role).toBe('trainee');
  });

  it('IGNORES a client-supplied status', async () => {
    const user = await signUp(uniqueEmail('outside.com'), { status: 'active' });
    expect((await profileOf(user.id)).status).toBe('pending');
  });

  it('is case-insensitive about the domain', async () => {
    const user = await signUp(uniqueEmail('SPEEDPRO-LOGIS.COM'));
    expect((await profileOf(user.id)).status).toBe('active');
  });

  it('copies the name from signup metadata', async () => {
    const user = await signUp(uniqueEmail('speedpro-logis.com'));
    expect((await profileOf(user.id)).name).toBe('New Person');
  });

  it('falls back to the email local-part when no name is given', async () => {
    const email = uniqueEmail('speedpro-logis.com');
    const { data } = await anonClient().auth.signUp({ email, password: 'Test-Passw0rd!' });
    expect((await profileOf(data.user.id)).name).toBe(email.split('@')[0]);
  });

  it('creates a trainee_stats row alongside the profile', async () => {
    const user = await signUp(uniqueEmail('speedpro-logis.com'));
    const { data } = await svc.from('trainee_stats').select('*').eq('profile_id', user.id).single();
    expect(data.xp).toBe(0);
    expect(data.streak).toBe(0);
  });

  it('records the email on the profile', async () => {
    const email = uniqueEmail('speedpro-logis.com');
    const { data } = await anonClient().auth.signUp({ email, password: 'Test-Passw0rd!' });
    expect((await profileOf(data.user.id)).email).toBe(email);
  });
});

describe('allowed_domains is not client-readable', () => {
  it('rejects an anonymous read', async () => {
    const { data } = await anonClient().from('allowed_domains').select('domain');
    expect(data ?? []).toHaveLength(0);
  });
});
