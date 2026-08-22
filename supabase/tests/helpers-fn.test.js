import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { serviceClient, createUser, signIn, resetDb, uniqueEmail } from './helpers.js';

const svc = serviceClient();
let admin, supervisor, trainer, otherTrainer, trainee;
let cAdmin, cSupervisor, cTrainer, cTrainee;

// Fixtures are built once: these checks are read-only with respect to one
// another, and the hosted project's auth endpoints are rate limited.
beforeAll(async () => {
  await resetDb();
  admin        = await createUser({ email: uniqueEmail(), role: 'admin' });
  supervisor   = await createUser({ email: uniqueEmail(), role: 'supervisor' });
  trainer      = await createUser({ email: uniqueEmail(), role: 'trainer' });
  otherTrainer = await createUser({ email: uniqueEmail(), role: 'trainer' });
  trainee      = await createUser({ email: uniqueEmail(), role: 'trainee' });

  await svc.from('supervisor_trainers')
    .insert({ supervisor_id: supervisor.id, trainer_id: trainer.id });

  [cAdmin, cSupervisor, cTrainer, cTrainee] = await Promise.all([
    signIn(admin.email), signIn(supervisor.email),
    signIn(trainer.email), signIn(trainee.email),
  ]);
});
afterAll(resetDb);

describe('app.my_role', () => {
  it('reports the caller role', async () => {
    const { data } = await cTrainer.rpc('my_role_probe');
    expect(data).toBe('trainer');
  });

  it('differs per caller', async () => {
    const { data } = await cTrainee.rpc('my_role_probe');
    expect(data).toBe('trainee');
  });
});

describe('app.is_active', () => {
  it('is true for an active profile', async () => {
    const { data } = await cTrainee.rpc('is_active_probe');
    expect(data).toBe(true);
  });
});

describe('app.is_admin', () => {
  it('is true for an admin', async () => {
    const { data } = await cAdmin.rpc('is_admin_probe');
    expect(data).toBe(true);
  });

  it('is false for a trainee', async () => {
    const { data } = await cTrainee.rpc('is_admin_probe');
    expect(data).toBe(false);
  });

  it('is false for a trainer', async () => {
    const { data } = await cTrainer.rpc('is_admin_probe');
    expect(data).toBe(false);
  });

  it('is false for a SUSPENDED admin', async () => {
    const victim = await createUser({ email: uniqueEmail(), role: 'admin' });
    const c = await signIn(victim.email);
    await svc.from('profiles').update({ status: 'suspended' }).eq('id', victim.id);
    const { data } = await c.rpc('is_admin_probe');
    expect(data).toBe(false);
  });
});

describe('app.supervises', () => {
  it('is true for a managed trainer', async () => {
    const { data } = await cSupervisor.rpc('supervises_probe', { target: trainer.id });
    expect(data).toBe(true);
  });

  it('is false for an unmanaged trainer', async () => {
    const { data } = await cSupervisor.rpc('supervises_probe', { target: otherTrainer.id });
    expect(data).toBe(false);
  });

  it('is false for a trainee asking about a trainer', async () => {
    const { data } = await cTrainee.rpc('supervises_probe', { target: trainer.id });
    expect(data).toBe(false);
  });

  it('is false for a trainer asking about themselves', async () => {
    const { data } = await cTrainer.rpc('supervises_probe', { target: trainer.id });
    expect(data).toBe(false);
  });
});

describe('RED TEAM: supervisor_trainers is not client-writable', () => {
  it('rejects a supervisor claiming another trainer', async () => {
    const { error } = await cSupervisor.from('supervisor_trainers')
      .insert({ supervisor_id: supervisor.id, trainer_id: otherTrainer.id });
    expect(error).not.toBeNull();
    const { data } = await svc.from('supervisor_trainers')
      .select('trainer_id').eq('supervisor_id', supervisor.id);
    expect(data.map((r) => r.trainer_id)).not.toContain(otherTrainer.id);
  });

  it('rejects a trainee inserting themselves as a supervisor', async () => {
    const { error } = await cTrainee.from('supervisor_trainers')
      .insert({ supervisor_id: trainee.id, trainer_id: trainer.id });
    expect(error).not.toBeNull();
  });

  it('rejects a supervisor deleting an assignment', async () => {
    await cSupervisor.from('supervisor_trainers').delete().eq('trainer_id', trainer.id);
    const { data } = await svc.from('supervisor_trainers')
      .select('trainer_id').eq('supervisor_id', supervisor.id);
    expect(data.map((r) => r.trainer_id)).toContain(trainer.id);
  });

  it('lets a supervisor READ their own assignments', async () => {
    const { data } = await cSupervisor.from('supervisor_trainers').select('trainer_id');
    expect(data.map((r) => r.trainer_id)).toContain(trainer.id);
  });

  it('does not leak another supervisor assignments', async () => {
    const { data } = await cTrainee.from('supervisor_trainers').select('trainer_id');
    expect(data ?? []).toHaveLength(0);
  });
});
