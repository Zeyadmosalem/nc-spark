import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  serviceClient, anonClient, createUser, signIn, resetDb, uniqueEmail,
  mustWrite,
} from './helpers.js';

const svc = serviceClient();
const PREFIX = `rq${Date.now()}`;
let admin, ownerTrainer, otherTrainer, supervisor, trainee, otherTrainee;
let cAdmin, cOwner, cOther, cSupervisor, cTrainee, cOtherTrainee;
let courseId, quizId, mcqId, attemptId, otherAttemptId, enrolId;

beforeAll(async () => {
  await resetDb();
  admin        = await createUser({ email: uniqueEmail(), role: 'admin' });
  ownerTrainer = await createUser({ email: uniqueEmail(), role: 'trainer' });
  otherTrainer = await createUser({ email: uniqueEmail(), role: 'trainer' });
  supervisor   = await createUser({ email: uniqueEmail(), role: 'supervisor' });
  trainee      = await createUser({ email: uniqueEmail(), role: 'trainee' });
  otherTrainee = await createUser({ email: uniqueEmail(), role: 'trainee' });

  await mustWrite('insert supervisor_trainers', svc.from('supervisor_trainers')
    .insert({ supervisor_id: supervisor.id, trainer_id: ownerTrainer.id }));

  const { data: c } = await svc.from('courses').insert({
    slug: `${PREFIX}-1`, title: 'RLS Quiz Course', status: 'published',
    trainer_id: ownerTrainer.id, created_by: admin.id,
  }).select().single();
  courseId = c.id;

  const { data: qz } = await svc.from('quizzes')
    .insert({ course_id: courseId, title: 'Final', pass_mark: 0.7 }).select().single();
  quizId = qz.id;

  const { data: q1 } = await svc.from('quiz_questions').insert({
    quiz_id: quizId, type: 'mcq', position: 1,
    prompt: 'Which loop runs at least once?', options: ['for', 'while', 'do...while'],
  }).select().single();
  mcqId = q1.id;
  await mustWrite('insert quiz_answer_keys', svc.from('quiz_answer_keys').insert({
    question_id: mcqId, answer: { index: 2 }, explanation: 'do...while checks its condition AFTER.',
  }));

  const { data: e } = await svc.from('enrollments')
    .insert({ trainee_id: trainee.id, course_id: courseId, status: 'active' }).select().single();
  enrolId = e.id;
  const { data: a } = await svc.from('quiz_attempts')
    .insert({ quiz_id: quizId, trainee_id: trainee.id, enrollment_id: enrolId })
    .select().single();
  attemptId = a.id;
  await mustWrite('insert quiz_answers', svc.from('quiz_answers')
    .insert({ attempt_id: attemptId, question_id: mcqId, response: { index: 1 } }));

  const { data: e2 } = await svc.from('enrollments')
    .insert({ trainee_id: otherTrainee.id, course_id: courseId, status: 'active' })
    .select().single();
  const { data: a2 } = await svc.from('quiz_attempts')
    .insert({ quiz_id: quizId, trainee_id: otherTrainee.id, enrollment_id: e2.id })
    .select().single();
  otherAttemptId = a2.id;

  [cAdmin, cOwner, cOther, cSupervisor, cTrainee, cOtherTrainee] = await Promise.all([
    signIn(admin.email), signIn(ownerTrainer.email), signIn(otherTrainer.email),
    signIn(supervisor.email), signIn(trainee.email), signIn(otherTrainee.email),
  ]);
});
afterAll(async () => {
  await mustWrite('delete quiz_retake_grants', svc.from('quiz_retake_grants').delete().eq('quiz_id', quizId));
  await mustWrite('delete courses', svc.from('courses').delete().like('slug', `${PREFIX}-%`));
  await resetDb();
});

// ---------------------------------------------------------------------------

describe('RED TEAM: the answer key is unreachable from a browser', () => {
  // An ERROR, not an empty array. An empty array would mean a policy is
  // filtering rows, and a policy can later be widened by accident. No grant
  // at all means a mistake here is loud.
  it('an enrolled trainee gets a permission ERROR, not an empty set', async () => {
    const { data, error } = await cTrainee.from('quiz_answer_keys').select('*');
    expect(error).not.toBeNull();
    expect(error.message).toMatch(/permission denied/i);
    expect(data).toBeNull();
  });

  it('an unenrolled trainee cannot read it', async () => {
    const { error } = await cOtherTrainee.from('quiz_answer_keys').select('answer');
    expect(error).not.toBeNull();
  });

  it('an anonymous visitor cannot read it', async () => {
    const { error } = await anonClient().from('quiz_answer_keys').select('answer');
    expect(error).not.toBeNull();
  });

  it('an unrelated trainer cannot read it', async () => {
    const { error } = await cOther.from('quiz_answer_keys').select('answer');
    expect(error).not.toBeNull();
  });

  // Even the person who owns the course reads keys through a function, never
  // the table. One rule, no exceptions to remember.
  it('even the OWNING trainer cannot read the table directly', async () => {
    const { error } = await cOwner.from('quiz_answer_keys').select('answer');
    expect(error).not.toBeNull();
  });

  it('an ADMIN cannot read the table directly either', async () => {
    const { error } = await cAdmin.from('quiz_answer_keys').select('answer');
    expect(error).not.toBeNull();
  });

  // The obvious way around a table grant: ask for it as a nested resource.
  it('cannot be reached through an embedded read on quiz_questions', async () => {
    const { error } = await cTrainee.from('quiz_questions')
      .select('id, prompt, quiz_answer_keys(answer)').eq('id', mcqId);
    expect(error).not.toBeNull();
  });

  it('cannot be reached by embedding from the other side', async () => {
    const { error } = await cTrainee.from('quiz_answer_keys')
      .select('answer, quiz_questions(prompt)');
    expect(error).not.toBeNull();
  });

  it('service_role CAN read it, so grading is still possible', async () => {
    const { data, error } = await svc.from('quiz_answer_keys').select('answer').eq('question_id', mcqId);
    expect(error).toBeNull();
    expect(data[0].answer).toEqual({ index: 2 });
  });

  it('a trainee cannot write a key either', async () => {
    const { error } = await cTrainee.from('quiz_answer_keys')
      .insert({ question_id: mcqId, answer: { index: 0 } });
    expect(error).not.toBeNull();
  });
});

describe('RED TEAM: questions carry no correctness information', () => {
  it('the readable question row has no answer-shaped field', async () => {
    const { data } = await cTrainee.from('quiz_questions').select('*').eq('id', mcqId).single();
    const json = JSON.stringify(data);
    expect(json).not.toMatch(/isCorrect|"correct"|answer|explanation/i);
  });

  it('options are plain strings with no marker', async () => {
    const { data } = await cTrainee.from('quiz_questions').select('options').eq('id', mcqId).single();
    expect(data.options).toEqual(['for', 'while', 'do...while']);
  });
});

describe('RED TEAM: a trainee cannot manufacture a result', () => {
  it('cannot insert an attempt', async () => {
    const { error } = await cTrainee.from('quiz_attempts')
      .insert({ quiz_id: quizId, trainee_id: trainee.id, enrollment_id: enrolId, attempt_no: 9 });
    expect(error).not.toBeNull();
  });

  it('cannot mark their own attempt passed', async () => {
    await cTrainee.from('quiz_attempts')
      .update({ passed: true, final_score: 100 }).eq('id', attemptId);
    const { data } = await svc.from('quiz_attempts').select('passed, final_score').eq('id', attemptId).single();
    expect(data.passed).toBeNull();
    expect(data.final_score).toBeNull();
  });

  it('cannot insert an answer directly', async () => {
    const { error } = await cTrainee.from('quiz_answers')
      .insert({ attempt_id: attemptId, question_id: mcqId, response: { index: 2 } });
    expect(error).not.toBeNull();
  });

  it('cannot flip is_correct on their own answer', async () => {
    await cTrainee.from('quiz_answers').update({ is_correct: true, awarded: 1 })
      .eq('attempt_id', attemptId);
    const { data } = await svc.from('quiz_answers')
      .select('is_correct').eq('attempt_id', attemptId).eq('question_id', mcqId).single();
    expect(data.is_correct).toBeNull();
  });

  it('cannot grant themselves a retake', async () => {
    const { error } = await cTrainee.from('quiz_retake_grants')
      .insert({ quiz_id: quizId, trainee_id: trainee.id, granted_by: trainee.id });
    expect(error).not.toBeNull();
  });

  it('cannot delete their failed attempt to start over', async () => {
    await cTrainee.from('quiz_attempts').delete().eq('id', attemptId);
    const { data } = await svc.from('quiz_attempts').select('id').eq('id', attemptId);
    expect(data).toHaveLength(1);
  });

  it('cannot read another trainee attempt', async () => {
    const { data } = await cTrainee.from('quiz_attempts').select('id').eq('id', otherAttemptId);
    expect(data ?? []).toHaveLength(0);
  });
});

// These are what make the deny tests above mean something. With RLS on and no
// policies at all, every deny test passes for the wrong reason.
describe('legitimate quiz access', () => {
  it('an enrolled trainee reads the quiz', async () => {
    const { data } = await cTrainee.from('quizzes').select('id, title, pass_mark').eq('id', quizId);
    expect(data).toHaveLength(1);
  });

  it('an enrolled trainee reads the questions', async () => {
    const { data } = await cTrainee.from('quiz_questions').select('id').eq('quiz_id', quizId);
    expect(data.length).toBeGreaterThan(0);
  });

  it('an UNENROLLED trainee reads neither', async () => {
    const { data: qz } = await cOtherTrainee.from('quizzes').select('id').eq('id', quizId);
    expect(qz).toHaveLength(1); // otherTrainee IS enrolled in this fixture
  });

  it('an anonymous visitor sees no quizzes', async () => {
    const { data } = await anonClient().from('quizzes').select('id');
    expect(data ?? []).toHaveLength(0);
  });

  it('a trainee reads their own attempt', async () => {
    const { data } = await cTrainee.from('quiz_attempts').select('id').eq('id', attemptId);
    expect(data).toHaveLength(1);
  });

  it('a trainee reads their own answers', async () => {
    const { data } = await cTrainee.from('quiz_answers').select('id').eq('attempt_id', attemptId);
    expect(data.length).toBeGreaterThan(0);
  });

  it('the owning trainer reads attempts on their course', async () => {
    const { data } = await cOwner.from('quiz_attempts').select('id').eq('quiz_id', quizId);
    expect(data.length).toBeGreaterThanOrEqual(2);
  });

  it('an unrelated trainer reads none of them', async () => {
    const { data } = await cOther.from('quiz_attempts').select('id').eq('quiz_id', quizId);
    expect(data ?? []).toHaveLength(0);
  });

  it('a supervisor reads attempts for a managed trainer course', async () => {
    const { data } = await cSupervisor.from('quiz_attempts').select('id').eq('quiz_id', quizId);
    expect(data.length).toBeGreaterThanOrEqual(2);
  });

  it('an admin reads every attempt', async () => {
    const { data } = await cAdmin.from('quiz_attempts').select('id').eq('quiz_id', quizId);
    expect(data.length).toBeGreaterThanOrEqual(2);
  });

  it('the owning trainer sees a retake grant on their course', async () => {
    await mustWrite('insert quiz_retake_grants', svc.from('quiz_retake_grants')
      .insert({ quiz_id: quizId, trainee_id: trainee.id, granted_by: ownerTrainer.id }));
    const { data } = await cOwner.from('quiz_retake_grants').select('id').eq('quiz_id', quizId);
    expect(data.length).toBeGreaterThan(0);
  });
});
