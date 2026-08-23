// The admin console, running the code the browser actually runs.
//
// Every other test in this directory reimplements the query it is checking.
// This one imports src/api/admin.js, src/api/teaching.js and src/api/profiles.js
// directly and points their client at the live project, because the things most
// likely to be wrong cannot be caught any other way:
//
//   - PostgREST embed names. `profiles!teaching_requests_trainer_id_fkey(...)`
//     is a string. A wrong constraint name is a 400 at runtime and a passing
//     unit test, because the unit test mocks `from`.
//   - Whether the policies actually allow these reads for an admin, and
//     actually refuse them for everyone else.
//
// A frontend mock cannot fail either way, which is exactly why these are here.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { serviceClient, createUser, uniqueEmail } from './helpers.js';

const localPath = new URL('../../.env.test.local', import.meta.url);
const hostedPath = new URL('../../.env.test', import.meta.url);
const env = Object.fromEntries(
  readFileSync(existsSync(localPath) ? localPath : hostedPath, 'utf8')
    .split('\n')
    .filter((l) => l.trim() && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }));

// src/api/client.js reads import.meta.env at module scope, so this has to land
// before the dynamic imports below.
process.env.VITE_SUPABASE_URL = env.SUPABASE_URL;
process.env.VITE_SUPABASE_ANON_KEY = env.SUPABASE_ANON_KEY;

const { supabase } = await import('../../src/api/client.js');
const { listUsers, pendingSignups, platformStats, recentAudit } =
  await import('../../src/api/admin.js');
// Lives in courses.js: it is course data, and the trainer screens read it too.
const { courseContentCounts } = await import('../../src/api/courses.js');
const { pendingTeachingRequests, decideTeachingRequest, requestToTeach } =
  await import('../../src/api/teaching.js');
const { setUserRole, reviewSignup, suspendUser } = await import('../../src/api/profiles.js');

const svc = serviceClient();
const PASSWORD = 'Test-Passw0rd!';
const PREFIX = `adm${Date.now()}`;

let admin, trainer, trainee, pending, courseId, requestId;
const madeUsers = [];

async function become(email) {
  await supabase.auth.signOut();
  const { error } = await supabase.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`could not sign in as ${email}: ${error.message}`);
}

async function mk(role, status = 'active') {
  const u = await createUser({ email: uniqueEmail(), role, status });
  madeUsers.push(u.id);
  return u;
}

beforeAll(async () => {
  admin   = await mk('admin');
  trainer = await mk('trainer');
  trainee = await mk('trainee');
  pending = await mk('trainee', 'pending');

  const { data: c } = await svc.from('courses').insert({
    slug: `${PREFIX}-course`, title: 'Verification Course', created_by: admin.id,
  }).select().single();
  courseId = c.id;

  const { data: r } = await svc.from('teaching_requests')
    .insert({ trainer_id: trainer.id, course_id: courseId }).select().single();
  requestId = r.id;
}, 60000);

afterAll(async () => {
  await supabase.auth.signOut();
  await svc.from('teaching_requests').delete().eq('id', requestId);
  await svc.from('courses').delete().eq('id', courseId);
  for (const id of madeUsers) {
    await svc.auth.admin.deleteUser(id).catch(() => null);
  }
});

describe('an admin, through the real api layer', () => {
  beforeAll(() => become(admin.email));

  it('reads the directory, emails included', async () => {
    const users = await listUsers();
    expect(users.length).toBeGreaterThan(0);
    const me = users.find((u) => u.id === admin.id);
    expect(me.email).toBe(admin.email);
    expect(me.createdAt).toBeTruthy();
  });

  it('sees the pending signup, and only pending users, in the queue', async () => {
    const queue = await pendingSignups();
    expect(queue.map((u) => u.id)).toContain(pending.id);
    expect(queue.every((u) => u.status === 'pending')).toBe(true);
  });

  it('counts the platform without downloading it', async () => {
    const s = await platformStats();
    expect(s.courses.total).toBeGreaterThan(0);
    expect(Number.isInteger(s.enrollments.active)).toBe(true);
    expect(Number.isInteger(s.attempts.pendingReview)).toBe(true);
  });

  /**
   * The embed name is the point. `teaching_requests_trainer_id_fkey` is a
   * string only PostgREST can validate, and a unit test that mocks `from`
   * passes whatever is written there.
   */
  it('reads the teaching-request queue with its joins intact', async () => {
    const queue = await pendingTeachingRequests();
    const mine = queue.find((r) => r.id === requestId);
    expect(mine).toBeDefined();
    expect(mine.trainerId).toBe(trainer.id);
    expect(mine.trainerEmail).toBe(trainer.email);
    expect(mine.courseTitle).toBe('Verification Course');
  });

  /**
   * A nested two-level embed. The Curriculum page uses it to disable Publish on
   * an empty course, so if it silently returned nothing every course would look
   * unpublishable.
   */
  it('counts the modules and activities on each course', async () => {
    const counts = await courseContentCounts();
    expect(counts[courseId]).toEqual({ modules: 0, activities: 0 });

    const { data: m } = await svc.from('modules')
      .insert({ course_id: courseId, title: 'M1', position: 1 }).select().single();
    await svc.from('activities').insert({
      module_id: m.id, type: 'reading', title: 'A1', position: 1, content: { body: 'x' },
    });

    const after = await courseContentCounts();
    expect(after[courseId]).toEqual({ modules: 1, activities: 1 });
  });

  it('approves a signup, and the queue shrinks', async () => {
    await reviewSignup(pending.id, 'approve', 'trainee');
    const queue = await pendingSignups();
    expect(queue.map((u) => u.id)).not.toContain(pending.id);
  });

  it('changes a role, and the audit trail says who did it', async () => {
    await setUserRole(trainee.id, 'supervisor');
    const { data } = await svc.from('profiles').select('role').eq('id', trainee.id).single();
    expect(data.role).toBe('supervisor');

    const entries = await recentAudit(50);
    const entry = entries.find(
      (e) => e.entityId === trainee.id && e.action === 'profile.role_changed');
    expect(entry).toBeDefined();
    expect(entry.actorEmail).toBe(admin.email);
    expect(entry.before.role).toBe('trainee');
    expect(entry.after.role).toBe('supervisor');
  });

  it('suspends and reinstates', async () => {
    await suspendUser(trainer.id, true);
    let { data } = await svc.from('profiles').select('status').eq('id', trainer.id).single();
    expect(data.status).toBe('suspended');

    await suspendUser(trainer.id, false);
    ({ data } = await svc.from('profiles').select('status').eq('id', trainer.id).single());
    expect(data.status).toBe('active');
  });
});

/**
 * The same functions, with a non-admin caller. These are the reads the admin
 * screens make; if a policy were missing, the page would render happily for a
 * trainee and the unit tests would never notice, because they mock the
 * database away entirely.
 */
describe('a trainee calling the admin reads', () => {
  beforeAll(async () => {
    await svc.from('profiles').update({ role: 'trainee', status: 'active' }).eq('id', trainee.id);
    await become(trainee.email);
  });

  it('sees only themselves in the directory', async () => {
    const users = await listUsers();
    expect(users.map((u) => u.id)).toEqual([trainee.id]);
  });

  it('gets an empty approval queue', async () => {
    expect(await pendingSignups()).toEqual([]);
  });

  it('gets an empty teaching-request queue', async () => {
    expect(await pendingTeachingRequests()).toEqual([]);
  });

  /**
   * Not an empty result: courses_select_published means a trainee legitimately
   * sees published courses, and modules_select shows their outline before
   * enrolling. What they must NOT see is the unpublished course, and they must
   * not see activities on a course they are not enrolled in.
   */
  it('sees published outlines but not the draft course', async () => {
    const counts = await courseContentCounts();
    expect(counts[courseId]).toBeUndefined();
    expect(Object.values(counts).every((c) => c.activities === 0)).toBe(true);
  });

  it('reads no audit trail at all', async () => {
    expect(await recentAudit(50)).toEqual([]);
  });

  it('is refused by the admin Edge Functions', async () => {
    await expect(setUserRole(admin.id, 'trainee')).rejects.toThrow();
    await expect(suspendUser(admin.id, true)).rejects.toThrow();
    const { data } = await svc.from('profiles').select('role,status').eq('id', admin.id).single();
    expect(data).toEqual({ role: 'admin', status: 'active' });
  });
});

/**
 * The whole teaching-request loop, end to end, through the api both screens
 * use. courses.trainer_id is excluded from the UPDATE grant, so this is the
 * ONLY way a course gets an owner — a trainer asks, an admin decides, and
 * approve-teaching-request sets the column with the service role.
 */
describe('a course changing hands', () => {
  let secondCourse;

  beforeAll(async () => {
    const { data } = await svc.from('courses').insert({
      slug: `${PREFIX}-handover`, title: 'Handover Course', created_by: admin.id,
    }).select().single();
    secondCourse = data.id;
  });

  afterAll(async () => {
    await svc.from('courses').delete().eq('id', secondCourse);
  });

  it('starts with no trainer', async () => {
    const { data } = await svc.from('courses').select('trainer_id').eq('id', secondCourse).single();
    expect(data.trainer_id).toBeNull();
  });

  it('lets a trainer ask, without letting them set the status', async () => {
    await become(trainer.email);
    const request = await requestToTeach(secondCourse);
    expect(request.status).toBe('pending');
  });

  // teaching_requests_one_open is a partial unique index over pending rows.
  it('refuses a second open ask for the same course', async () => {
    await expect(requestToTeach(secondCourse)).rejects.toThrow();
  });

  it('shows up in the admin queue with both names resolved', async () => {
    await become(admin.email);
    const queue = await pendingTeachingRequests();
    const row = queue.find((r) => r.courseId === secondCourse);
    expect(row).toBeDefined();
    expect(row.trainerName).toBe(trainer.name ?? row.trainerName);
    expect(row.courseTitle).toBe('Handover Course');
  });

  it('assigns the trainer when the admin approves', async () => {
    const queue = await pendingTeachingRequests();
    const row = queue.find((r) => r.courseId === secondCourse);
    await decideTeachingRequest(row.id, 'approve');

    const { data } = await svc.from('courses').select('trainer_id').eq('id', secondCourse).single();
    expect(data.trainer_id).toBe(trainer.id);
  });

  it('leaves the queue empty afterwards', async () => {
    const queue = await pendingTeachingRequests();
    expect(queue.map((r) => r.courseId)).not.toContain(secondCourse);
  });
});
