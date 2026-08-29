// The trainee record screens, running the code the browser runs.
//
// Same reasoning as admin-console.test.js: src/api/progress.js contains a
// two-level PostgREST embed — `quizzes(id, title, pass_mark, courses(id, title))`
// — that only the server can validate. The frontend tests mock `from`, so they
// pass whatever string is written there.
//
// It also pins the boundary that matters on these screens: a trainee's own
// record, and nobody else's.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  serviceClient, createUser, uniqueEmail, applyAppEnv, becomeWith,
  mustWrite,
} from './helpers.js';

applyAppEnv();

const { supabase } = await import('../../src/api/client.js');
const { myQuizResults, completedActivityCount } = await import('../../src/api/progress.js');
const { myEnrollments, courseEnrollments } = await import('../../src/api/enrollments.js');

const svc = serviceClient();
const PASSWORD = 'Test-Passw0rd!';

const become = becomeWith(supabase, PASSWORD);
const PREFIX = `tp${Date.now()}`;

let trainer, alice, bob, courseId, quizId;
let aliceEnrollment, bobEnrollment;
const madeUsers = [];

async function mk(role) {
  const u = await createUser({ email: uniqueEmail(), role });
  madeUsers.push(u.id);
  return u;
}

beforeAll(async () => {
  trainer = await mk('trainer');
  alice   = await mk('trainee');
  bob     = await mk('trainee');

  const { data: c } = await svc.from('courses').insert({
    slug: `${PREFIX}-course`, title: 'Progress Course', status: 'published',
    trainer_id: trainer.id, created_by: trainer.id,
  }).select().single();
  courseId = c.id;

  const { data: m } = await svc.from('modules')
    .insert({ course_id: courseId, title: 'M1', position: 1 }).select().single();
  const { data: a1 } = await svc.from('activities').insert({
    module_id: m.id, type: 'reading', title: 'Read this', position: 1, content: { body: 'x' },
  }).select().single();
  const { data: a2 } = await svc.from('activities').insert({
    module_id: m.id, type: 'reading', title: 'And this', position: 2, content: { body: 'y' },
  }).select().single();

  const { data: q } = await svc.from('quizzes')
    .insert({ course_id: courseId, title: 'Module 1 check', pass_mark: 0.7 }).select().single();
  quizId = q.id;

  const enrol = async (traineeId) => {
    const { data } = await svc.from('enrollments')
      .insert({ trainee_id: traineeId, course_id: courseId, status: 'active' })
      .select().single();
    return data.id;
  };
  aliceEnrollment = await enrol(alice.id);
  bobEnrollment = await enrol(bob.id);

  // Alice finishes both activities and a quiz. Bob finishes one activity, so
  // the counts are genuinely different and a leak would be visible.
  // Every fixture insert is asserted. An unchecked one that silently fails
  // turns into an assertion failure three tests later that blames the code.
  const must = ({ error }, what) => {
    if (error) throw new Error(`fixture: could not ${what} - ${error.message}`);
  };

  must(await svc.from('activity_completions').insert([
    { enrollment_id: aliceEnrollment, activity_id: a1.id },
    { enrollment_id: aliceEnrollment, activity_id: a2.id },
    { enrollment_id: bobEnrollment,   activity_id: a1.id },
  ]), 'record activity completions');

  // enrollment_id is NOT NULL on quiz_attempts. Leaving it out is how this
  // fixture first failed, and the empty result looked like a bug in the query.
  must(await svc.from('quiz_attempts').insert({
    quiz_id: quizId, trainee_id: alice.id, enrollment_id: aliceEnrollment,
    attempt_no: 1, status: 'passed', submitted_at: new Date().toISOString(),
    auto_score: 85, final_score: 85, passed: true,
  }), 'record a finished attempt');

  // An attempt still open must not appear in a finished-quiz history.
  must(await svc.from('quiz_attempts').insert({
    quiz_id: quizId, trainee_id: alice.id, enrollment_id: aliceEnrollment,
    attempt_no: 2, status: 'in_progress',
  }), 'record an in-progress attempt');
}, 90000);

afterAll(async () => {
  await supabase.auth.signOut();
  await mustWrite('delete courses', svc.from('courses').delete().eq('id', courseId));
  for (const id of madeUsers) {
    await svc.auth.admin.deleteUser(id).catch(() => null);
  }
});

describe('a trainee reading their own record', () => {
  beforeAll(() => become(alice.email));

  it('reads the quiz history with the course name joined in', async () => {
    const results = await myQuizResults();
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      quizTitle: 'Module 1 check',
      courseTitle: 'Progress Course',
      attemptNo: 1,
      status: 'passed',
      score: 85,
      passed: true,
    });
  });

  it('leaves an unfinished attempt out of the history', async () => {
    const results = await myQuizResults();
    expect(results.every((r) => r.submittedAt)).toBe(true);
    expect(results.map((r) => r.attemptNo)).not.toContain(2);
  });

  it('counts only their own completions', async () => {
    const enrolments = await myEnrollments();
    const ids = enrolments.map((e) => e.id);
    expect(ids).toContain(aliceEnrollment);
    expect(await completedActivityCount(ids)).toBe(2);
  });
});

describe('a trainee cannot reach another trainee record', () => {
  beforeAll(() => become(bob.email));

  /**
   * The count is scoped by the enrolment ids the caller passes in, so this asks
   * what happens when someone passes an id that is not theirs. RLS on
   * activity_completions has to be what stops it, not the argument.
   */
  it('gets nothing when passed somebody else enrolment id', async () => {
    expect(await completedActivityCount([aliceEnrollment])).toBe(0);
  });

  it('still gets their own count right', async () => {
    expect(await completedActivityCount([bobEnrollment])).toBe(1);
  });

  // Not vacuous: the same call returns one row for Alice, above.
  it('sees no quiz history that is not theirs', async () => {
    expect(await myQuizResults()).toEqual([]);
  });
});

/**
 * The trainer half of the same data.
 *
 * courseEnrollments carries `profiles!enrollments_trainee_id_fkey(...)`, which
 * is a string only PostgREST can validate — the frontend tests mock `from`.
 * It is also a deliberately different privacy posture from the supervisor's
 * teamEnrollments, which omits trainee identity entirely, so the boundary is
 * worth pinning rather than assuming.
 */
describe('a trainer reading their cohort', () => {
  beforeAll(() => become(trainer.email));

  it('sees the enrolments on their own course, with the trainees named', async () => {
    const rows = await courseEnrollments();
    const mine = rows.filter((r) => r.courseId === courseId);
    expect(mine).toHaveLength(2);
    expect(mine.map((r) => r.traineeName).sort())
      .toEqual([alice.name, bob.name].sort());
    expect(mine.every((r) => typeof r.percent === 'number')).toBe(true);
  });

  it('reads real progress, not a placeholder', async () => {
    const rows = await courseEnrollments();
    const hers = rows.find((r) => r.id === aliceEnrollment);
    // Alice finished both activities in the fixture.
    expect(hers.percent).toBe(100);
  });
});

describe('a trainee calling the trainer read', () => {
  beforeAll(() => become(bob.email));

  /**
   * enrollments_select_own still matches, so this is not empty — it is
   * narrowed to the caller. Bob must not see Alice's row.
   */
  it('gets only their own enrolment back', async () => {
    const rows = await courseEnrollments();
    expect(rows.map((r) => r.id)).toContain(bobEnrollment);
    expect(rows.map((r) => r.id)).not.toContain(aliceEnrollment);
  });
});
