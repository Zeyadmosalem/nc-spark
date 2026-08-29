import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  serviceClient, createUser, signIn, resetDb, uniqueEmail, callFunction,
} from './helpers.js';

const svc = serviceClient();
const PREFIX = `qrv${Date.now()}`;
let admin, trainer, otherTrainer, trainee;
let cAdmin, cTrainer, cOther, cTrainee;

const fn = (name, client, body) => callFunction(name, client, body);

let seq = 0;
/** A course with one quiz activity, the questions asked for, and an enrollment. */
async function scenario({ questions, passMark = 0.7 }) {
  seq += 1;
  const { data: course } = await svc.from('courses').insert({
    slug: `${PREFIX}-${seq}`, title: 'Review Course', status: 'published',
    trainer_id: trainer.id, created_by: admin.id,
  }).select().single();
  const { data: mod } = await svc.from('modules')
    .insert({ course_id: course.id, title: 'M', position: 1 }).select().single();
  const { data: act } = await svc.from('activities').insert({
    module_id: mod.id, type: 'quiz', title: 'Quiz', position: 1, content: {},
  }).select().single();
  const { data: quiz } = await svc.from('quizzes').insert({
    course_id: course.id, activity_id: act.id, title: 'Q', pass_mark: passMark,
  }).select().single();

  const ids = [];
  for (const [i, q] of questions.entries()) {
    const { data: row } = await svc.from('quiz_questions').insert({
      quiz_id: quiz.id, type: q.type, position: i + 1, prompt: `Q${i + 1}`,
      options: q.options ?? [], points: q.points ?? 1,
    }).select().single();
    ids.push(row.id);
    if (q.answer !== undefined) {
      await svc.from('quiz_answer_keys').insert({ question_id: row.id, answer: q.answer });
    }
  }
  const { data: enrollment } = await svc.from('enrollments')
    .insert({ trainee_id: trainee.id, course_id: course.id, status: 'active' }).select().single();
  return { courseId: course.id, quizId: quiz.id, activityId: act.id, questionIds: ids, enrollment };
}

const TF = { type: 'truefalse', answer: { value: true } };
const PARA = { type: 'paragraph', points: 2 };

const start = (quizId) => fn('start-quiz', cTrainee, { quizId });
const submit = (attemptId, answers) => fn('submit-quiz', cTrainee, { attemptId, answers });

beforeAll(async () => {
  await resetDb();
  admin        = await createUser({ email: uniqueEmail(), role: 'admin' });
  trainer      = await createUser({ email: uniqueEmail(), role: 'trainer' });
  otherTrainer = await createUser({ email: uniqueEmail(), role: 'trainer' });
  trainee      = await createUser({ email: uniqueEmail(), role: 'trainee' });
  [cAdmin, cTrainer, cOther, cTrainee] = await Promise.all([
    signIn(admin.email), signIn(trainer.email), signIn(otherTrainer.email), signIn(trainee.email),
  ]);
});
afterAll(async () => {
  await svc.from('quiz_retake_grants').delete().eq('granted_by', trainer.id);
  await svc.from('courses').delete().like('slug', `${PREFIX}-%`);
  await resetDb();
});

/** Submit a quiz that has a paragraph, leaving it at pending_review. */
async function pendingAttempt(passMark = 0.7) {
  const s = await scenario({ questions: [TF, PARA], passMark });
  const { body: started } = await start(s.quizId);
  await submit(started.attempt.id, [
    { questionId: s.questionIds[0], response: { value: true } },
    { questionId: s.questionIds[1], response: { text: 'A loop repeats work.' } },
  ]);
  return { ...s, attemptId: started.attempt.id };
}

describe('grade-paragraph', () => {
  it('rejects a missing attemptId', async () => {
    const res = await fn('grade-paragraph', cTrainer, { awarded: 1 });
    expect(res.status).toBe(400);
  });

  it('REJECTS a trainer who does not own the course', async () => {
    const s = await pendingAttempt();
    const res = await fn('grade-paragraph', cOther, {
      attemptId: s.attemptId, questionId: s.questionIds[1], awarded: 2,
    });
    expect(res.status).toBe(403);
  });

  it('REJECTS the trainee grading their own paragraph', async () => {
    const s = await pendingAttempt();
    const res = await fn('grade-paragraph', cTrainee, {
      attemptId: s.attemptId, questionId: s.questionIds[1], awarded: 2,
    });
    expect(res.status).toBe(403);
  });

  it('rejects an award above the question points', async () => {
    const s = await pendingAttempt();
    const res = await fn('grade-paragraph', cTrainer, {
      attemptId: s.attemptId, questionId: s.questionIds[1], awarded: 99,
    });
    expect(res.status).toBe(400);
  });

  it('grades the paragraph and completes the attempt as passed', async () => {
    const s = await pendingAttempt();
    const res = await fn('grade-paragraph', cTrainer, {
      attemptId: s.attemptId, questionId: s.questionIds[1], awarded: 2, comment: 'Good.',
    });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('passed');
    expect(res.body.passed).toBe(true);
    expect(res.body.score).toBe(100);
  });

  it('records the activity completion, unblocking the module', async () => {
    const s = await pendingAttempt();
    await fn('grade-paragraph', cTrainer, {
      attemptId: s.attemptId, questionId: s.questionIds[1], awarded: 2,
    });
    const { data } = await svc.from('activity_completions')
      .select('id').eq('enrollment_id', s.enrollment.id).eq('activity_id', s.activityId);
    expect(data).toHaveLength(1);
  });

  it('a poor paragraph fails the attempt and completes nothing', async () => {
    const s = await pendingAttempt();
    const res = await fn('grade-paragraph', cTrainer, {
      attemptId: s.attemptId, questionId: s.questionIds[1], awarded: 0,
    });
    expect(res.body.status).toBe('failed');
    expect(res.body.passed).toBe(false);
    expect(res.body.score).toBe(33);
    const { data } = await svc.from('activity_completions')
      .select('id').eq('enrollment_id', s.enrollment.id);
    expect(data ?? []).toHaveLength(0);
  });

  it('an admin can grade too', async () => {
    const s = await pendingAttempt();
    const res = await fn('grade-paragraph', cAdmin, {
      attemptId: s.attemptId, questionId: s.questionIds[1], awarded: 2,
    });
    expect(res.status).toBe(200);
  });

  it('REJECTS grading an attempt that is not pending review', async () => {
    const s = await pendingAttempt();
    await fn('grade-paragraph', cTrainer, {
      attemptId: s.attemptId, questionId: s.questionIds[1], awarded: 2,
    });
    const again = await fn('grade-paragraph', cTrainer, {
      attemptId: s.attemptId, questionId: s.questionIds[1], awarded: 0,
    });
    expect(again.status).toBe(409);
  });

  it('writes an audit entry naming the grader', async () => {
    const s = await pendingAttempt();
    await fn('grade-paragraph', cTrainer, {
      attemptId: s.attemptId, questionId: s.questionIds[1], awarded: 2,
    });
    const { data } = await svc.from('audit_log')
      .select('*').eq('entity_id', s.attemptId).eq('action', 'quiz.paragraph_graded');
    expect(data).toHaveLength(1);
    expect(data[0].actor_email).toBe(trainer.email);
  });
});

describe('grant-retake', () => {
  /** A failed attempt on a quiz with no paragraph. */
  async function failedAttempt() {
    const s = await scenario({ questions: [TF] });
    const { body: started } = await start(s.quizId);
    await submit(started.attempt.id, [
      { questionId: s.questionIds[0], response: { value: false } },
    ]);
    return s;
  }

  it('rejects a missing quizId', async () => {
    const res = await fn('grant-retake', cTrainer, { traineeId: trainee.id });
    expect(res.status).toBe(400);
  });

  it('REJECTS a trainee granting themselves a retake', async () => {
    const s = await failedAttempt();
    const res = await fn('grant-retake', cTrainee, { quizId: s.quizId, traineeId: trainee.id });
    expect(res.status).toBe(403);
  });

  it('REJECTS a trainer who does not own the course', async () => {
    const s = await failedAttempt();
    const res = await fn('grant-retake', cOther, { quizId: s.quizId, traineeId: trainee.id });
    expect(res.status).toBe(403);
  });

  it('REFUSES when the trainee has no failed attempt to retake', async () => {
    const s = await scenario({ questions: [TF] });
    const res = await fn('grant-retake', cTrainer, { quizId: s.quizId, traineeId: trainee.id });
    expect(res.status).toBe(409);
  });

  it('grants a retake the trainee can then use', async () => {
    const s = await failedAttempt();
    const res = await fn('grant-retake', cTrainer, {
      quizId: s.quizId, traineeId: trainee.id, reason: 'Connection dropped',
    });
    expect(res.status).toBe(200);

    const second = await start(s.quizId);
    expect(second.status).toBe(200);
    expect(second.body.attempt.attemptNo).toBe(2);
  });

  it('REFUSES a second grant while one is unconsumed', async () => {
    const s = await failedAttempt();
    await fn('grant-retake', cTrainer, { quizId: s.quizId, traineeId: trainee.id });
    const again = await fn('grant-retake', cTrainer, { quizId: s.quizId, traineeId: trainee.id });
    expect(again.status).toBe(409);
  });

  it('writes an audit entry naming the grantor and the reason', async () => {
    const s = await failedAttempt();
    await fn('grant-retake', cTrainer, {
      quizId: s.quizId, traineeId: trainee.id, reason: 'Power cut',
    });
    const { data } = await svc.from('audit_log')
      .select('*').eq('entity_id', s.quizId).eq('action', 'quiz.retake_granted');
    expect(data).toHaveLength(1);
    expect(data[0].actor_email).toBe(trainer.email);
    expect(JSON.stringify(data[0].after)).toMatch(/Power cut/);
  });
});
