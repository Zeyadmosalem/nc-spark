// The cross-course library, against the live project.
//
// Two things here can only be checked by the server:
//
// 1. `modules!inner(...)` with `.in('modules.course_id', ids)`. Filtering
//    through an embedded resource is a PostgREST feature, expressed as a
//    string, and a mocked `from` accepts any string at all.
// 2. That the list is scoped to what the caller is enrolled on. That is
//    activities_select doing the work, not a filter this function applies —
//    so the test enrols one trainee and not another and reads both.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  serviceClient, createUser, uniqueEmail, applyAppEnv, becomeWith, must,
  mustWrite,
} from './helpers.js';

applyAppEnv();

const { supabase } = await import('../../src/api/client.js');
const { myLibrary } = await import('../../src/api/library.js');

const svc = serviceClient();
const PASSWORD = 'Test-Passw0rd!';

const become = becomeWith(supabase, PASSWORD);
const PREFIX = `lib${Date.now()}`;

let trainer, alice, bob;
const madeUsers = [];
let fireId, foodId;
let readingId, videoId, quizId, gatedId;
let aliceEnrollment;

async function mk(role) {
  const u = await createUser({ email: uniqueEmail(), role });
  madeUsers.push(u.id);
  return u;
}

beforeAll(async () => {
  trainer = await mk('trainer');
  alice = await mk('trainee');
  bob = await mk('trainee');

  const fire = must('fire course', await svc.from('courses').insert({
    slug: `${PREFIX}-fire`, title: 'Fire Safety', status: 'published', icon: 'F',
    trainer_id: trainer.id, created_by: trainer.id,
  }).select().single());
  fireId = fire.id;

  // A second course Alice is NOT on, to prove the scoping is the policy's
  // work rather than a filter this function happens to apply.
  const food = must('food course', await svc.from('courses').insert({
    slug: `${PREFIX}-food`, title: 'Food Hygiene', status: 'published', icon: 'H',
    trainer_id: trainer.id, created_by: trainer.id,
  }).select().single());
  foodId = food.id;

  const m1 = must('m1', await svc.from('modules')
    .insert({ course_id: fireId, title: 'Basics', position: 1 }).select().single());
  const m2 = must('m2', await svc.from('modules').insert({
    course_id: fireId, title: 'Assessment', position: 2, unlock_after_module_id: m1.id,
  }).select().single());

  readingId = must('reading', await svc.from('activities').insert({
    module_id: m1.id, type: 'reading', title: 'Fire triangle', position: 1,
    content: { body: 'x' },
  }).select().single()).id;
  videoId = must('video', await svc.from('activities').insert({
    module_id: m1.id, type: 'video', title: 'Extinguisher demo', position: 2,
    content: { videoId: 'abc' },
  }).select().single()).id;
  gatedId = must('gated quiz', await svc.from('activities').insert({
    module_id: m2.id, type: 'quiz', title: 'Final check', position: 1, content: {},
  }).select().single()).id;
  quizId = gatedId;

  const foodModule = must('food module', await svc.from('modules')
    .insert({ course_id: foodId, title: 'Kitchens', position: 1 }).select().single());
  must('food activity', await svc.from('activities').insert({
    module_id: foodModule.id, type: 'video', title: 'Handwashing', position: 1,
    content: { videoId: 'zzz' },
  }).select().single());

  aliceEnrollment = must('enrollment', await svc.from('enrollments')
    .insert({ trainee_id: alice.id, course_id: fireId, status: 'active' })
    .select().single()).id;
}, 90000);

afterAll(async () => {
  await supabase.auth.signOut();
  await mustWrite('delete courses', svc.from('courses').delete().like('slug', `${PREFIX}-%`));
  for (const id of madeUsers) {
    await svc.auth.admin.deleteUser(id).catch(() => null);
  }
});

describe('a trainee on one course', () => {
  beforeAll(() => become(alice.email));

  it('lists every activity on it, with the module and course named', async () => {
    const items = await myLibrary();
    const mine = items.filter((i) => i.courseId === fireId);
    expect(mine.map((i) => i.title).sort())
      .toEqual(['Extinguisher demo', 'Final check', 'Fire triangle']);
    expect(mine.every((i) => i.courseTitle === 'Fire Safety')).toBe(true);
    expect(mine.find((i) => i.id === gatedId).moduleTitle).toBe('Assessment');
  });

  /**
   * activities_select requires enrolment. Nothing in myLibrary filters by
   * course beyond the ids it already asked for, so this is the policy.
   */
  it('does not list a course they are not enrolled on', async () => {
    const items = await myLibrary();
    expect(items.map((i) => i.courseId)).not.toContain(foodId);
    expect(items.map((i) => i.title)).not.toContain('Handwashing');
  });

  it('marks nothing done before anything is done', async () => {
    const items = await myLibrary();
    expect(items.every((i) => i.completed === false)).toBe(true);
  });

  /** The same rule the course page draws, reaching the same conclusion. */
  it('locks an activity behind an unfinished module, and names the blocker', async () => {
    const items = await myLibrary();
    const gated = items.find((i) => i.id === gatedId);
    expect(gated.unlocked).toBe(false);
    expect(gated.blockedBy.module.title).toBe('Basics');
    expect(gated.blockedBy.remaining).toBe(2);

    // The ungated ones are open.
    expect(items.find((i) => i.id === readingId).unlocked).toBe(true);
  });

  it('follows completions through to ticks and to the lock', async () => {
    await mustWrite('insert activity_completions', svc.from('activity_completions').insert([
      { enrollment_id: aliceEnrollment, activity_id: readingId },
      { enrollment_id: aliceEnrollment, activity_id: videoId },
    ]));

    const items = await myLibrary();
    expect(items.find((i) => i.id === readingId).completed).toBe(true);
    expect(items.find((i) => i.id === quizId).completed).toBe(false);
    // Basics is finished, so Assessment opens.
    expect(items.find((i) => i.id === gatedId).unlocked).toBe(true);
  });
});

describe('a trainee on nothing', () => {
  /**
   * Not vacuous: the identical call returns three activities for Alice. The
   * early return also matters — two `in ()` queries against an empty list is
   * two round trips to be told what the caller already knows.
   */
  it('gets an empty library rather than an error', async () => {
    await become(bob.email);
    expect(await myLibrary()).toEqual([]);
  });
});
