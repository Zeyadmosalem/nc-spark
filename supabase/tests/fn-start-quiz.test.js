import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { serviceClient, createUser, signIn, resetDb, uniqueEmail, SUPABASE_URL } from './helpers.js';

const svc = serviceClient();
const PREFIX = `sq${Date.now()}`;
let trainer, trainee, stranger, cTrainee, cStranger;
let courseId, enrolId;
let modA, modB, actA1, actB1;
let modQuizId, finalQuizId, timedQuizId, lockedQuizId;

async function call(client, body) {
  const { data: { session } } = await client.auth.getSession();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/start-quiz`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

/** Every string key anywhere in a payload, however deeply nested. */
function allKeys(value, found = new Set()) {
  if (Array.isArray(value)) value.forEach((v) => allKeys(v, found));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) { found.add(k); allKeys(v, found); }
  }
  return found;
}

beforeAll(async () => {
  await resetDb();
  trainer  = await createUser({ email: uniqueEmail(), role: 'trainer' });
  trainee  = await createUser({ email: uniqueEmail(), role: 'trainee' });
  stranger = await createUser({ email: uniqueEmail(), role: 'trainee' });

  const { data: c } = await svc.from('courses').insert({
    slug: `${PREFIX}-1`, title: 'Start Course', status: 'published',
    trainer_id: trainer.id, created_by: trainer.id,
  }).select().single();
  courseId = c.id;

  // Module A is open; module B needs A finished.
  const { data: a } = await svc.from('modules')
    .insert({ course_id: courseId, title: 'A', position: 1 }).select().single();
  modA = a.id;
  const { data: b } = await svc.from('modules')
    .insert({ course_id: courseId, title: 'B', position: 2, unlock_after_module_id: modA })
    .select().single();
  modB = b.id;

  const mkAct = async (moduleId, position, type = 'reading') => {
    const { data } = await svc.from('activities').insert({
      module_id: moduleId, type, title: `${type}-${position}`, position,
      content: type === 'reading' ? { body: 'x' } : {},
    }).select().single();
    return data.id;
  };
  actA1 = await mkAct(modA, 1);
  const quizActA = await mkAct(modA, 2, 'quiz');
  actB1 = await mkAct(modB, 1, 'quiz');

  const mkQuiz = async (over) => {
    const { data } = await svc.from('quizzes')
      .insert({ course_id: courseId, title: 'Q', ...over }).select().single();
    const { data: q } = await svc.from('quiz_questions').insert({
      quiz_id: data.id, type: 'mcq', position: 1,
      prompt: 'Which loop runs at least once?', options: ['for', 'while', 'do...while'],
    }).select().single();
    await svc.from('quiz_answer_keys').insert({
      question_id: q.id, answer: { index: 2 },
      explanation: 'do...while checks its condition AFTER the first run.',
    });
    return data.id;
  };

  modQuizId    = await mkQuiz({ activity_id: quizActA });
  lockedQuizId = await mkQuiz({ activity_id: actB1 });
  finalQuizId  = await mkQuiz({ activity_id: null });

  // A second course carrying a timed quiz, so the deadline can be asserted.
  const { data: c2 } = await svc.from('courses').insert({
    slug: `${PREFIX}-2`, title: 'Timed Course', status: 'published',
    trainer_id: trainer.id, created_by: trainer.id,
  }).select().single();
  const { data: tq } = await svc.from('quizzes')
    .insert({ course_id: c2.id, title: 'Timed', time_limit_seconds: 600 }).select().single();
  timedQuizId = tq.id;
  await svc.from('quiz_questions')
    .insert({ quiz_id: timedQuizId, type: 'truefalse', position: 1, prompt: 'True?' });
  await svc.from('enrollments')
    .insert({ trainee_id: trainee.id, course_id: c2.id, status: 'active' });

  const { data: e } = await svc.from('enrollments')
    .insert({ trainee_id: trainee.id, course_id: courseId, status: 'active' }).select().single();
  enrolId = e.id;

  [cTrainee, cStranger] = await Promise.all([signIn(trainee.email), signIn(stranger.email)]);
});
afterAll(async () => {
  await svc.from('quiz_retake_grants').delete().in('quiz_id', [modQuizId, finalQuizId, lockedQuizId]);
  await svc.from('courses').delete().like('slug', `${PREFIX}-%`);
  await resetDb();
});

describe('start-quiz', () => {
  it('rejects a missing quizId', async () => {
    const res = await call(cTrainee, {});
    expect(res.status).toBe(400);
  });

  it('returns 404 for an unknown quiz', async () => {
    const res = await call(cTrainee, { quizId: '00000000-0000-0000-0000-000000000000' });
    expect(res.status).toBe(404);
  });

  it('REJECTS a trainee who is not enrolled', async () => {
    const res = await call(cStranger, { quizId: modQuizId });
    expect(res.status).toBe(403);
  });

  it('opens an attempt on an unlocked module quiz', async () => {
    const res = await call(cTrainee, { quizId: modQuizId });
    expect(res.status).toBe(200);
    expect(res.body.attempt.attemptNo).toBe(1);
    expect(res.body.questions).toHaveLength(1);
  });

  // The entire point of the milestone.
  it('returns NO answer and NO explanation anywhere in the payload', async () => {
    const res = await call(cTrainee, { quizId: modQuizId });
    const keys = [...allKeys(res.body)];
    expect(keys).not.toContain('answer');
    expect(keys).not.toContain('explanation');
    expect(keys).not.toContain('isCorrect');
    expect(JSON.stringify(res.body)).not.toMatch(/do\.\.\.while checks its condition AFTER/);
  });

  it('still returns the prompt and options, so the quiz is answerable', async () => {
    const res = await call(cTrainee, { quizId: modQuizId });
    const q = res.body.questions[0];
    expect(q.prompt).toMatch(/Which loop/);
    expect(q.options).toEqual(['for', 'while', 'do...while']);
  });

  // Re-entry after a refresh must not burn the single attempt.
  it('returns the SAME attempt when one is already in progress', async () => {
    const first  = await call(cTrainee, { quizId: modQuizId });
    const second = await call(cTrainee, { quizId: modQuizId });
    expect(second.status).toBe(200);
    expect(second.body.attempt.id).toBe(first.body.attempt.id);
    const { count } = await svc.from('quiz_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('quiz_id', modQuizId).eq('trainee_id', trainee.id);
    expect(count).toBe(1);
  });

  it('REJECTS a quiz in a locked module with 423', async () => {
    const res = await call(cTrainee, { quizId: lockedQuizId });
    expect(res.status).toBe(423);
  });

  it('REJECTS the course final while activities are outstanding', async () => {
    const res = await call(cTrainee, { quizId: finalQuizId });
    expect(res.status).toBe(423);
  });

  it('sets a deadline from the time limit', async () => {
    const res = await call(cTrainee, { quizId: timedQuizId });
    expect(res.status).toBe(200);
    const started = new Date(res.body.attempt.startedAt).getTime();
    const deadline = new Date(res.body.attempt.deadline).getTime();
    expect(Math.round((deadline - started) / 1000)).toBe(600);
  });

  it('leaves the deadline null when the quiz has no limit', async () => {
    const res = await call(cTrainee, { quizId: modQuizId });
    expect(res.body.attempt.deadline).toBeNull();
  });
});

describe('start-quiz retakes', () => {
  it('REFUSES a second attempt once the first is finished', async () => {
    await svc.from('quiz_attempts')
      .update({ status: 'failed', passed: false, submitted_at: new Date().toISOString() })
      .eq('quiz_id', modQuizId).eq('trainee_id', trainee.id);
    const res = await call(cTrainee, { quizId: modQuizId });
    expect(res.status).toBe(409);
  });

  it('allows attempt 2 once a trainer grants a retake, and consumes the grant', async () => {
    await svc.from('quiz_retake_grants')
      .insert({ quiz_id: modQuizId, trainee_id: trainee.id, granted_by: trainer.id });

    const res = await call(cTrainee, { quizId: modQuizId });
    expect(res.status).toBe(200);
    expect(res.body.attempt.attemptNo).toBe(2);

    const { data: grants } = await svc.from('quiz_retake_grants')
      .select('consumed_at').eq('quiz_id', modQuizId).eq('trainee_id', trainee.id);
    expect(grants.every((g) => g.consumed_at !== null)).toBe(true);
  });

  it('REFUSES a third attempt, because the grant is spent', async () => {
    await svc.from('quiz_attempts')
      .update({ status: 'failed', passed: false })
      .eq('quiz_id', modQuizId).eq('trainee_id', trainee.id).eq('attempt_no', 2);
    const res = await call(cTrainee, { quizId: modQuizId });
    expect(res.status).toBe(409);
  });
});
