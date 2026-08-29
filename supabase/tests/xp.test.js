// XP, against the live project.
//
// The points are awarded by database triggers rather than by the Edge
// Functions, so that no future path which completes an activity can forget to
// pay for it. That decision is only as good as these tests: they insert the
// FACT — a completion row, a passed attempt, a message — and assert the points
// followed, without going anywhere near the code that normally does it.
//
// The other half is that a trainee must never be able to award itself. There
// is no insert or update grant on xp_events or trainee_stats for any browser
// role, and the last block here proves it from a real signed-in session.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { serviceClient, createUser, uniqueEmail, applyAppEnv, becomeWith } from './helpers.js';

applyAppEnv();

const { supabase } = await import('../../src/api/client.js');

const svc = serviceClient();
const PASSWORD = 'Test-Passw0rd!';

const become = becomeWith(supabase, PASSWORD);
const PREFIX = `xp${Date.now()}`;

let trainer, otherTrainer, supervisor, admin, alice, bob;
const madeUsers = [];
let courseId, enrollmentId, readingId, quizActivityId, quizId;

function must(what, { data, error }) {
  if (error) throw new Error(`fixture ${what}: ${error.message}`);
  if (!data) throw new Error(`fixture ${what}: no row returned`);
  return data;
}

async function mk(role, name) {
  const u = await createUser({ email: uniqueEmail(), role, name });
  madeUsers.push(u.id);
  return u;
}

const statsOf = async (id) => (await svc
  .from('trainee_stats').select('xp, streak, last_active_on').eq('profile_id', id).single()).data;

const eventsOf = async (id) => (await svc
  .from('xp_events').select('kind, points, source_id, course_id')
  .eq('trainee_id', id).order('created_at')).data ?? [];

beforeAll(async () => {
  trainer = await mk('trainer', 'Tara Trainer');
  otherTrainer = await mk('trainer', 'Owen Other');
  supervisor = await mk('supervisor', 'Sam Super');
  admin = await mk('admin', 'Ada Admin');
  alice = await mk('trainee', 'Alice Ahmed');
  bob = await mk('trainee', 'Bob Brown');

  await svc.from('supervisor_trainers')
    .insert({ supervisor_id: supervisor.id, trainer_id: trainer.id });

  const course = must('course', await svc.from('courses').insert({
    slug: `${PREFIX}-course`, title: 'XP Course', status: 'published',
    trainer_id: trainer.id, created_by: admin.id,
  }).select().single());
  courseId = course.id;

  const mod = must('module', await svc.from('modules')
    .insert({ course_id: courseId, title: 'One', position: 1 }).select().single());

  readingId = must('reading', await svc.from('activities').insert({
    module_id: mod.id, type: 'reading', title: 'Read this', position: 1,
    content: { body: 'x' }, xp: 15,
  }).select().single()).id;

  quizActivityId = must('quiz activity', await svc.from('activities').insert({
    module_id: mod.id, type: 'quiz', title: 'Module quiz', position: 2,
    content: {}, xp: 40,
  }).select().single()).id;

  quizId = must('quiz', await svc.from('quizzes').insert({
    course_id: courseId, activity_id: quizActivityId, title: 'Module quiz', pass_mark: 0.5,
  }).select().single()).id;

  enrollmentId = must('enrollment', await svc.from('enrollments')
    .insert({ trainee_id: alice.id, course_id: courseId, status: 'active' })
    .select().single()).id;
}, 120000);

afterAll(async () => {
  await supabase.auth.signOut();
  await svc.from('courses').delete().like('slug', `${PREFIX}-%`);
  for (const id of madeUsers) {
    await svc.auth.admin.deleteUser(id).catch(() => null);
  }
});

describe('finishing an activity', () => {
  it('pays what the trainer put on it', async () => {
    await svc.from('activity_completions')
      .insert({ enrollment_id: enrollmentId, activity_id: readingId });

    const events = await eventsOf(alice.id);
    const earned = events.find((e) => e.kind === 'activity');

    expect(earned).toMatchObject({ points: 15, source_id: readingId, course_id: courseId });
    expect((await statsOf(alice.id)).xp).toBe(15);
  });

  /**
   * The ledger's unique index. Without it a trainee who unenrolled and came
   * back, or any future code path that re-inserted a completion, would be paid
   * again — and the leaderboard would measure persistence at clicking.
   */
  it('does not pay twice for the same activity', async () => {
    await svc.from('activity_completions').delete()
      .eq('enrollment_id', enrollmentId).eq('activity_id', readingId);
    await svc.from('activity_completions')
      .insert({ enrollment_id: enrollmentId, activity_id: readingId });

    expect((await eventsOf(alice.id)).filter((e) => e.kind === 'activity')).toHaveLength(1);
    expect((await statsOf(alice.id)).xp).toBe(15);
  });
});

describe('passing a quiz', () => {
  it('pays in proportion to the score', async () => {
    const attempt = must('attempt', await svc.from('quiz_attempts').insert({
      quiz_id: quizId, trainee_id: alice.id, enrollment_id: enrollmentId,
      attempt_no: 1, status: 'in_progress',
    }).select().single());

    // 75% of a 40-point quiz.
    await svc.from('quiz_attempts').update({
      status: 'passed', submitted_at: new Date().toISOString(),
      auto_score: 75, final_score: 75, passed: true,
    }).eq('id', attempt.id);

    const earned = (await eventsOf(alice.id)).find((e) => e.kind === 'quiz');
    expect(earned).toMatchObject({ points: 30, source_id: quizId });
    expect((await statsOf(alice.id)).xp).toBe(45);
  });

  /** A retake improves the record; it does not pay a second time. */
  it('does not pay again on a retake', async () => {
    const attempt = must('retake', await svc.from('quiz_attempts').insert({
      quiz_id: quizId, trainee_id: alice.id, enrollment_id: enrollmentId,
      attempt_no: 2, status: 'in_progress',
    }).select().single());

    await svc.from('quiz_attempts').update({
      status: 'passed', submitted_at: new Date().toISOString(),
      auto_score: 100, final_score: 100, passed: true,
    }).eq('id', attempt.id);

    expect((await eventsOf(alice.id)).filter((e) => e.kind === 'quiz')).toHaveLength(1);
    expect((await statsOf(alice.id)).xp).toBe(45);
  });

  it('pays nothing for a failed attempt', async () => {
    const before = (await statsOf(bob.id))?.xp ?? 0;
    const enrolment = must('bob enrolment', await svc.from('enrollments')
      .insert({ trainee_id: bob.id, course_id: courseId, status: 'active' })
      .select().single());
    const attempt = must('bob attempt', await svc.from('quiz_attempts').insert({
      quiz_id: quizId, trainee_id: bob.id, enrollment_id: enrolment.id,
      attempt_no: 1, status: 'in_progress',
    }).select().single());

    await svc.from('quiz_attempts').update({
      status: 'failed', submitted_at: new Date().toISOString(),
      auto_score: 20, final_score: 20, passed: false,
    }).eq('id', attempt.id);

    expect((await statsOf(bob.id)).xp).toBe(before);
  });
});

describe('taking part in the course conversation', () => {
  it('pays a trainee for joining in', async () => {
    await svc.from('messages')
      .insert({ course_id: courseId, user_id: alice.id, body: 'Is the drill on Friday?' });

    const earned = (await eventsOf(alice.id)).find((e) => e.kind === 'participation');
    expect(earned?.points).toBe(2);
    expect((await statsOf(alice.id)).xp).toBe(47);
  });

  /**
   * Capped at one per course per day by a partial unique index. Without it,
   * "being active in class" is a button that prints points and the chat fills
   * with "ok".
   */
  it('pays once a day however much is said', async () => {
    for (let i = 0; i < 5; i += 1) {
      await svc.from('messages')
        .insert({ course_id: courseId, user_id: alice.id, body: `chatter ${i}` });
    }

    expect((await eventsOf(alice.id)).filter((e) => e.kind === 'participation')).toHaveLength(1);
    expect((await statsOf(alice.id)).xp).toBe(47);
  });

  /**
   * A trainer answering questions is doing their job. A leaderboard with staff
   * on it is not a leaderboard.
   */
  it('pays staff nothing', async () => {
    await svc.from('messages')
      .insert({ course_id: courseId, user_id: trainer.id, body: 'Yes, 10am.' });

    expect(await eventsOf(trainer.id)).toHaveLength(0);
  });
});

describe('the streak', () => {
  it('starts at one on the first day anything is earned', async () => {
    expect((await statsOf(alice.id)).streak).toBe(1);
  });

  it('counts days, not awards', async () => {
    // Alice has earned three separate times today.
    const stats = await statsOf(alice.id);
    expect(stats.streak).toBe(1);
    expect(stats.last_active_on).toBe(new Date().toISOString().slice(0, 10));
  });

  it('continues when yesterday was active', async () => {
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    await svc.from('trainee_stats')
      .update({ last_active_on: yesterday, streak: 4 }).eq('profile_id', bob.id);

    const enrolment = (await svc.from('enrollments')
      .select('id').eq('trainee_id', bob.id).eq('course_id', courseId).single()).data;
    await svc.from('activity_completions')
      .insert({ enrollment_id: enrolment.id, activity_id: readingId });

    expect((await statsOf(bob.id)).streak).toBe(5);
  });

  it('restarts after a gap', async () => {
    const longAgo = new Date(Date.now() - 5 * 86400000).toISOString().slice(0, 10);
    await svc.from('trainee_stats')
      .update({ last_active_on: longAgo, streak: 9 }).eq('profile_id', bob.id);

    const enrolment = (await svc.from('enrollments')
      .select('id').eq('trainee_id', bob.id).eq('course_id', courseId).single()).data;
    await svc.from('activity_completions')
      .insert({ enrollment_id: enrolment.id, activity_id: quizActivityId });

    expect((await statsOf(bob.id)).streak).toBe(1);
  });
});

describe('who may read a score', () => {
  it('lets a trainee see their own', async () => {
    await become(alice.email);
    const { data } = await supabase.from('xp_events').select('points');
    expect(data.length).toBeGreaterThan(0);

    const { data: stats } = await supabase
      .from('trainee_stats').select('xp').eq('profile_id', alice.id).single();
    expect(stats.xp).toBe(47);
  });

  it('does not let one trainee read another', async () => {
    await become(bob.email);
    const { data } = await supabase.from('xp_events').select('trainee_id');
    expect(data.every((row) => row.trainee_id === bob.id)).toBe(true);
  });

  /** A trainer runs the class, so the class's standing is theirs to see. */
  it('lets the course trainer see the class', async () => {
    await become(trainer.email);
    const { data } = await supabase.from('xp_events').select('trainee_id, points');
    expect(data.some((row) => row.trainee_id === alice.id)).toBe(true);

    const { data: stats } = await supabase.from('trainee_stats').select('profile_id, xp');
    expect(stats.some((s) => s.profile_id === alice.id)).toBe(true);
  });

  it('does not let a trainer of another course see it', async () => {
    await become(otherTrainer.email);
    const { data } = await supabase.from('xp_events').select('trainee_id');
    expect(data.some((row) => row.trainee_id === alice.id)).toBe(false);
  });

  /** A supervisor reaches a trainee through the trainer they oversee. */
  it('lets the supervisor of that trainer see it', async () => {
    await become(supervisor.email);
    const { data } = await supabase.from('xp_events').select('trainee_id');
    expect(data.some((row) => row.trainee_id === alice.id)).toBe(true);
  });

  it('lets an admin see everything', async () => {
    await become(admin.email);
    const { data } = await supabase.from('xp_events').select('trainee_id');
    expect(data.some((row) => row.trainee_id === alice.id)).toBe(true);
  });
});

describe('what a trainee cannot do to their own score', () => {
  /**
   * The whole integrity of a leaderboard. There is no insert or update grant
   * on either table for `authenticated`, so this fails at the grant rather
   * than at a policy somebody could later widen by accident.
   */
  it('cannot award itself points', async () => {
    await become(alice.email);
    const { error } = await supabase.from('xp_events').insert({
      trainee_id: alice.id, course_id: courseId, kind: 'activity',
      source_id: null, points: 100000,
    });
    expect(error).toBeTruthy();
    expect((await statsOf(alice.id)).xp).toBe(47);
  });

  it('cannot edit the total directly', async () => {
    await become(alice.email);
    await supabase.from('trainee_stats').update({ xp: 99999 }).eq('profile_id', alice.id);
    expect((await statsOf(alice.id)).xp).toBe(47);
  });

  it('cannot delete an award it does not like', async () => {
    await become(alice.email);
    await supabase.from('xp_events').delete().eq('trainee_id', alice.id);
    expect((await eventsOf(alice.id)).length).toBeGreaterThan(0);
  });
});
