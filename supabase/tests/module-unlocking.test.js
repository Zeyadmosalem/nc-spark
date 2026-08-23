import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { serviceClient, createUser, signIn, resetDb, uniqueEmail } from './helpers.js';

const svc = serviceClient();
const PREFIX = `unl${Date.now()}`;
let trainer, trainee, cTrainee;
let courseId, modA, modB, modC, actA1, actA2, actB1, enrolId;

beforeAll(async () => {
  await resetDb();
  trainer = await createUser({ email: uniqueEmail(), role: 'trainer' });
  trainee = await createUser({ email: uniqueEmail(), role: 'trainee' });

  const { data: c } = await svc.from('courses').insert({
    slug: `${PREFIX}-1`, title: 'Unlock Course', status: 'published',
    trainer_id: trainer.id, created_by: trainer.id,
  }).select().single();
  courseId = c.id;

  // A (no prerequisite) -> B (needs A) -> C (needs B)
  const mk = async (title, position, after) => {
    const { data } = await svc.from('modules')
      .insert({ course_id: courseId, title, position, unlock_after_module_id: after })
      .select().single();
    return data.id;
  };
  modA = await mk('A', 1, null);
  modB = await mk('B', 2, modA);
  modC = await mk('C', 3, modB);

  const act = async (moduleId, position) => {
    const { data } = await svc.from('activities')
      .insert({ module_id: moduleId, type: 'reading', title: `R${position}`, position, content: { body: 'x' } })
      .select().single();
    return data.id;
  };
  actA1 = await act(modA, 1);
  actA2 = await act(modA, 2);
  actB1 = await act(modB, 1);

  const { data: e } = await svc.from('enrollments')
    .insert({ trainee_id: trainee.id, course_id: courseId, status: 'active' }).select().single();
  enrolId = e.id;

  cTrainee = await signIn(trainee.email);
});
afterAll(async () => {
  await svc.from('courses').delete().like('slug', `${PREFIX}-%`);
  await resetDb();
});

const unlocked = async (moduleId) => {
  const { data } = await cTrainee.rpc('is_module_unlocked_probe', {
    enrollment: enrolId, module: moduleId,
  });
  return data;
};

const svcUnlocked = async (moduleId) => {
  const { data } = await svc.rpc('is_module_unlocked_for', {
    enrollment: enrolId, module: moduleId,
  });
  return data;
};

describe('app.is_module_unlocked', () => {
  it('a module with no prerequisite is unlocked from the start', async () => {
    expect(await unlocked(modA)).toBe(true);
  });

  it('a module whose prerequisite is untouched is locked', async () => {
    expect(await unlocked(modB)).toBe(false);
  });

  it('stays locked when the prerequisite is only PARTLY complete', async () => {
    await svc.from('activity_completions').insert({ enrollment_id: enrolId, activity_id: actA1 });
    expect(await unlocked(modB)).toBe(false);
  });

  it('unlocks once every activity in the prerequisite is complete', async () => {
    await svc.from('activity_completions').insert({ enrollment_id: enrolId, activity_id: actA2 });
    expect(await unlocked(modB)).toBe(true);
  });

  it('does not unlock the module after next', async () => {
    expect(await unlocked(modC)).toBe(false);
  });

  it('unlocks C once B is finished too', async () => {
    await svc.from('activity_completions').insert({ enrollment_id: enrolId, activity_id: actB1 });
    expect(await unlocked(modC)).toBe(true);
  });

  it('treats an EMPTY prerequisite module as satisfied', async () => {
    const { data: empty } = await svc.from('modules')
      .insert({ course_id: courseId, title: 'Empty', position: 10 }).select().single();
    const { data: after } = await svc.from('modules')
      .insert({ course_id: courseId, title: 'After Empty', position: 11, unlock_after_module_id: empty.id })
      .select().single();
    expect(await unlocked(after.id)).toBe(true);
  });

  it('is per enrollment, so another trainee is unaffected', async () => {
    const other = await createUser({ email: uniqueEmail(), role: 'trainee' });
    const { data: e2 } = await svc.from('enrollments')
      .insert({ trainee_id: other.id, course_id: courseId, status: 'active' }).select().single();
    const c2 = await signIn(other.email);
    const { data } = await c2.rpc('is_module_unlocked_probe', { enrollment: e2.id, module: modB });
    expect(data).toBe(false);
  });

  // Unlike every other probe, this one takes an enrollment id rather than
  // deriving the caller from auth.uid(). Without an ownership check it would
  // let any signed-in user enumerate another trainee's progress.
  it('REFUSES to answer for an enrollment the caller does not own', async () => {
    const nosy = await createUser({ email: uniqueEmail(), role: 'trainee' });
    const cNosy = await signIn(nosy.email);
    const { data } = await cNosy.rpc('is_module_unlocked_probe', {
      enrollment: enrolId, module: modA,
    });
    expect(data).toBeNull();
  });
});

// The probe derives the caller from auth.uid(), which is NULL for service_role,
// and service_role has no USAGE on schema app either. Edge Functions therefore
// need their own entry point: they act on behalf of a trainee they have already
// authorised themselves, so ownership is checked before the call, not inside it.
describe('is_module_unlocked_for (service-role entry point)', () => {
  it('answers for any enrollment when called by service_role', async () => {
    expect(await svcUnlocked(modA)).toBe(true);
  });

  it('reports a locked module as locked', async () => {
    const { data: locked } = await svc.from('modules')
      .insert({ course_id: courseId, title: 'Svc Locked', position: 20 }).select().single();
    await svc.from('activities').insert({
      module_id: locked.id, type: 'reading', title: 'R', position: 1, content: { body: 'x' },
    });
    const { data: after } = await svc.from('modules')
      .insert({ course_id: courseId, title: 'Svc After', position: 21, unlock_after_module_id: locked.id })
      .select().single();
    expect(await svcUnlocked(after.id)).toBe(false);
  });

  it('is NOT callable by an ordinary signed-in user', async () => {
    const { error } = await cTrainee.rpc('is_module_unlocked_for', {
      enrollment: enrolId, module: modA,
    });
    expect(error).not.toBeNull();
  });
});

describe('app.module_of_activity', () => {
  it('returns the owning module', async () => {
    const { data } = await svc.rpc('module_of_activity_probe', { activity: actB1 });
    expect(data).toBe(modB);
  });

  it('returns null for an unknown activity', async () => {
    const { data } = await svc.rpc('module_of_activity_probe', {
      activity: '00000000-0000-0000-0000-000000000000',
    });
    expect(data).toBeNull();
  });

  it('is not callable by an ordinary signed-in user', async () => {
    const { error } = await cTrainee.rpc('module_of_activity_probe', { activity: actB1 });
    expect(error).not.toBeNull();
  });
});
