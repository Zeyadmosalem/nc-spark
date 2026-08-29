import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  serviceClient, createUser, signIn, resetDb, uniqueEmail, callFunction,
} from './helpers.js';

const svc = serviceClient();
let admin, ownerTrainer, otherTrainer, trainee;
let cAdmin, cOwner, cOther, cTrainee;
let courseId;

// Every course this suite creates carries this prefix, so cleanup removes
// exactly what it made and nothing else.
const PREFIX = `fnc${Date.now()}`;

const call = (fn, client, body) => callFunction(fn, client, body);

// Calls that are SUPPOSED to succeed assert it. Without this, a transient
// non-2xx from the platform surfaces as a confusing downstream assertion
// ("expected pending to be withdrawn") instead of naming the real cause.
async function callOk(fn, client, body) {
  const res = await call(fn, client, body);
  if (res.status !== 200) {
    throw new Error(`${fn} returned ${res.status}: ${JSON.stringify(res.body)}`);
  }
  return res;
}

const auditFor = async (entityId, action) =>
  (await svc.from('audit_log').select('*').eq('entity_id', entityId).eq('action', action)).data ?? [];

/**
 * Fails with its own name and the database's message.
 *
 * These inserts used to discard the error and return null, so a fixture that
 * could not build a course surfaced three lines later as
 * "Cannot read properties of null (reading 'id')" — which reads like a bug in
 * the code under test rather than in the setup.
 */
function must(what, { data, error }) {
  if (error) throw new Error(`fixture ${what}: ${error.message}`);
  if (!data) throw new Error(`fixture ${what}: no row returned`);
  return data;
}

let seq = 0;
async function makeCourse(status = 'published', withActivity = true) {
  seq += 1;
  const c = must('course', await svc.from('courses').insert({
    slug: `${PREFIX}-${seq}`, title: 'Fn Course', status,
    trainer_id: ownerTrainer.id, created_by: admin.id,
  }).select().single());
  if (withActivity) {
    const m = must('module', await svc.from('modules')
      .insert({ course_id: c.id, title: 'M', position: 1 }).select().single());
    must('activity', await svc.from('activities').insert({
      module_id: m.id, type: 'reading', title: 'R', position: 1, content: { body: 'x' },
    }).select().single());
  }
  return c.id;
}

async function pendingEnrollment() {
  const { data } = await svc.from('enrollments')
    .insert({ trainee_id: trainee.id, course_id: await makeCourse() }).select().single();
  return data;
}

beforeAll(async () => {
  await resetDb();
  admin        = await createUser({ email: uniqueEmail(), role: 'admin' });
  ownerTrainer = await createUser({ email: uniqueEmail(), role: 'trainer' });
  otherTrainer = await createUser({ email: uniqueEmail(), role: 'trainer' });
  trainee      = await createUser({ email: uniqueEmail(), role: 'trainee' });
  [cAdmin, cOwner, cOther, cTrainee] = await Promise.all([
    signIn(admin.email), signIn(ownerTrainer.email),
    signIn(otherTrainer.email), signIn(trainee.email),
  ]);
  courseId = await makeCourse();
});
afterAll(async () => {
  await svc.from('courses').delete().like('slug', `${PREFIX}-%`);
  await resetDb();
});

describe('approve-enrollment', () => {
  it('lets the owning trainer approve', async () => {
    const { data: e } = await svc.from('enrollments')
      .insert({ trainee_id: trainee.id, course_id: courseId }).select().single();
    const res = await call('approve-enrollment', cOwner, { enrollmentId: e.id, decision: 'approve' });
    expect(res.status).toBe(200);
    const { data } = await svc.from('enrollments').select('status,decided_by').eq('id', e.id).single();
    expect(data.status).toBe('active');
    expect(data.decided_by).toBe(ownerTrainer.id);
    await svc.from('enrollments').delete().eq('id', e.id);
  });

  it('writes an audit entry', async () => {
    const e = await pendingEnrollment();
    await callOk('approve-enrollment', cAdmin, { enrollmentId: e.id, decision: 'approve' });
    const rows = await auditFor(e.id, 'enrollment.decided');
    expect(rows).toHaveLength(1);
    expect(rows[0].after.status).toBe('active');
    expect(rows[0].actor_email).toBe(admin.email);
  });

  it('denies by setting withdrawn', async () => {
    const e = await pendingEnrollment();
    await callOk('approve-enrollment', cAdmin, { enrollmentId: e.id, decision: 'deny' });
    const { data } = await svc.from('enrollments').select('status').eq('id', e.id).single();
    expect(data.status).toBe('withdrawn');
  });

  it('REJECTS a trainer who does not own the course', async () => {
    const e = await pendingEnrollment();
    const res = await call('approve-enrollment', cOther, { enrollmentId: e.id, decision: 'approve' });
    expect(res.status).toBe(403);
    const { data } = await svc.from('enrollments').select('status').eq('id', e.id).single();
    expect(data.status).toBe('pending');
  });

  it('REJECTS the applying trainee', async () => {
    const e = await pendingEnrollment();
    const res = await call('approve-enrollment', cTrainee, { enrollmentId: e.id, decision: 'approve' });
    expect(res.status).toBe(403);
  });

  it('refuses to decide an already-decided enrollment', async () => {
    const e = await pendingEnrollment();
    await callOk('approve-enrollment', cAdmin, { enrollmentId: e.id, decision: 'approve' });
    const res = await call('approve-enrollment', cAdmin, { enrollmentId: e.id, decision: 'deny' });
    expect(res.status).toBe(409);
  });

  it('returns 404 for an unknown enrollment', async () => {
    const res = await call('approve-enrollment', cAdmin, {
      enrollmentId: '00000000-0000-0000-0000-000000000000', decision: 'approve',
    });
    expect(res.status).toBe(404);
  });

  it('rejects a missing decision', async () => {
    const e = await pendingEnrollment();
    const res = await call('approve-enrollment', cAdmin, { enrollmentId: e.id });
    expect(res.status).toBe(400);
  });
});

describe('approve-teaching-request', () => {
  it('assigns the trainer on approval', async () => {
    const id = await makeCourse('draft');
    await svc.from('courses').update({ trainer_id: null }).eq('id', id);
    const { data: req } = await svc.from('teaching_requests')
      .insert({ trainer_id: otherTrainer.id, course_id: id }).select().single();
    const res = await call('approve-teaching-request', cAdmin, { requestId: req.id, decision: 'approve' });
    expect(res.status).toBe(200);
    const { data } = await svc.from('courses').select('trainer_id').eq('id', id).single();
    expect(data.trainer_id).toBe(otherTrainer.id);
  });

  it('REJECTS a trainer approving their own request', async () => {
    const id = await makeCourse('draft');
    const { data: req } = await svc.from('teaching_requests')
      .insert({ trainer_id: otherTrainer.id, course_id: id }).select().single();
    const res = await call('approve-teaching-request', cOther, { requestId: req.id, decision: 'approve' });
    expect(res.status).toBe(403);
    const { data } = await svc.from('teaching_requests').select('status').eq('id', req.id).single();
    expect(data.status).toBe('pending');
  });

  it('leaves the trainer unassigned on denial', async () => {
    const id = await makeCourse('draft');
    await svc.from('courses').update({ trainer_id: null }).eq('id', id);
    const { data: req } = await svc.from('teaching_requests')
      .insert({ trainer_id: otherTrainer.id, course_id: id }).select().single();
    await callOk('approve-teaching-request', cAdmin, { requestId: req.id, decision: 'deny' });
    const { data } = await svc.from('courses').select('trainer_id').eq('id', id).single();
    expect(data.trainer_id).toBeNull();
  });

  it('refuses to decide an already-decided request', async () => {
    const id = await makeCourse('draft');
    const { data: req } = await svc.from('teaching_requests')
      .insert({ trainer_id: otherTrainer.id, course_id: id }).select().single();
    await callOk('approve-teaching-request', cAdmin, { requestId: req.id, decision: 'deny' });
    const res = await call('approve-teaching-request', cAdmin, { requestId: req.id, decision: 'approve' });
    expect(res.status).toBe(409);
  });
});

describe('publish-course', () => {
  it('publishes a course that has content', async () => {
    const id = await makeCourse('draft', true);
    const res = await call('publish-course', cOwner, { courseId: id, publish: true });
    expect(res.status).toBe(200);
    const { data } = await svc.from('courses').select('status').eq('id', id).single();
    expect(data.status).toBe('published');
  });

  it('REFUSES to publish an empty course', async () => {
    const id = await makeCourse('draft', false);
    const res = await call('publish-course', cOwner, { courseId: id, publish: true });
    expect(res.status).toBe(422);
    const { data } = await svc.from('courses').select('status').eq('id', id).single();
    expect(data.status).toBe('draft');
  });

  it('REJECTS a trainer publishing a course they do not own', async () => {
    const id = await makeCourse('draft', true);
    await svc.from('courses').update({ trainer_id: admin.id }).eq('id', id);
    const res = await call('publish-course', cOther, { courseId: id, publish: true });
    expect(res.status).toBe(403);
  });

  it('REJECTS a trainee', async () => {
    const id = await makeCourse('draft', true);
    const res = await call('publish-course', cTrainee, { courseId: id, publish: true });
    expect(res.status).toBe(403);
  });

  it('unpublishes back to draft', async () => {
    const id = await makeCourse('published', true);
    const res = await call('publish-course', cOwner, { courseId: id, publish: false });
    expect(res.status).toBe(200);
    const { data } = await svc.from('courses').select('status').eq('id', id).single();
    expect(data.status).toBe('draft');
  });

  it('writes an audit entry', async () => {
    const id = await makeCourse('draft', true);
    await callOk('publish-course', cOwner, { courseId: id, publish: true });
    expect(await auditFor(id, 'course.published')).toHaveLength(1);
  });
});
