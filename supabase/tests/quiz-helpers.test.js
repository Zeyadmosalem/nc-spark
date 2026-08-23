import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { serviceClient, createUser, signIn, resetDb, uniqueEmail } from './helpers.js';

const svc = serviceClient();
const PREFIX = `qh${Date.now()}`;
let trainer, trainee, cTrainee;
let courseId, quizId, enrolId, actA, actB;
let emptyCourseId, emptyEnrolId;

beforeAll(async () => {
  await resetDb();
  trainer = await createUser({ email: uniqueEmail(), role: 'trainer' });
  trainee = await createUser({ email: uniqueEmail(), role: 'trainee' });

  const { data: c } = await svc.from('courses').insert({
    slug: `${PREFIX}-1`, title: 'Helper Course', status: 'published',
    trainer_id: trainer.id, created_by: trainer.id,
  }).select().single();
  courseId = c.id;

  const { data: m } = await svc.from('modules')
    .insert({ course_id: courseId, title: 'M', position: 1 }).select().single();
  const act = async (position) => {
    const { data } = await svc.from('activities').insert({
      module_id: m.id, type: 'reading', title: `R${position}`, position, content: { body: 'x' },
    }).select().single();
    return data.id;
  };
  actA = await act(1);
  actB = await act(2);

  const { data: qz } = await svc.from('quizzes')
    .insert({ course_id: courseId, title: 'Final' }).select().single();
  quizId = qz.id;

  const { data: e } = await svc.from('enrollments')
    .insert({ trainee_id: trainee.id, course_id: courseId, status: 'active' }).select().single();
  enrolId = e.id;

  // A course with no activities at all, to pin the vacuous case.
  const { data: c2 } = await svc.from('courses').insert({
    slug: `${PREFIX}-2`, title: 'Empty Course', status: 'published', created_by: trainer.id,
  }).select().single();
  emptyCourseId = c2.id;
  const { data: e2 } = await svc.from('enrollments')
    .insert({ trainee_id: trainee.id, course_id: emptyCourseId, status: 'active' }).select().single();
  emptyEnrolId = e2.id;

  cTrainee = await signIn(trainee.email);
});
afterAll(async () => {
  await svc.from('quiz_retake_grants').delete().eq('quiz_id', quizId);
  await svc.from('courses').delete().like('slug', `${PREFIX}-%`);
  await resetDb();
});

const allComplete = async (enrollment) => {
  const { data } = await svc.rpc('all_modules_complete_for', { enrollment });
  return data;
};
const hasRetake = async () => {
  const { data } = await svc.rpc('has_unconsumed_retake_for', { quiz: quizId, trainee: trainee.id });
  return data;
};

describe('all_modules_complete', () => {
  it('is false while activities are outstanding', async () => {
    expect(await allComplete(enrolId)).toBe(false);
  });

  it('is still false when only some are done', async () => {
    await svc.from('activity_completions').insert({ enrollment_id: enrolId, activity_id: actA });
    expect(await allComplete(enrolId)).toBe(false);
  });

  it('is true once every activity in every module has a completion', async () => {
    await svc.from('activity_completions').insert({ enrollment_id: enrolId, activity_id: actB });
    expect(await allComplete(enrolId)).toBe(true);
  });

  // Same choice app.is_module_unlocked makes: nothing outstanding is
  // satisfied, rather than an accidental permanent lock.
  it('is true for a course with no activities at all', async () => {
    expect(await allComplete(emptyEnrolId)).toBe(true);
  });

  it('is false for an enrollment that does not exist', async () => {
    expect(await allComplete('00000000-0000-0000-0000-000000000000')).toBe(false);
  });

  it('is NOT callable by an ordinary signed-in user', async () => {
    const { error } = await cTrainee.rpc('all_modules_complete_for', { enrollment: enrolId });
    expect(error).not.toBeNull();
  });
});

describe('has_unconsumed_retake', () => {
  it('is false with no grant', async () => {
    expect(await hasRetake()).toBe(false);
  });

  it('is true once a grant exists', async () => {
    await svc.from('quiz_retake_grants')
      .insert({ quiz_id: quizId, trainee_id: trainee.id, granted_by: trainer.id });
    expect(await hasRetake()).toBe(true);
  });

  it('is false again once the grant is consumed', async () => {
    await svc.from('quiz_retake_grants')
      .update({ consumed_at: new Date().toISOString() })
      .eq('quiz_id', quizId).eq('trainee_id', trainee.id);
    expect(await hasRetake()).toBe(false);
  });

  it('is NOT callable by an ordinary signed-in user', async () => {
    const { error } = await cTrainee.rpc('has_unconsumed_retake_for', {
      quiz: quizId, trainee: trainee.id,
    });
    expect(error).not.toBeNull();
  });
});
