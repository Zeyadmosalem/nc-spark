import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  serviceClient, createUser, signIn, resetDb, uniqueEmail, callFunction,
  mustWrite,
} from './helpers.js';

const svc = serviceClient();
const PREFIX = `sub${Date.now()}`;
let trainer, trainee, stranger, cTrainee, cStranger;

const fn = (name, client, body) => callFunction(name, client, body);

function allKeys(value, found = new Set()) {
  if (Array.isArray(value)) value.forEach((v) => allKeys(v, found));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) { found.add(k); allKeys(v, found); }
  }
  return found;
}

let seq = 0;
/**
 * A whole self-contained course: one module, one quiz activity, the questions
 * asked for, and an active enrollment. Each test gets its own, so a submission
 * in one cannot disturb another.
 */
async function scenario({ questions, passMark = 0.7, timeLimit = null, final = false, extraActivity = false }) {
  seq += 1;
  const { data: course } = await svc.from('courses').insert({
    slug: `${PREFIX}-${seq}`, title: 'Submit Course', status: 'published',
    trainer_id: trainer.id, created_by: trainer.id,
  }).select().single();

  const { data: mod } = await svc.from('modules')
    .insert({ course_id: course.id, title: 'M', position: 1 }).select().single();

  let activityId = null;
  if (!final) {
    const { data: a } = await svc.from('activities').insert({
      module_id: mod.id, type: 'quiz', title: 'Quiz', position: 1, content: {},
    }).select().single();
    activityId = a.id;
  }
  if (extraActivity) {
    await mustWrite('insert activities', svc.from('activities').insert({
      module_id: mod.id, type: 'reading', title: 'Extra', position: 2, content: { body: 'x' },
    }));
  }

  const { data: quiz } = await svc.from('quizzes').insert({
    course_id: course.id, activity_id: activityId, title: 'Q',
    pass_mark: passMark, time_limit_seconds: timeLimit,
  }).select().single();

  const ids = [];
  for (const [i, q] of questions.entries()) {
    const { data: row } = await svc.from('quiz_questions').insert({
      quiz_id: quiz.id, type: q.type, position: i + 1, prompt: q.prompt ?? `Q${i + 1}`,
      options: q.options ?? [], points: q.points ?? 1,
    }).select().single();
    ids.push(row.id);
    if (q.answer !== undefined) {
      await mustWrite('insert quiz_answer_keys', svc.from('quiz_answer_keys').insert({
        question_id: row.id, answer: q.answer, explanation: q.explanation ?? 'Because reasons.',
      }));
    }
  }

  const { data: enrollment } = await svc.from('enrollments')
    .insert({ trainee_id: trainee.id, course_id: course.id, status: 'active' }).select().single();

  return { courseId: course.id, quizId: quiz.id, activityId, questionIds: ids, enrollment };
}

const MCQ = { type: 'mcq', options: ['for', 'while', 'do...while'], answer: { index: 2 } };
const TF  = { type: 'truefalse', answer: { value: true } };

beforeAll(async () => {
  await resetDb();
  trainer  = await createUser({ email: uniqueEmail(), role: 'trainer' });
  trainee  = await createUser({ email: uniqueEmail(), role: 'trainee' });
  stranger = await createUser({ email: uniqueEmail(), role: 'trainee' });
  [cTrainee, cStranger] = await Promise.all([signIn(trainee.email), signIn(stranger.email)]);
});
afterAll(async () => {
  await mustWrite('delete courses', svc.from('courses').delete().like('slug', `${PREFIX}-%`));
  await resetDb();
});

const start = (quizId) => fn('start-quiz', cTrainee, { quizId });
const submit = (attemptId, answers, client = cTrainee) =>
  fn('submit-quiz', client, { attemptId, answers });

describe('submit-quiz grading', () => {
  it('grades every answer correct as a pass', async () => {
    const s = await scenario({ questions: [MCQ, TF] });
    const { body: started } = await start(s.quizId);
    const res = await submit(started.attempt.id, [
      { questionId: s.questionIds[0], response: { index: 2 } },
      { questionId: s.questionIds[1], response: { value: true } },
    ]);
    expect(res.status).toBe(200);
    expect(res.body.passed).toBe(true);
    expect(res.body.score).toBe(100);
    expect(res.body.status).toBe('passed');
  });

  it('grades a wrong mcq as incorrect', async () => {
    const s = await scenario({ questions: [MCQ, TF] });
    const { body: started } = await start(s.quizId);
    const res = await submit(started.attempt.id, [
      { questionId: s.questionIds[0], response: { index: 0 } },
      { questionId: s.questionIds[1], response: { value: true } },
    ]);
    expect(res.body.score).toBe(50);
    expect(res.body.passed).toBe(false);
    const byId = Object.fromEntries(res.body.perQuestion.map((p) => [p.questionId, p.isCorrect]));
    expect(byId[s.questionIds[0]]).toBe(false);
    expect(byId[s.questionIds[1]]).toBe(true);
  });

  it('grades a wrong truefalse as incorrect', async () => {
    const s = await scenario({ questions: [TF] });
    const { body: started } = await start(s.quizId);
    const res = await submit(started.attempt.id, [
      { questionId: s.questionIds[0], response: { value: false } },
    ]);
    expect(res.body.score).toBe(0);
    expect(res.body.passed).toBe(false);
  });

  it('scores an unanswered question zero rather than erroring', async () => {
    const s = await scenario({ questions: [MCQ, TF] });
    const { body: started } = await start(s.quizId);
    const res = await submit(started.attempt.id, [
      { questionId: s.questionIds[0], response: { index: 2 } },
    ]);
    expect(res.status).toBe(200);
    expect(res.body.score).toBe(50);
  });

  it('honours points, so a heavier question weighs more', async () => {
    const s = await scenario({
      questions: [{ ...MCQ, points: 3 }, { ...TF, points: 1 }], passMark: 0.7,
    });
    const { body: started } = await start(s.quizId);
    const res = await submit(started.attempt.id, [
      { questionId: s.questionIds[0], response: { index: 2 } },
      { questionId: s.questionIds[1], response: { value: false } },
    ]);
    expect(res.body.score).toBe(75);
    expect(res.body.passed).toBe(true);
  });

  it('ignores a response for a question that is not in this quiz', async () => {
    const s = await scenario({ questions: [TF] });
    const other = await scenario({ questions: [TF] });
    const { body: started } = await start(s.quizId);
    const res = await submit(started.attempt.id, [
      { questionId: s.questionIds[0], response: { value: true } },
      { questionId: other.questionIds[0], response: { value: true } },
    ]);
    expect(res.status).toBe(200);
    const { count } = await svc.from('quiz_answers')
      .select('id', { count: 'exact', head: true }).eq('attempt_id', started.attempt.id);
    expect(count).toBe(1);
  });
});

describe('submit-quiz tells the trainee nothing extra', () => {
  it('returns no correct answer and no explanation anywhere', async () => {
    const s = await scenario({ questions: [MCQ, TF] });
    const { body: started } = await start(s.quizId);
    const res = await submit(started.attempt.id, [
      { questionId: s.questionIds[0], response: { index: 0 } },
      { questionId: s.questionIds[1], response: { value: false } },
    ]);
    const keys = [...allKeys(res.body)];
    expect(keys).not.toContain('answer');
    expect(keys).not.toContain('explanation');
    expect(JSON.stringify(res.body)).not.toMatch(/Because reasons/);
    // Right/wrong per question is allowed; the right answer is not.
    expect(res.body.perQuestion[0]).toHaveProperty('isCorrect');
  });
});

describe('submit-quiz and completion', () => {
  it('records the activity completion on a pass', async () => {
    const s = await scenario({ questions: [TF] });
    const { body: started } = await start(s.quizId);
    await submit(started.attempt.id, [{ questionId: s.questionIds[0], response: { value: true } }]);
    const { data } = await svc.from('activity_completions')
      .select('id').eq('enrollment_id', s.enrollment.id).eq('activity_id', s.activityId);
    expect(data).toHaveLength(1);
  });

  it('records NOTHING on a fail, so the module stays locked', async () => {
    const s = await scenario({ questions: [TF] });
    const { body: started } = await start(s.quizId);
    await submit(started.attempt.id, [{ questionId: s.questionIds[0], response: { value: false } }]);
    const { data } = await svc.from('activity_completions')
      .select('id').eq('enrollment_id', s.enrollment.id);
    expect(data ?? []).toHaveLength(0);
  });

  it('holds an attempt with a paragraph at pending_review and completes nothing', async () => {
    const s = await scenario({ questions: [TF, { type: 'paragraph', points: 2 }] });
    const { body: started } = await start(s.quizId);
    const res = await submit(started.attempt.id, [
      { questionId: s.questionIds[0], response: { value: true } },
      { questionId: s.questionIds[1], response: { text: 'A loop repeats work.' } },
    ]);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('pending_review');
    expect(res.body.passed).toBeNull();
    const { data } = await svc.from('activity_completions')
      .select('id').eq('enrollment_id', s.enrollment.id);
    expect(data ?? []).toHaveLength(0);
  });

  it('leaves a paragraph answer ungraded rather than marking it wrong', async () => {
    const s = await scenario({ questions: [{ type: 'paragraph' }] });
    const { body: started } = await start(s.quizId);
    await submit(started.attempt.id, [
      { questionId: s.questionIds[0], response: { text: 'My answer.' } },
    ]);
    const { data } = await svc.from('quiz_answers')
      .select('is_correct, awarded').eq('attempt_id', started.attempt.id).single();
    expect(data.is_correct).toBeNull();
    expect(data.awarded).toBeNull();
  });
});

describe('submit-quiz refusals', () => {
  it('rejects a missing attemptId', async () => {
    const res = await fn('submit-quiz', cTrainee, { answers: [] });
    expect(res.status).toBe(400);
  });

  it('REJECTS somebody else attempt', async () => {
    const s = await scenario({ questions: [TF] });
    const { body: started } = await start(s.quizId);
    const res = await submit(started.attempt.id, [], cStranger);
    expect(res.status).toBe(403);
  });

  it('REJECTS a second submission of the same attempt', async () => {
    const s = await scenario({ questions: [TF] });
    const { body: started } = await start(s.quizId);
    await submit(started.attempt.id, [{ questionId: s.questionIds[0], response: { value: true } }]);
    const again = await submit(started.attempt.id, [
      { questionId: s.questionIds[0], response: { value: true } },
    ]);
    expect(again.status).toBe(409);
  });

  it('marks a late submission expired and grades what arrived', async () => {
    const s = await scenario({ questions: [MCQ, TF], timeLimit: 60 });
    const { body: started } = await start(s.quizId);
    // Backdate the start so the deadline has already passed.
    await mustWrite('update quiz_attempts', svc.from('quiz_attempts')
      .update({ started_at: new Date(Date.now() - 3600_000).toISOString() })
      .eq('id', started.attempt.id));
    const res = await submit(started.attempt.id, [
      { questionId: s.questionIds[0], response: { index: 2 } },
      { questionId: s.questionIds[1], response: { value: true } },
    ]);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('expired');
    expect(res.body.passed).toBe(false);
    const { data } = await svc.from('activity_completions')
      .select('id').eq('enrollment_id', s.enrollment.id);
    expect(data ?? []).toHaveLength(0);
  });
});

describe('submit-quiz and the course final', () => {
  it('does not complete the enrollment until the final is passed', async () => {
    const s = await scenario({ questions: [TF], final: true, extraActivity: true });
    // Finish the one non-quiz activity so the final unlocks.
    const { data: acts } = await svc.from('activities')
      .select('id, modules!inner(course_id)').eq('modules.course_id', s.courseId);
    for (const a of acts) {
      await mustWrite('insert activity_completions', svc.from('activity_completions')
        .insert({ enrollment_id: s.enrollment.id, activity_id: a.id }));
    }

    const before = await svc.from('enrollments').select('status').eq('id', s.enrollment.id).single();
    expect(before.data.status).toBe('active');

    const { body: started } = await start(s.quizId);
    const res = await submit(started.attempt.id, [
      { questionId: s.questionIds[0], response: { value: true } },
    ]);
    expect(res.status).toBe(200);
    expect(res.body.passed).toBe(true);

    const after = await svc.from('enrollments')
      .select('status, completed_at').eq('id', s.enrollment.id).single();
    expect(after.data.status).toBe('completed');
    expect(after.data.completed_at).not.toBeNull();
  });
});
