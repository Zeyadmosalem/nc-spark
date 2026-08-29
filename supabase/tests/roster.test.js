// The course roster, through the real api layer.
//
// Worth running live for two reasons a mocked test cannot reach:
//
// 1. The embeds. `profiles!enrollments_trainee_id_fkey` and the
//    `quizzes!inner(course_id)` filter are plain strings that only PostgREST
//    can validate, and the enrollment_progress view has already produced one
//    embed in this codebase that looked right and never worked.
// 2. Who may read it. A trainer sees the people on their own courses because
//    profiles_select_my_trainees says so — and a trainer on a different
//    course must not, which is a property of the policies rather than of
//    anything the component remembered to filter.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { serviceClient, createUser, uniqueEmail, applyAppEnv } from './helpers.js';

applyAppEnv();

const { supabase } = await import('../../src/api/client.js');
const { courseRoster } = await import('../../src/api/roster.js');

const svc = serviceClient();
const PASSWORD = 'Test-Passw0rd!';
const PREFIX = `ros${Date.now()}`;

let trainer, other, admin, alice, bob, carol;
const madeUsers = [];
let courseId, readingId, quizActivityId, quizId;

async function become(email) {
  await supabase.auth.signOut();
  const { error } = await supabase.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`could not sign in as ${email}: ${error.message}`);
}

async function mk(role, name) {
  const u = await createUser({ email: uniqueEmail(), role, name });
  madeUsers.push(u.id);
  return u;
}

function must(what, { data, error }) {
  if (error) throw new Error(`fixture ${what}: ${error.message}`);
  if (!data) throw new Error(`fixture ${what}: no row returned`);
  return data;
}

const enrol = async (trainee, status = 'active') => must('enrollment',
  await svc.from('enrollments')
    .insert({ trainee_id: trainee.id, course_id: courseId, status }).select().single());

beforeAll(async () => {
  trainer = await mk('trainer', 'Tara Trainer');
  other = await mk('trainer', 'Other Trainer');
  admin = await mk('admin', 'Ada Admin');
  alice = await mk('trainee', 'Alice Ahmed');
  bob = await mk('trainee', 'Bob Brown');
  carol = await mk('trainee', 'Carol Chen');

  const course = must('course', await svc.from('courses').insert({
    slug: `${PREFIX}-course`, title: 'Roster Course', status: 'published',
    trainer_id: trainer.id, created_by: admin.id,
  }).select().single());
  courseId = course.id;

  const mod = must('module', await svc.from('modules')
    .insert({ course_id: courseId, title: 'Module one', position: 1 }).select().single());

  readingId = must('reading', await svc.from('activities').insert({
    module_id: mod.id, type: 'reading', title: 'Read this', position: 1,
    content: { body: 'x' },
  }).select().single()).id;

  quizActivityId = must('quiz activity', await svc.from('activities').insert({
    module_id: mod.id, type: 'quiz', title: 'Module quiz', position: 2, content: {},
  }).select().single()).id;

  quizId = must('quiz', await svc.from('quizzes').insert({
    course_id: courseId, activity_id: quizActivityId, title: 'Module quiz', pass_mark: 0.5,
  }).select().single()).id;

  // Alice has done the reading. Bob has done nothing. Carol has finished.
  const aliceE = await enrol(alice);
  await enrol(bob);
  const carolE = await enrol(carol, 'completed');

  await svc.from('activity_completions').insert([
    { enrollment_id: aliceE.id, activity_id: readingId },
    { enrollment_id: carolE.id, activity_id: readingId },
    { enrollment_id: carolE.id, activity_id: quizActivityId },
  ]);

  // One graded attempt and one still waiting on a human.
  await svc.from('quiz_attempts').insert([
    {
      quiz_id: quizId, trainee_id: carol.id, enrollment_id: carolE.id, attempt_no: 1,
      status: 'passed', submitted_at: new Date(Date.now() - 60000).toISOString(),
      auto_score: 90, final_score: 90, passed: true,
    },
    {
      quiz_id: quizId, trainee_id: alice.id, enrollment_id: aliceE.id, attempt_no: 1,
      status: 'pending_review', submitted_at: new Date().toISOString(),
      auto_score: 40, final_score: null, passed: null,
    },
  ]);
}, 90000);

afterAll(async () => {
  await supabase.auth.signOut();
  await svc.from('courses').delete().like('slug', `${PREFIX}-%`);
  for (const id of madeUsers) {
    await svc.auth.admin.deleteUser(id).catch(() => null);
  }
});

describe('the trainer who owns the course', () => {
  let roster;

  beforeAll(async () => {
    await become(trainer.email);
    roster = await courseRoster(courseId);
  });

  /** The whole point: a trainer may see the people on their own courses. */
  it('names everybody on it', () => {
    expect(roster.map((p) => p.name).sort())
      .toEqual(['Alice Ahmed', 'Bob Brown', 'Carol Chen']);
  });

  it('reports each person their own progress', () => {
    const by = Object.fromEntries(roster.map((p) => [p.name, p]));
    expect(by['Bob Brown'].percent).toBe(0);
    // One activity of two.
    expect(by['Alice Ahmed'].percent).toBe(50);
    expect(by['Carol Chen'].percent).toBe(100);
  });

  it('says which activities each person finished, not just how many', () => {
    const alice = roster.find((p) => p.name === 'Alice Ahmed');
    expect(alice.completedActivities.has(readingId)).toBe(true);
    expect(alice.completedActivities.has(quizActivityId)).toBe(false);
  });

  /** Completions from one enrolment must not be attributed to another. */
  it('does not mix one person\'s completions into another', () => {
    const bob = roster.find((p) => p.name === 'Bob Brown');
    expect(bob.completedActivities.size).toBe(0);
  });

  it('attaches quiz attempts to the right person', () => {
    const by = Object.fromEntries(roster.map((p) => [p.name, p]));
    expect(by['Bob Brown'].attempts).toHaveLength(0);
    expect(by['Carol Chen'].attempts).toHaveLength(1);
    expect(by['Carol Chen'].attempts[0]).toMatchObject({
      quizTitle: 'Module quiz', score: 90, passed: true, status: 'passed',
    });
  });

  /**
   * An unmarked paragraph has no final score. Coercing it to zero would show a
   * trainer a fail for work they have not read yet.
   */
  it('keeps an unmarked attempt distinguishable from a zero', () => {
    const alice = roster.find((p) => p.name === 'Alice Ahmed');
    expect(alice.attempts[0].status).toBe('pending_review');
    expect(alice.attempts[0].passed).toBeNull();
    // auto_score stands in until the paragraph is marked.
    expect(alice.attempts[0].score).toBe(40);
  });

  it('carries the enrolment status through', () => {
    const carol = roster.find((p) => p.name === 'Carol Chen');
    expect(carol.status).toBe('completed');
  });
});

describe('an admin', () => {
  it('sees the same roster', async () => {
    await become(admin.email);
    const roster = await courseRoster(courseId);
    expect(roster).toHaveLength(3);
    expect(roster.every((p) => p.name !== 'Unnamed')).toBe(true);
  });
});

describe('a trainer who does not own the course', () => {
  /**
   * Not vacuous: the identical call returns three named people for the owner.
   * enrollments_select_course_staff scopes to courses the caller trains, so
   * this is empty rather than forbidden — there is nothing to be denied.
   */
  it('sees nobody', async () => {
    await become(other.email);
    expect(await courseRoster(courseId)).toEqual([]);
  });
});

describe('a trainee on the course', () => {
  /**
   * A trainee's own enrolment is readable, but their classmates' are not, and
   * profiles_select_my_trainees does not match a peer. The roster is a
   * trainer's screen and this proves it cannot be used as a directory.
   */
  it('sees only their own row, and no classmate names', async () => {
    await become(alice.email);
    const roster = await courseRoster(courseId);
    expect(roster.map((p) => p.traineeId)).toEqual([alice.id]);
    expect(roster.map((p) => p.name)).not.toContain('Bob Brown');
  });
});
