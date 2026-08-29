import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { serviceClient, createUser, resetDb, uniqueEmail, mustWrite } from './helpers.js';

const svc = serviceClient();
let trainer, trainee, courseId, activityId;

beforeAll(async () => {
  await resetDb();
  trainer = await createUser({ email: uniqueEmail(), role: 'trainer' });
  trainee = await createUser({ email: uniqueEmail(), role: 'trainee' });
  const { data: c } = await svc.from('courses')
    .insert({ slug: `en-${Date.now()}`, title: 'Enrolment Course', trainer_id: trainer.id, created_by: trainer.id })
    .select().single();
  courseId = c.id;
  const { data: m } = await svc.from('modules')
    .insert({ course_id: courseId, title: 'M1', position: 1 }).select().single();
  const { data: a } = await svc.from('activities')
    .insert({ module_id: m.id, type: 'reading', title: 'Read', position: 1, content: { body: 'x' } })
    .select().single();
  activityId = a.id;
});
afterAll(async () => {
  await mustWrite('delete courses', svc.from('courses').delete().eq('id', courseId));
  await resetDb();
});

describe('enrollment schema', () => {
  it('defaults a new enrollment to pending', async () => {
    const { data } = await svc.from('enrollments')
      .insert({ trainee_id: trainee.id, course_id: courseId }).select().single();
    expect(data.status).toBe('pending');
    await mustWrite('delete enrollments', svc.from('enrollments').delete().eq('id', data.id));
  });

  it('rejects a duplicate enrollment for the same trainee and course', async () => {
    const { data: first } = await svc.from('enrollments')
      .insert({ trainee_id: trainee.id, course_id: courseId }).select().single();
    const { error } = await svc.from('enrollments')
      .insert({ trainee_id: trainee.id, course_id: courseId });
    expect(error).not.toBeNull();
    await mustWrite('delete enrollments', svc.from('enrollments').delete().eq('id', first.id));
  });

  it('records a completion against an enrollment', async () => {
    const { data: e } = await svc.from('enrollments')
      .insert({ trainee_id: trainee.id, course_id: courseId, status: 'active' }).select().single();
    const { error } = await svc.from('activity_completions')
      .insert({ enrollment_id: e.id, activity_id: activityId, payload: { score: 1 } });
    expect(error).toBeNull();
    await mustWrite('delete enrollments', svc.from('enrollments').delete().eq('id', e.id));
  });

  it('rejects completing the same activity twice in one enrollment', async () => {
    const { data: e } = await svc.from('enrollments')
      .insert({ trainee_id: trainee.id, course_id: courseId, status: 'active' }).select().single();
    await mustWrite('insert activity_completions', svc.from('activity_completions').insert({ enrollment_id: e.id, activity_id: activityId }));
    const { error } = await svc.from('activity_completions')
      .insert({ enrollment_id: e.id, activity_id: activityId });
    expect(error).not.toBeNull();
    await mustWrite('delete enrollments', svc.from('enrollments').delete().eq('id', e.id));
  });

  it('cascades completions when the enrollment is deleted', async () => {
    const { data: e } = await svc.from('enrollments')
      .insert({ trainee_id: trainee.id, course_id: courseId, status: 'active' }).select().single();
    await mustWrite('insert activity_completions', svc.from('activity_completions').insert({ enrollment_id: e.id, activity_id: activityId }));
    await mustWrite('delete enrollments', svc.from('enrollments').delete().eq('id', e.id));
    const { data } = await svc.from('activity_completions').select('id').eq('enrollment_id', e.id);
    expect(data ?? []).toHaveLength(0);
  });

  it('defaults a teaching request to pending', async () => {
    const { data } = await svc.from('teaching_requests')
      .insert({ trainer_id: trainer.id, course_id: courseId }).select().single();
    expect(data.status).toBe('pending');
    await mustWrite('delete teaching_requests', svc.from('teaching_requests').delete().eq('id', data.id));
  });

  it('rejects two PENDING teaching requests for the same pair', async () => {
    const { data: first } = await svc.from('teaching_requests')
      .insert({ trainer_id: trainer.id, course_id: courseId }).select().single();
    const { error } = await svc.from('teaching_requests')
      .insert({ trainer_id: trainer.id, course_id: courseId });
    expect(error).not.toBeNull();
    await mustWrite('delete teaching_requests', svc.from('teaching_requests').delete().eq('id', first.id));
  });

  it('allows a second teaching request once the first is decided', async () => {
    const { data: first } = await svc.from('teaching_requests')
      .insert({ trainer_id: trainer.id, course_id: courseId }).select().single();
    await mustWrite('update teaching_requests', svc.from('teaching_requests').update({ status: 'denied' }).eq('id', first.id));
    const { error } = await svc.from('teaching_requests')
      .insert({ trainer_id: trainer.id, course_id: courseId });
    expect(error).toBeNull();
    await mustWrite('delete teaching_requests', svc.from('teaching_requests').delete().eq('course_id', courseId));
  });
});
