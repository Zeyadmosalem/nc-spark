// Supervisor oversight, through the real api layer.
//
// The load-bearing assertion is `quizTitle`. Backlog B5: quiz_attempts_select
// has matched supervisors since M4 and quizzes_select did not, so a supervisor
// could read an attempt and not the quiz it was on. Migration
// 20260825000100_supervisor_reads.sql closed that, and this is what proves it —
// mutation-tested by removing the supervisor clause from quizzes_select, which
// turns every title into "Unknown quiz" and fails here.
//
// The other half is the boundary: a supervisor sees the trainers linked to
// them and nothing else. An unmanaged trainer's course, enrolments and
// attempts must stay invisible.

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

process.env.VITE_SUPABASE_URL = env.SUPABASE_URL;
process.env.VITE_SUPABASE_ANON_KEY = env.SUPABASE_ANON_KEY;

const { supabase } = await import('../../src/api/client.js');
const { myTrainers, teamCourses, teamEnrollments, teamQuizAttempts } =
  await import('../../src/api/supervisor.js');

const svc = serviceClient();
const PASSWORD = 'Test-Passw0rd!';
const PREFIX = `sup${Date.now()}`;

let supervisor, mine, theirs, alice, bob;
let myPublished, myDraft, theirCourse, myQuiz, theirQuiz;
const madeUsers = [];

const must = ({ error }, what) => {
  if (error) throw new Error(`fixture: could not ${what} - ${error.message}`);
};

async function become(email) {
  await supabase.auth.signOut();
  const { error } = await supabase.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`could not sign in as ${email}: ${error.message}`);
}

async function mk(role) {
  const u = await createUser({ email: uniqueEmail(), role });
  madeUsers.push(u.id);
  return u;
}

async function makeCourse(trainerId, slug, title, status) {
  const { data, error } = await svc.from('courses').insert({
    slug, title, status, trainer_id: trainerId, created_by: trainerId,
  }).select().single();
  must({ error }, `create course ${slug}`);
  return data.id;
}

/** A course with one module, one activity, one quiz and one finished attempt. */
async function fill(courseId, quizTitle, traineeId) {
  const { data: m, error: mErr } = await svc.from('modules')
    .insert({ course_id: courseId, title: 'M1', position: 1 }).select().single();
  must({ error: mErr }, 'create module');
  must(await svc.from('activities').insert({
    module_id: m.id, type: 'reading', title: 'Read', position: 1, content: { body: 'x' },
  }), 'create activity');

  const { data: q, error: qErr } = await svc.from('quizzes')
    .insert({ course_id: courseId, title: quizTitle, pass_mark: 0.7 }).select().single();
  must({ error: qErr }, 'create quiz');

  const { data: e, error: eErr } = await svc.from('enrollments')
    .insert({ trainee_id: traineeId, course_id: courseId, status: 'active' })
    .select().single();
  must({ error: eErr }, 'enrol a trainee');

  must(await svc.from('quiz_attempts').insert({
    quiz_id: q.id, trainee_id: traineeId, enrollment_id: e.id, attempt_no: 1,
    status: 'passed', submitted_at: new Date().toISOString(),
    auto_score: 90, final_score: 90, passed: true,
  }), 'record an attempt');

  return q.id;
}

beforeAll(async () => {
  supervisor = await mk('supervisor');
  mine       = await mk('trainer');
  theirs     = await mk('trainer');
  alice      = await mk('trainee');
  bob        = await mk('trainee');

  must(await svc.from('supervisor_trainers')
    .insert({ supervisor_id: supervisor.id, trainer_id: mine.id }), 'link the trainer');

  myPublished = await makeCourse(mine.id,   `${PREFIX}-mine-pub`,   'Managed Published', 'published');
  myDraft     = await makeCourse(mine.id,   `${PREFIX}-mine-draft`, 'Managed Draft',     'draft');
  theirCourse = await makeCourse(theirs.id, `${PREFIX}-theirs`,     'Somebody Else',     'published');

  myQuiz    = await fill(myPublished, 'Managed Quiz', alice.id);
  theirQuiz = await fill(theirCourse, 'Unmanaged Quiz', bob.id);
}, 120000);

afterAll(async () => {
  await supabase.auth.signOut();
  await svc.from('courses').delete().like('slug', `${PREFIX}-%`);
  for (const id of madeUsers) {
    await svc.auth.admin.deleteUser(id).catch(() => null);
  }
});

describe('a supervisor', () => {
  beforeAll(() => become(supervisor.email));

  it('sees the trainers linked to them, and only those', async () => {
    const trainers = await myTrainers();
    expect(trainers.map((t) => t.id)).toEqual([mine.id]);
    expect(trainers[0].email).toBe(mine.email);
  });

  /**
   * Including the draft. enrollments_select_supervisor does not filter on
   * course status, so without courses_select_supervisor a supervisor can hold
   * an enrolment row whose course they cannot name.
   */
  it('sees a managed trainer courses, drafts included', async () => {
    const courses = await teamCourses([mine.id]);
    const ids = courses.map((c) => c.id);
    expect(ids).toContain(myPublished);
    expect(ids).toContain(myDraft);
    expect(ids).not.toContain(theirCourse);
  });

  it('sees enrolments on managed courses only', async () => {
    const enrolments = await teamEnrollments();
    const courseIds = new Set(enrolments.map((e) => e.courseId));
    expect(courseIds.has(myPublished)).toBe(true);
    expect(courseIds.has(theirCourse)).toBe(false);
  });

  /**
   * Backlog B5. Before 20260825000100 the attempt came back and the quiz did
   * not, so this rendered "Unknown quiz" — which is exactly what the fallback
   * in teamQuizAttempts produces, making this assertion the regression test.
   */
  it('can name the quiz an attempt was on', async () => {
    const attempts = await teamQuizAttempts();
    const mineAttempt = attempts.find((a) => a.quizId === myQuiz);
    expect(mineAttempt).toBeDefined();
    expect(mineAttempt.quizTitle).toBe('Managed Quiz');
    expect(mineAttempt.courseId).toBe(myPublished);
    expect(mineAttempt.score).toBe(90);
  });

  it('sees no attempt from an unmanaged trainer course', async () => {
    const attempts = await teamQuizAttempts();
    expect(attempts.map((a) => a.quizId)).not.toContain(theirQuiz);
  });

  /**
   * A supervisor manages trainers, not trainees. profiles_select_supervised
   * matches only trainers, and the oversight screens are aggregate by design —
   * this pins that the database agrees.
   */
  it('cannot read a trainee name', async () => {
    const { data } = await supabase.from('profiles').select('id, name').eq('id', alice.id);
    expect(data).toEqual([]);
  });

  it('still cannot read an answer key', async () => {
    const { data, error } = await supabase.from('quiz_answer_keys').select('*');
    expect(error ?? { message: '' }).toBeTruthy();
    expect(data ?? []).toEqual([]);
  });
});

describe('an unrelated trainer', () => {
  beforeAll(() => become(theirs.email));

  // Not vacuous: the supervisor above gets a non-empty list from the same call.
  it('supervises nobody', async () => {
    expect(await myTrainers()).toEqual([]);
  });

  /**
   * teamCourses is filtered by the ids it is given, not by who is asking, so
   * asking it about somebody else's trainer still returns whatever RLS allows.
   * That is the PUBLISHED course, which everyone may see — and never the
   * draft, which is the part that would be a leak.
   *
   * The screens are safe because they only ever pass ids from myTrainers,
   * which is empty here. This pins both halves of that reasoning.
   */
  it('cannot reach a draft course by asking about a trainer they do not manage', async () => {
    const ids = (await teamCourses([mine.id])).map((c) => c.id);
    expect(ids).toContain(myPublished);
    expect(ids).not.toContain(myDraft);
  });
});
