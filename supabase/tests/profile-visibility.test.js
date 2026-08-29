import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  serviceClient, anonClient, createUser, signIn, resetDb, uniqueEmail,
  mustWrite,
} from './helpers.js';

const svc = serviceClient();
let admin, supervisor, trainer, otherTrainer, traineeA, traineeB;
let cAdmin, cSupervisor, cTraineeA;

beforeAll(async () => {
  await resetDb();
  admin        = await createUser({ email: uniqueEmail(), role: 'admin',      name: 'Admin' });
  supervisor   = await createUser({ email: uniqueEmail(), role: 'supervisor', name: 'Super' });
  trainer      = await createUser({ email: uniqueEmail(), role: 'trainer',    name: 'Trainer' });
  otherTrainer = await createUser({ email: uniqueEmail(), role: 'trainer',    name: 'Other Trainer' });
  traineeA     = await createUser({ email: uniqueEmail(), role: 'trainee',    name: 'Amira' });
  traineeB     = await createUser({ email: uniqueEmail(), role: 'trainee',    name: 'Marcus' });

  await mustWrite('insert supervisor_trainers', svc.from('supervisor_trainers')
    .insert({ supervisor_id: supervisor.id, trainer_id: trainer.id }));

  [cAdmin, cSupervisor, cTraineeA] = await Promise.all([
    signIn(admin.email), signIn(supervisor.email), signIn(traineeA.email),
  ]);
});
afterAll(resetDb);

describe('RED TEAM: email harvesting', () => {
  it('an anonymous visitor reads no profiles at all', async () => {
    const { data } = await anonClient().from('profiles').select('email');
    expect(data ?? []).toHaveLength(0);
  });

  it('a trainee cannot read another trainee email', async () => {
    const { data } = await cTraineeA.from('profiles').select('email').eq('id', traineeB.id);
    expect(data ?? []).toHaveLength(0);
  });

  it('a trainee cannot enumerate the whole user table', async () => {
    const { data } = await cTraineeA.from('profiles').select('id,email');
    expect(data).toHaveLength(1);
    expect(data[0].id).toBe(traineeA.id);
  });

  it('a trainee cannot read another user gamification stats', async () => {
    const { data } = await cTraineeA.from('trainee_stats').select('xp').eq('profile_id', traineeB.id);
    expect(data ?? []).toHaveLength(0);
  });

  it('a supervisor cannot read an unmanaged trainer profile', async () => {
    const { data } = await cSupervisor.from('profiles').select('id').eq('id', otherTrainer.id);
    expect(data ?? []).toHaveLength(0);
  });

  it('a supervisor cannot read an arbitrary trainee profile', async () => {
    const { data } = await cSupervisor.from('profiles').select('id').eq('id', traineeB.id);
    expect(data ?? []).toHaveLength(0);
  });
});

describe('legitimate visibility', () => {
  it('a trainee reads their own profile', async () => {
    const { data } = await cTraineeA.from('profiles').select('email').eq('id', traineeA.id).single();
    expect(data.email).toBe(traineeA.email);
  });

  it('an admin reads every profile', async () => {
    const { data } = await cAdmin.from('profiles').select('id');
    expect(data.length).toBeGreaterThanOrEqual(6);
  });

  it('an admin reads gamification stats', async () => {
    const { data } = await cAdmin.from('trainee_stats').select('profile_id').eq('profile_id', traineeB.id);
    expect(data).toHaveLength(1);
  });

  it('a supervisor reads a managed trainer profile', async () => {
    const { data } = await cSupervisor.from('profiles').select('id,name').eq('id', trainer.id);
    expect(data).toHaveLength(1);
    expect(data[0].name).toBe('Trainer');
  });

  it('a supervisor still reads their own profile', async () => {
    const { data } = await cSupervisor.from('profiles').select('id').eq('id', supervisor.id);
    expect(data).toHaveLength(1);
  });
});

describe('public_profiles view', () => {
  it('lets a trainee see display names for chat', async () => {
    const { data } = await cTraineeA.from('public_profiles')
      .select('id,name,role').eq('id', traineeB.id).single();
    expect(data.name).toBe('Marcus');
    expect(data.role).toBe('trainee');
  });

  it('does NOT expose email — the column does not exist on the view', async () => {
    const { error } = await cTraineeA.from('public_profiles').select('email').limit(1);
    expect(error).not.toBeNull();
  });

  it('is closed to anonymous visitors', async () => {
    const { data, error } = await anonClient().from('public_profiles').select('id');
    expect(error ?? (data ?? []).length === 0).toBeTruthy();
  });

  it('hides suspended and pending accounts', async () => {
    const pending = await createUser({ email: uniqueEmail(), role: 'trainee', status: 'pending', name: 'Ghost' });
    const { data } = await cTraineeA.from('public_profiles').select('id').eq('id', pending.id);
    expect(data ?? []).toHaveLength(0);
  });
});
