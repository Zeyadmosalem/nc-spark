import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { serviceClient, createUser, signIn, resetDb, uniqueEmail, SUPABASE_URL } from './helpers.js';

const svc = serviceClient();
const PREFIX = `cmp${Date.now()}`;
let trainer, trainee, stranger;
let cTrainee, cStranger;
let courseId, modA, modB, actA1, actA2, actB1, enrolId;

async function call(client, body) {
  const { data: { session } } = await client.auth.getSession();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/complete-activity`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

beforeAll(async () => {
  await resetDb();
  trainer  = await createUser({ email: uniqueEmail(), role: 'trainer' });
  trainee  = await createUser({ email: uniqueEmail(), role: 'trainee' });
  stranger = await createUser({ email: uniqueEmail(), role: 'trainee' });

  const { data: c } = await svc.from('courses').insert({
    slug: `${PREFIX}-1`, title: 'Complete Course', status: 'published',
    trainer_id: trainer.id, created_by: trainer.id,
  }).select().single();
  courseId = c.id;

  const { data: a } = await svc.from('modules')
    .insert({ course_id: courseId, title: 'A', position: 1 }).select().single();
  modA = a.id;
  const { data: b } = await svc.from('modules')
    .insert({ course_id: courseId, title: 'B', position: 2, unlock_after_module_id: modA })
    .select().single();
  modB = b.id;

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

  [cTrainee, cStranger] = await Promise.all([signIn(trainee.email), signIn(stranger.email)]);
});
afterAll(async () => {
  await svc.from('courses').delete().like('slug', `${PREFIX}-%`);
  await resetDb();
});

const completions = async () =>
  (await svc.from('activity_completions').select('activity_id').eq('enrollment_id', enrolId)).data ?? [];

describe('complete-activity', () => {
  it('records a completion in an unlocked module', async () => {
    const res = await call(cTrainee, { activityId: actA1 });
    expect(res.status).toBe(200);
    expect((await completions()).map((c) => c.activity_id)).toContain(actA1);
  });

  it('returns the recalculated progress', async () => {
    const res = await call(cTrainee, { activityId: actA1 });
    expect(res.body.progress.total).toBe(3);
    expect(res.body.progress.completed).toBe(1);
    expect(res.body.progress.percent).toBe(33);
  });

  it('is idempotent — completing twice does not duplicate', async () => {
    await call(cTrainee, { activityId: actA1 });
    const rows = (await completions()).filter((c) => c.activity_id === actA1);
    expect(rows).toHaveLength(1);
  });

  it('stores the payload describing HOW it was completed', async () => {
    await call(cTrainee, { activityId: actA2, payload: { score: 5, of: 6 } });
    const { data } = await svc.from('activity_completions')
      .select('payload').eq('enrollment_id', enrolId).eq('activity_id', actA2).single();
    expect(data.payload).toEqual({ score: 5, of: 6 });
  });

  it('REJECTS an activity in a locked module', async () => {
    // Reset module A so B is locked again.
    await svc.from('activity_completions').delete().eq('enrollment_id', enrolId);
    const res = await call(cTrainee, { activityId: actB1 });
    expect(res.status).toBe(423);
    expect((await completions()).map((c) => c.activity_id)).not.toContain(actB1);
  });

  it('allows it once the prerequisite module is finished', async () => {
    await call(cTrainee, { activityId: actA1 });
    await call(cTrainee, { activityId: actA2 });
    const res = await call(cTrainee, { activityId: actB1 });
    expect(res.status).toBe(200);
  });

  it('REJECTS a trainee who is not enrolled', async () => {
    const res = await call(cStranger, { activityId: actA1 });
    expect(res.status).toBe(403);
  });

  it('returns 404 for an unknown activity', async () => {
    const res = await call(cTrainee, { activityId: '00000000-0000-0000-0000-000000000000' });
    expect(res.status).toBe(404);
  });

  it('rejects a missing activityId', async () => {
    const res = await call(cTrainee, {});
    expect(res.status).toBe(400);
  });

  it('marks the enrollment completed once every activity is done', async () => {
    const { data } = await svc.from('enrollments')
      .select('status, completed_at').eq('id', enrolId).single();
    expect(data.status).toBe('completed');
    expect(data.completed_at).not.toBeNull();
  });

  // M4 supersedes the rule above for any course carrying a final assessment:
  // 100% of activities only unlocks the final, and passing it is what
  // completes the course. The test above still stands for a course with none.
  it('does NOT complete a course that has a final, even at 100%', async () => {
    const { data: c } = await svc.from('courses').insert({
      slug: `${PREFIX}-final`, title: 'With Final', status: 'published',
      trainer_id: trainer.id, created_by: trainer.id,
    }).select().single();
    const { data: m } = await svc.from('modules')
      .insert({ course_id: c.id, title: 'M', position: 1 }).select().single();
    const { data: a } = await svc.from('activities').insert({
      module_id: m.id, type: 'reading', title: 'R', position: 1, content: { body: 'x' },
    }).select().single();
    await svc.from('quizzes').insert({ course_id: c.id, activity_id: null, title: 'Final' });
    const { data: e } = await svc.from('enrollments')
      .insert({ trainee_id: trainee.id, course_id: c.id, status: 'active' }).select().single();

    const res = await call(cTrainee, { activityId: a.id });
    expect(res.status).toBe(200);
    expect(res.body.progress.percent).toBe(100);

    const { data: after } = await svc.from('enrollments')
      .select('status, completed_at').eq('id', e.id).single();
    expect(after.status).toBe('active');
    expect(after.completed_at).toBeNull();
  });
});

describe('RED TEAM: a trainee cannot write completions directly', () => {
  it('has no INSERT grant on activity_completions', async () => {
    const { error } = await cTrainee.from('activity_completions')
      .insert({ enrollment_id: enrolId, activity_id: actB1 });
    expect(error).not.toBeNull();
  });

  it('cannot delete a completion to redo an activity', async () => {
    await cTrainee.from('activity_completions').delete().eq('enrollment_id', enrolId);
    expect((await completions()).length).toBeGreaterThan(0);
  });
});
