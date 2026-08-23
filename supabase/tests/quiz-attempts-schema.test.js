import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { serviceClient, createUser, resetDb, uniqueEmail } from './helpers.js';

const svc = serviceClient();
const PREFIX = `qa${Date.now()}`;
let trainer, trainee, courseId, quizId, questionId, enrollmentId;

beforeAll(async () => {
  await resetDb();
  trainer = await createUser({ email: uniqueEmail(), role: 'trainer' });
  trainee = await createUser({ email: uniqueEmail(), role: 'trainee' });
  const { data: c } = await svc.from('courses').insert({
    slug: `${PREFIX}-1`, title: 'Attempt Course', status: 'published',
    trainer_id: trainer.id, created_by: trainer.id,
  }).select().single();
  courseId = c.id;
  const { data: qz } = await svc.from('quizzes')
    .insert({ course_id: courseId, title: 'Final' }).select().single();
  quizId = qz.id;
  const { data: qq } = await svc.from('quiz_questions').insert({
    quiz_id: quizId, type: 'truefalse', position: 1, prompt: 'True?',
  }).select().single();
  questionId = qq.id;
  const { data: e } = await svc.from('enrollments')
    .insert({ trainee_id: trainee.id, course_id: courseId, status: 'active' }).select().single();
  enrollmentId = e.id;
});
afterAll(async () => {
  await svc.from('quiz_retake_grants').delete().eq('quiz_id', quizId);
  await svc.from('courses').delete().like('slug', `${PREFIX}-%`);
  await resetDb();
});

const attempt = (over = {}) => ({
  quiz_id: quizId, trainee_id: trainee.id, enrollment_id: enrollmentId, ...over,
});

describe('quiz_attempts', () => {
  let firstId;

  it('defaults to in_progress, attempt 1, with a start time', async () => {
    const { data, error } = await svc.from('quiz_attempts').insert(attempt()).select().single();
    expect(error).toBeNull();
    expect(data.status).toBe('in_progress');
    expect(data.attempt_no).toBe(1);
    expect(data.started_at).not.toBeNull();
    expect(data.passed).toBeNull();
    firstId = data.id;
  });

  it('REJECTS a second attempt at the same number', async () => {
    const { error } = await svc.from('quiz_attempts').insert(attempt());
    expect(error).not.toBeNull();
  });

  it('allows attempt 2, which is where a granted retake lives', async () => {
    const { error } = await svc.from('quiz_attempts').insert(attempt({ attempt_no: 2 }));
    expect(error).toBeNull();
    await svc.from('quiz_attempts').delete().eq('quiz_id', quizId).eq('attempt_no', 2);
  });

  it('rejects attempt number zero', async () => {
    const { error } = await svc.from('quiz_attempts').insert(attempt({ attempt_no: 0 }));
    expect(error).not.toBeNull();
  });

  it('rejects an invalid status', async () => {
    const { error } = await svc.from('quiz_attempts').update({ status: 'nearly' }).eq('id', firstId);
    expect(error.message).toMatch(/invalid input value for enum/i);
  });

  it('stores one answer per question', async () => {
    const { error } = await svc.from('quiz_answers')
      .insert({ attempt_id: firstId, question_id: questionId, response: { value: true } });
    expect(error).toBeNull();
  });

  it('rejects a second answer to the same question', async () => {
    const { error } = await svc.from('quiz_answers')
      .insert({ attempt_id: firstId, question_id: questionId, response: { value: false } });
    expect(error).not.toBeNull();
  });

  it('leaves is_correct null so an ungraded paragraph is distinguishable from a wrong one', async () => {
    const { data } = await svc.from('quiz_answers')
      .select('is_correct, awarded').eq('attempt_id', firstId).eq('question_id', questionId).single();
    expect(data.is_correct).toBeNull();
    expect(data.awarded).toBeNull();
  });

  it('cascades answers when the attempt is deleted', async () => {
    await svc.from('quiz_attempts').delete().eq('id', firstId);
    const { data } = await svc.from('quiz_answers').select('id').eq('attempt_id', firstId);
    expect(data ?? []).toHaveLength(0);
  });
});

describe('quiz_retake_grants', () => {
  it('records who granted it, unconsumed', async () => {
    const { data, error } = await svc.from('quiz_retake_grants').insert({
      quiz_id: quizId, trainee_id: trainee.id, granted_by: trainer.id, reason: 'Connection dropped',
    }).select().single();
    expect(error).toBeNull();
    expect(data.granted_by).toBe(trainer.id);
    expect(data.consumed_at).toBeNull();
  });

  it('cannot be inserted without a grantor', async () => {
    const { error } = await svc.from('quiz_retake_grants')
      .insert({ quiz_id: quizId, trainee_id: trainee.id });
    expect(error).not.toBeNull();
  });

  // The grant is compliance evidence in its own right: "who let this person
  // retake the fire safety assessment" has to stay answerable.
  it('REFUSES to delete the grantor while a grant survives', async () => {
    const { error } = await svc.auth.admin.deleteUser(trainer.id);
    expect(error).not.toBeNull();
  });
});
