import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  serviceClient, createUser, signIn, resetDb, uniqueEmail, mustWrite,
} from './helpers.js';

const svc = serviceClient();
let trainer, traineeA, traineeB, courseId, enrolA, enrolB;
const activityIds = [];

beforeAll(async () => {
  await resetDb();
  trainer  = await createUser({ email: uniqueEmail(), role: 'trainer' });
  traineeA = await createUser({ email: uniqueEmail(), role: 'trainee' });
  traineeB = await createUser({ email: uniqueEmail(), role: 'trainee' });

  const { data: c } = await svc.from('courses')
    .insert({ slug: `pg-${Date.now()}`, title: 'Progress Course', trainer_id: trainer.id, created_by: trainer.id })
    .select().single();
  courseId = c.id;
  const { data: m } = await svc.from('modules')
    .insert({ course_id: courseId, title: 'M1', position: 1 }).select().single();
  for (let i = 1; i <= 4; i++) {
    const { data: a } = await svc.from('activities')
      .insert({ module_id: m.id, type: 'reading', title: `R${i}`, position: i, content: { body: 'x' } })
      .select().single();
    activityIds.push(a.id);
  }

  const { data: eA } = await svc.from('enrollments')
    .insert({ trainee_id: traineeA.id, course_id: courseId, status: 'active' }).select().single();
  const { data: eB } = await svc.from('enrollments')
    .insert({ trainee_id: traineeB.id, course_id: courseId, status: 'active' }).select().single();
  enrolA = eA.id; enrolB = eB.id;

  // A completes two of four; B completes none.
  await mustWrite('insert activity_completions', svc.from('activity_completions').insert([
    { enrollment_id: enrolA, activity_id: activityIds[0] },
    { enrollment_id: enrolA, activity_id: activityIds[1] },
  ]));
});
afterAll(async () => {
  await mustWrite('delete courses', svc.from('courses').delete().eq('id', courseId));
  await resetDb();
});

describe('enrollment_progress view', () => {
  it('computes percent from completions, not a stored column', async () => {
    const { data } = await svc.from('enrollment_progress')
      .select('*').eq('enrollment_id', enrolA).single();
    expect(data.total_activities).toBe(4);
    expect(data.completed_activities).toBe(2);
    expect(data.percent).toBe(50);
  });

  it('is per trainee, not per course', async () => {
    const { data } = await svc.from('enrollment_progress')
      .select('percent').eq('enrollment_id', enrolB).single();
    expect(data.percent).toBe(0);
  });

  it('updates immediately when a completion is added', async () => {
    await mustWrite('insert activity_completions', svc.from('activity_completions')
      .insert({ enrollment_id: enrolB, activity_id: activityIds[0] }));
    const { data } = await svc.from('enrollment_progress')
      .select('percent').eq('enrollment_id', enrolB).single();
    expect(data.percent).toBe(25);
  });

  it('reports 0 rather than dividing by zero for an empty course', async () => {
    const { data: c } = await svc.from('courses')
      .insert({ slug: `empty-${Date.now()}`, title: 'Empty', created_by: trainer.id }).select().single();
    const { data: e } = await svc.from('enrollments')
      .insert({ trainee_id: traineeA.id, course_id: c.id, status: 'active' }).select().single();
    const { data } = await svc.from('enrollment_progress')
      .select('percent,total_activities').eq('enrollment_id', e.id).single();
    expect(data.total_activities).toBe(0);
    expect(data.percent).toBe(0);
    await mustWrite('delete courses', svc.from('courses').delete().eq('id', c.id));
  });
});

describe('catalog helper functions', () => {
  it('is_trainer_of is true for the owning trainer', async () => {
    const c = await signIn(trainer.email);
    const { data } = await c.rpc('is_trainer_of_probe', { course: courseId });
    expect(data).toBe(true);
  });

  it('is_trainer_of is false for another trainer', async () => {
    const other = await createUser({ email: uniqueEmail(), role: 'trainer' });
    const c = await signIn(other.email);
    const { data } = await c.rpc('is_trainer_of_probe', { course: courseId });
    expect(data).toBe(false);
  });

  it('is_enrolled is true for an active enrollment', async () => {
    const c = await signIn(traineeA.email);
    const { data } = await c.rpc('is_enrolled_probe', { course: courseId });
    expect(data).toBe(true);
  });

  it('is_enrolled is FALSE for a merely pending enrollment', async () => {
    const pendingTrainee = await createUser({ email: uniqueEmail(), role: 'trainee' });
    await mustWrite('insert enrollments', svc.from('enrollments')
      .insert({ trainee_id: pendingTrainee.id, course_id: courseId, status: 'pending' }));
    const c = await signIn(pendingTrainee.email);
    const { data } = await c.rpc('is_enrolled_probe', { course: courseId });
    expect(data).toBe(false);
  });
});
