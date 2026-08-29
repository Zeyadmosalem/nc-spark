import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  serviceClient, createUser, signIn, resetDb, uniqueEmail, mustWrite,
} from './helpers.js';

const svc = serviceClient();
let admin, ownerTrainer, otherTrainer, supervisor, traineeA, traineeB;
let cAdmin, cOwner, cOther, cSupervisor, cTraineeA;
let courseId, enrolA;

beforeAll(async () => {
  await resetDb();
  admin        = await createUser({ email: uniqueEmail(), role: 'admin' });
  ownerTrainer = await createUser({ email: uniqueEmail(), role: 'trainer' });
  otherTrainer = await createUser({ email: uniqueEmail(), role: 'trainer' });
  supervisor   = await createUser({ email: uniqueEmail(), role: 'supervisor' });
  traineeA     = await createUser({ email: uniqueEmail(), role: 'trainee' });
  traineeB     = await createUser({ email: uniqueEmail(), role: 'trainee' });

  await mustWrite('insert supervisor_trainers', svc.from('supervisor_trainers')
    .insert({ supervisor_id: supervisor.id, trainer_id: ownerTrainer.id }));

  const { data: c } = await svc.from('courses').insert({
    slug: `enr-${Date.now()}`, title: 'Enrolment Course', status: 'published',
    trainer_id: ownerTrainer.id, created_by: admin.id,
  }).select().single();
  courseId = c.id;

  const { data: e } = await svc.from('enrollments')
    .insert({ trainee_id: traineeA.id, course_id: courseId, status: 'active' }).select().single();
  enrolA = e.id;
  await mustWrite('insert enrollments', svc.from('enrollments')
    .insert({ trainee_id: traineeB.id, course_id: courseId, status: 'active' }));

  [cAdmin, cOwner, cOther, cSupervisor, cTraineeA] = await Promise.all([
    signIn(admin.email), signIn(ownerTrainer.email), signIn(otherTrainer.email),
    signIn(supervisor.email), signIn(traineeA.email),
  ]);
});
afterAll(async () => {
  await mustWrite('delete courses', svc.from('courses').delete().eq('id', courseId));
  await resetDb();
});

describe('RED TEAM: enrollment', () => {
  it('a trainee cannot self-approve an enrollment', async () => {
    const { data: c2 } = await svc.from('courses').insert({
      slug: `self-${Date.now()}`, title: 'Self Approve', status: 'published', created_by: admin.id,
    }).select().single();
    await cTraineeA.from('enrollments').insert({ trainee_id: traineeA.id, course_id: c2.id });
    await cTraineeA.from('enrollments').update({ status: 'active' })
      .eq('trainee_id', traineeA.id).eq('course_id', c2.id);
    const { data } = await svc.from('enrollments')
      .select('status').eq('trainee_id', traineeA.id).eq('course_id', c2.id).single();
    expect(data.status).toBe('pending');
    await mustWrite('delete courses', svc.from('courses').delete().eq('id', c2.id));
  });

  it('a trainee cannot enrol somebody else', async () => {
    const { error } = await cTraineeA.from('enrollments')
      .insert({ trainee_id: traineeB.id, course_id: courseId });
    expect(error).not.toBeNull();
  });

  // The WITH CHECK does not constrain status; the column-limited INSERT grant
  // is what forces it to 'pending'. Assert the grant, not just the policy.
  it('a trainee cannot apply with status already set to active', async () => {
    const { data: c2 } = await svc.from('courses').insert({
      slug: `sneak-${Date.now()}`, title: 'Sneak', status: 'published', created_by: admin.id,
    }).select().single();
    const { error } = await cTraineeA.from('enrollments')
      .insert({ trainee_id: traineeA.id, course_id: c2.id, status: 'active' });
    expect(error).not.toBeNull();
    await mustWrite('delete courses', svc.from('courses').delete().eq('id', c2.id));
  });

  it('a trainee cannot apply to a DRAFT course', async () => {
    const { data: c2 } = await svc.from('courses').insert({
      slug: `hidden-${Date.now()}`, title: 'Hidden', status: 'draft', created_by: admin.id,
    }).select().single();
    const { error } = await cTraineeA.from('enrollments')
      .insert({ trainee_id: traineeA.id, course_id: c2.id });
    expect(error).not.toBeNull();
    await mustWrite('delete courses', svc.from('courses').delete().eq('id', c2.id));
  });

  it('a trainee cannot read another trainee enrollment', async () => {
    const { data } = await cTraineeA.from('enrollments').select('id').eq('trainee_id', traineeB.id);
    expect(data ?? []).toHaveLength(0);
  });

  it('a trainer cannot see enrollments on a course they do not own', async () => {
    const { data } = await cOther.from('enrollments').select('id').eq('course_id', courseId);
    expect(data ?? []).toHaveLength(0);
  });

  it('a trainee cannot fabricate a completion', async () => {
    const { data: m } = await svc.from('modules')
      .insert({ course_id: courseId, title: 'M', position: 99 }).select().single();
    const { data: a } = await svc.from('activities')
      .insert({ module_id: m.id, type: 'reading', title: 'R', position: 1, content: { body: 'x' } })
      .select().single();
    const { error } = await cTraineeA.from('activity_completions')
      .insert({ enrollment_id: enrolA, activity_id: a.id });
    expect(error).not.toBeNull();
  });

  it('a trainer cannot approve their own teaching request', async () => {
    const { data: req } = await svc.from('teaching_requests')
      .insert({ trainer_id: otherTrainer.id, course_id: courseId }).select().single();
    await cOther.from('teaching_requests').update({ status: 'approved' }).eq('id', req.id);
    const { data } = await svc.from('teaching_requests').select('status').eq('id', req.id).single();
    expect(data.status).toBe('pending');
    await mustWrite('delete teaching_requests', svc.from('teaching_requests').delete().eq('id', req.id));
  });

  it('a trainer cannot open a teaching request already marked approved', async () => {
    const { data: c2 } = await svc.from('courses').insert({
      slug: `treq-${Date.now()}`, title: 'Teach Sneak', created_by: admin.id,
    }).select().single();
    const { error } = await cOther.from('teaching_requests')
      .insert({ trainer_id: otherTrainer.id, course_id: c2.id, status: 'approved' });
    expect(error).not.toBeNull();
    await mustWrite('delete courses', svc.from('courses').delete().eq('id', c2.id));
  });
});

describe('legitimate enrollment access', () => {
  it('a trainee applies for a published course as pending', async () => {
    const { data: c2 } = await svc.from('courses').insert({
      slug: `apply-${Date.now()}`, title: 'Apply', status: 'published', created_by: admin.id,
    }).select().single();
    const { error } = await cTraineeA.from('enrollments')
      .insert({ trainee_id: traineeA.id, course_id: c2.id });
    expect(error).toBeNull();
    const { data } = await svc.from('enrollments')
      .select('status').eq('trainee_id', traineeA.id).eq('course_id', c2.id).single();
    expect(data.status).toBe('pending');
    await mustWrite('delete courses', svc.from('courses').delete().eq('id', c2.id));
  });

  it('a trainee reads their own enrollment', async () => {
    const { data } = await cTraineeA.from('enrollments').select('id').eq('id', enrolA);
    expect(data).toHaveLength(1);
  });

  it('the owning trainer sees enrollments on their course', async () => {
    const { data } = await cOwner.from('enrollments').select('id').eq('course_id', courseId);
    expect(data.length).toBeGreaterThanOrEqual(2);
  });

  it('a supervisor sees enrollments on a managed trainer course', async () => {
    const { data } = await cSupervisor.from('enrollments').select('id').eq('course_id', courseId);
    expect(data.length).toBeGreaterThanOrEqual(2);
  });

  it('an admin sees every enrollment', async () => {
    const { data } = await cAdmin.from('enrollments').select('id');
    expect(data.length).toBeGreaterThanOrEqual(2);
  });

  it('a trainee reads their own progress row', async () => {
    const { data } = await cTraineeA.from('enrollment_progress')
      .select('percent').eq('enrollment_id', enrolA).single();
    expect(typeof data.percent).toBe('number');
  });

  it('the owning trainer can read the name of a trainee on their course', async () => {
    const { data } = await cOwner.from('profiles').select('name').eq('id', traineeA.id);
    expect(data).toHaveLength(1);
  });

  it('a trainer still cannot read a trainee with no enrollment on their course', async () => {
    const stranger = await createUser({ email: uniqueEmail(), role: 'trainee' });
    const { data } = await cOwner.from('profiles').select('name').eq('id', stranger.id);
    expect(data ?? []).toHaveLength(0);
  });

  it('a trainer may open a teaching request', async () => {
    const { data: c2 } = await svc.from('courses').insert({
      slug: `teach-${Date.now()}`, title: 'Teach Me', status: 'draft', created_by: admin.id,
    }).select().single();
    const { error } = await cOther.from('teaching_requests')
      .insert({ trainer_id: otherTrainer.id, course_id: c2.id });
    expect(error).toBeNull();
    await mustWrite('delete courses', svc.from('courses').delete().eq('id', c2.id));
  });
});
