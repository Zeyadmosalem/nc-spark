// The lock state a trainee sees, against the lock rule the server enforces.
//
// src/api/progress.js has a second copy of app.is_module_unlocked, in
// JavaScript, so the course page can SHOW a padlock instead of letting a
// trainee click into an activity and be turned away with no explanation. The
// SQL stays the authority — complete-activity refuses a locked activity
// regardless of what any page drew.
//
// Two copies of one rule is a liability, and this is the thing that makes it
// survivable: every case below asks the database, through
// is_module_unlocked_probe, and asserts the browser agrees. A change to either
// side that the other does not follow is a failing test rather than a trainee
// stuck on a course with no way forward.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { serviceClient, createUser, uniqueEmail, applyAppEnv } from './helpers.js';

applyAppEnv();

const { supabase } = await import('../../src/api/client.js');
const { getCourseOutline } = await import('../../src/api/courses.js');
const { myCompletions, moduleLockState } = await import('../../src/api/progress.js');

const svc = serviceClient();
const PASSWORD = 'Test-Passw0rd!';
const PREFIX = `lock${Date.now()}`;

let trainer, alice;
const madeUsers = [];
let courseId, enrollmentId;
let one, two, three;      // module ids
let a1, a2, b1;           // activity ids

function must(what, { data, error }) {
  if (error) throw new Error(`fixture ${what}: ${error.message}`);
  if (!data) throw new Error(`fixture ${what}: no row returned`);
  return data;
}

async function mk(role) {
  const u = await createUser({ email: uniqueEmail(), role });
  madeUsers.push(u.id);
  return u;
}

/** The database's own answer, through the probe a trainee may call. */
async function serverSaysUnlocked(moduleId) {
  const { data, error } = await supabase
    .rpc('is_module_unlocked_probe', { enrollment: enrollmentId, module: moduleId });
  if (error) throw new Error(`probe: ${error.message}`);
  return data;
}

/** What the course page would draw, from one outline read and one completions read. */
async function browserSays() {
  const course = await getCourseOutline(courseId);
  const done = await myCompletions(enrollmentId);
  return moduleLockState(course.modules, done);
}

/** Asserts both copies of the rule agree, module by module. */
async function expectAgreement() {
  const locks = await browserSays();
  for (const moduleId of [one, two, three]) {
    // The migration says a NULL probe result must be treated as locked.
    const server = (await serverSaysUnlocked(moduleId)) === true;
    expect({ moduleId, unlocked: locks.get(moduleId).unlocked })
      .toEqual({ moduleId, unlocked: server });
  }
  return locks;
}

const complete = (activityId) => svc.from('activity_completions')
  .insert({ enrollment_id: enrollmentId, activity_id: activityId });

beforeAll(async () => {
  trainer = await mk('trainer');
  alice = await mk('trainee');

  const course = must('course', await svc.from('courses').insert({
    slug: `${PREFIX}-course`, title: 'Locking Course', status: 'published',
    trainer_id: trainer.id, created_by: trainer.id,
  }).select().single());
  courseId = course.id;

  const m1 = must('module one', await svc.from('modules')
    .insert({ course_id: courseId, title: 'First', position: 1 }).select().single());
  one = m1.id;

  const m2 = must('module two', await svc.from('modules').insert({
    course_id: courseId, title: 'Second', position: 2, unlock_after_module_id: one,
  }).select().single());
  two = m2.id;

  // Gated on module two, which is itself gated. A chain is where an
  // off-by-one in either copy of the rule shows up.
  const m3 = must('module three', await svc.from('modules').insert({
    course_id: courseId, title: 'Third', position: 3, unlock_after_module_id: two,
  }).select().single());
  three = m3.id;

  a1 = must('a1', await svc.from('activities').insert({
    module_id: one, type: 'reading', title: 'One A', position: 1, content: { body: 'x' },
  }).select().single()).id;
  a2 = must('a2', await svc.from('activities').insert({
    module_id: one, type: 'reading', title: 'One B', position: 2, content: { body: 'x' },
  }).select().single()).id;
  b1 = must('b1', await svc.from('activities').insert({
    module_id: two, type: 'reading', title: 'Two A', position: 1, content: { body: 'x' },
  }).select().single()).id;

  enrollmentId = must('enrollment', await svc.from('enrollments')
    .insert({ trainee_id: alice.id, course_id: courseId, status: 'active' })
    .select().single()).id;

  await supabase.auth.signOut();
  const { error } = await supabase.auth.signInWithPassword({
    email: alice.email, password: PASSWORD,
  });
  if (error) throw new Error(`sign in: ${error.message}`);
}, 90000);

afterAll(async () => {
  await supabase.auth.signOut();
  await svc.from('courses').delete().like('slug', `${PREFIX}-%`);
  for (const id of madeUsers) {
    await svc.auth.admin.deleteUser(id).catch(() => null);
  }
});

describe('the outline a trainee reads', () => {
  /**
   * getCourseOutline omitted unlock_after_module_id, so the page had nothing to
   * compute a lock from — which is why every activity was an open link.
   */
  it('carries the gate on each module', async () => {
    const course = await getCourseOutline(courseId);
    const byId = Object.fromEntries(course.modules.map((m) => [m.id, m]));
    expect(byId[one].unlockAfterModuleId).toBeNull();
    expect(byId[two].unlockAfterModuleId).toBe(one);
    expect(byId[three].unlockAfterModuleId).toBe(two);
  });

  /** The content of an activity must still not travel to a trainee: B3. */
  it('still leaves activity content out', async () => {
    const course = await getCourseOutline(courseId);
    for (const m of course.modules) {
      for (const a of m.activities) {
        expect(a).not.toHaveProperty('content');
        expect(a).not.toHaveProperty('isCorrect');
      }
    }
  });
});

describe('the two copies of the rule', () => {
  it('agree before anything is completed', async () => {
    const locks = await expectAgreement();
    expect(locks.get(one).unlocked).toBe(true);
    expect(locks.get(two).unlocked).toBe(false);
    expect(locks.get(three).unlocked).toBe(false);
  });

  /** Half of a prerequisite is not a prerequisite. */
  it('agree when a prerequisite is half done', async () => {
    await complete(a1);
    const locks = await expectAgreement();
    expect(locks.get(two).unlocked).toBe(false);
    expect(locks.get(two).blockedBy.remaining).toBe(1);
    expect(locks.get(two).blockedBy.module.title).toBe('First');
  });

  it('agree once the prerequisite is finished', async () => {
    await complete(a2);
    const locks = await expectAgreement();
    expect(locks.get(two).unlocked).toBe(true);
    // Three is gated on two, which has its own activity still outstanding.
    expect(locks.get(three).unlocked).toBe(false);
  });

  it('agree down a chain of gates', async () => {
    await complete(b1);
    const locks = await expectAgreement();
    expect(locks.get(three).unlocked).toBe(true);
  });
});

describe('a prerequisite with no activities', () => {
  /**
   * `not exists` over no rows is true, so an empty prerequisite is satisfied
   * rather than a permanent lock. The migration calls this out specifically,
   * and getting it backwards in the browser copy would strand every trainee on
   * a course whose first module is still being written.
   */
  it('is treated as satisfied, on both sides', async () => {
    const empty = must('empty module', await svc.from('modules')
      .insert({ course_id: courseId, title: 'Empty', position: 4 }).select().single());
    const gated = must('gated module', await svc.from('modules').insert({
      course_id: courseId, title: 'After empty', position: 5,
      unlock_after_module_id: empty.id,
    }).select().single());

    const course = await getCourseOutline(courseId);
    const locks = moduleLockState(course.modules, await myCompletions(enrollmentId));

    expect(locks.get(gated.id).unlocked).toBe(true);
    expect(await serverSaysUnlocked(gated.id)).toBe(true);
  });
});

describe('somebody else\'s enrolment', () => {
  /**
   * The probe is security invoker and answers only for enrolments the caller
   * owns; myCompletions leans on activity_completions_select for the same
   * thing. Neither may be used to read another trainee's progress.
   */
  it('reports nothing, through either route', async () => {
    const bob = await mk('trainee');
    const theirs = must('their enrollment', await svc.from('enrollments')
      .insert({ trainee_id: bob.id, course_id: courseId, status: 'active' })
      .select().single());

    expect(await myCompletions(theirs.id)).toEqual(new Set());

    const { data } = await supabase
      .rpc('is_module_unlocked_probe', { enrollment: theirs.id, module: one });
    expect(data).toBeNull();
  });
});
