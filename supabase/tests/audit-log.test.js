import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  serviceClient, anonClient, createUser, signIn, resetDb, uniqueEmail,
  mustWrite,
} from './helpers.js';

const svc = serviceClient();
let admin, trainee, cAdmin, cTrainee, entryId;

beforeAll(async () => {
  await resetDb();
  admin   = await createUser({ email: uniqueEmail(), role: 'admin' });
  trainee = await createUser({ email: uniqueEmail(), role: 'trainee' });
  [cAdmin, cTrainee] = await Promise.all([signIn(admin.email), signIn(trainee.email)]);

  const { data } = await svc.from('audit_log').insert({
    actor_id: admin.id,
    action: 'test.action',
    entity_type: 'profile',
    entity_id: trainee.id,
    before: { role: 'trainee' },
    after: { role: 'trainer' },
  }).select().single();
  entryId = data.id;
});
afterAll(resetDb);

describe('audit_log access', () => {
  it('an admin can read it', async () => {
    const { data } = await cAdmin.from('audit_log').select('*');
    expect(data.length).toBeGreaterThan(0);
  });

  it('preserves the before and after payloads', async () => {
    const { data } = await cAdmin.from('audit_log').select('before,after').eq('id', entryId).single();
    expect(data.before).toEqual({ role: 'trainee' });
    expect(data.after).toEqual({ role: 'trainer' });
  });

  it('REJECTS a trainee reading it', async () => {
    const { data } = await cTrainee.from('audit_log').select('*');
    expect(data ?? []).toHaveLength(0);
  });

  it('REJECTS an anonymous read', async () => {
    const { data } = await anonClient().from('audit_log').select('*');
    expect(data ?? []).toHaveLength(0);
  });
});

describe('audit_log is append-only', () => {
  it('an admin cannot update an entry', async () => {
    await cAdmin.from('audit_log').update({ action: 'tampered' }).eq('id', entryId);
    const { data } = await svc.from('audit_log').select('action').eq('id', entryId).single();
    expect(data.action).toBe('test.action');
  });

  it('an admin cannot delete an entry', async () => {
    await cAdmin.from('audit_log').delete().eq('id', entryId);
    const { data } = await svc.from('audit_log').select('id').eq('id', entryId);
    expect(data).toHaveLength(1);
  });

  it('a trainee cannot delete an entry', async () => {
    await cTrainee.from('audit_log').delete().eq('id', entryId);
    const { data } = await svc.from('audit_log').select('id').eq('id', entryId);
    expect(data).toHaveLength(1);
  });

  // An audit trail that the application's own credentials can rewrite is not
  // an audit trail. The immutability trigger applies to service_role too.
  it('EVEN THE SERVICE ROLE cannot update an entry', async () => {
    const { error } = await svc.from('audit_log').update({ action: 'tampered' }).eq('id', entryId);
    expect(error).not.toBeNull();
    const { data } = await svc.from('audit_log').select('action').eq('id', entryId).single();
    expect(data.action).toBe('test.action');
  });

  it('EVEN THE SERVICE ROLE cannot delete an entry', async () => {
    const { error } = await svc.from('audit_log').delete().eq('id', entryId);
    expect(error).not.toBeNull();
    const { data } = await svc.from('audit_log').select('id').eq('id', entryId);
    expect(data).toHaveLength(1);
  });

  it('still accepts new entries', async () => {
    const { error } = await svc.from('audit_log').insert({
      actor_id: admin.id, action: `test.second.${Date.now()}`,
      entity_type: 'profile', entity_id: trainee.id,
    });
    expect(error).toBeNull();
  });
});

describe('audit_log integrity', () => {
  // actor_id is deliberately NOT a foreign key. A cascading SET NULL is an
  // UPDATE, which the append-only trigger refuses, so an FK here made any
  // user who had performed an audited action undeletable.
  it('lets the actor be deleted and keeps the record intact', async () => {
    // The log is append-only, so entries from previous runs are still here.
    // Scope the lookup to an action unique to this run.
    const action = `test.ghost.${Date.now()}`;
    const ghost = await createUser({ email: uniqueEmail(), role: 'admin', name: 'Ghost' });
    await mustWrite('insert audit_log', svc.from('audit_log').insert({
      actor_id: ghost.id, actor_email: ghost.email,
      action, entity_type: 'profile', entity_id: ghost.id,
    }));

    const { error } = await svc.auth.admin.deleteUser(ghost.id);
    expect(error).toBeNull();

    const { data: gone } = await svc.from('profiles').select('id').eq('id', ghost.id);
    expect(gone ?? []).toHaveLength(0);

    const { data } = await svc.from('audit_log')
      .select('actor_id,actor_email,action').eq('action', action).single();
    expect(data.actor_id).toBe(ghost.id);
    expect(data.actor_email).toBe(ghost.email);
  });
});
