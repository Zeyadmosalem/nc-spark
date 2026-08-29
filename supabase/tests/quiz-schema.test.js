import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { serviceClient, createUser, resetDb, uniqueEmail, mustWrite } from './helpers.js';

const svc = serviceClient();
const PREFIX = `qs${Date.now()}`;
let trainer, courseId, activityId, quizId;

beforeAll(async () => {
  await resetDb();
  trainer = await createUser({ email: uniqueEmail(), role: 'trainer' });
  const { data: c } = await svc.from('courses').insert({
    slug: `${PREFIX}-1`, title: 'Quiz Course', trainer_id: trainer.id, created_by: trainer.id,
  }).select().single();
  courseId = c.id;
  const { data: m } = await svc.from('modules')
    .insert({ course_id: courseId, title: 'M', position: 1 }).select().single();
  const { data: a } = await svc.from('activities')
    .insert({ module_id: m.id, type: 'quiz', title: 'Mini Quiz', position: 1, content: {} })
    .select().single();
  activityId = a.id;
});
afterAll(async () => {
  await mustWrite('delete courses', svc.from('courses').delete().like('slug', `${PREFIX}-%`));
  await resetDb();
});

describe('quizzes', () => {
  it('creates a module quiz bound to an activity', async () => {
    const { data, error } = await svc.from('quizzes')
      .insert({ course_id: courseId, activity_id: activityId, title: 'Mini Quiz' })
      .select().single();
    expect(error).toBeNull();
    expect(Number(data.pass_mark)).toBe(0.7);
    quizId = data.id;
  });

  it('rejects a pass mark above 1', async () => {
    const { error } = await svc.from('quizzes')
      .insert({ course_id: courseId, title: 'Bad', pass_mark: 1.5 });
    expect(error).not.toBeNull();
  });

  it('allows one course final', async () => {
    const { error } = await svc.from('quizzes')
      .insert({ course_id: courseId, title: 'Final' });
    expect(error).toBeNull();
  });

  it('REJECTS a second course final', async () => {
    const { error } = await svc.from('quizzes')
      .insert({ course_id: courseId, title: 'Final Two' });
    expect(error).not.toBeNull();
  });

  it('rejects two quizzes on one activity', async () => {
    const { error } = await svc.from('quizzes')
      .insert({ course_id: courseId, activity_id: activityId, title: 'Duplicate' });
    expect(error).not.toBeNull();
  });

  it('rejects a negative time limit', async () => {
    const { error } = await svc.from('quizzes').insert({
      course_id: courseId, activity_id: null, title: 'Timed', time_limit_seconds: -5,
    });
    expect(error).not.toBeNull();
  });
});

describe('quiz_questions', () => {
  it('stores an mcq with options', async () => {
    const { error } = await svc.from('quiz_questions').insert({
      quiz_id: quizId, type: 'mcq', position: 1,
      prompt: 'Which loop runs at least once?', options: ['for', 'while', 'do...while'],
    });
    expect(error).toBeNull();
  });

  it('REJECTS an mcq with fewer than two options', async () => {
    const { error } = await svc.from('quiz_questions').insert({
      quiz_id: quizId, type: 'mcq', position: 90, prompt: 'Broken', options: ['only'],
    });
    expect(error).not.toBeNull();
  });

  it('stores a truefalse with no options', async () => {
    const { error } = await svc.from('quiz_questions').insert({
      quiz_id: quizId, type: 'truefalse', position: 2, prompt: 'for...of iterates objects',
    });
    expect(error).toBeNull();
  });

  it('stores a paragraph question', async () => {
    const { error } = await svc.from('quiz_questions').insert({
      quiz_id: quizId, type: 'paragraph', position: 3, prompt: 'Explain a for loop.', points: 5,
    });
    expect(error).toBeNull();
  });

  it('rejects two questions at the same position', async () => {
    const { error } = await svc.from('quiz_questions').insert({
      quiz_id: quizId, type: 'truefalse', position: 1, prompt: 'Clash',
    });
    expect(error).not.toBeNull();
  });

  it('rejects zero or negative points', async () => {
    const { error } = await svc.from('quiz_questions').insert({
      quiz_id: quizId, type: 'truefalse', position: 91, prompt: 'Free', points: 0,
    });
    expect(error).not.toBeNull();
  });
});

describe('quiz_answer_keys', () => {
  it('stores a key against a question', async () => {
    const { data: q } = await svc.from('quiz_questions')
      .select('id').eq('quiz_id', quizId).eq('position', 1).single();
    const { error } = await svc.from('quiz_answer_keys')
      .insert({ question_id: q.id, answer: { index: 2 }, explanation: 'do...while checks after.' });
    expect(error).toBeNull();
  });

  it('allows at most one key per question', async () => {
    const { data: q } = await svc.from('quiz_questions')
      .select('id').eq('quiz_id', quizId).eq('position', 1).single();
    const { error } = await svc.from('quiz_answer_keys')
      .insert({ question_id: q.id, answer: { index: 0 } });
    expect(error).not.toBeNull();
  });

  it('cascades when the question is deleted', async () => {
    const { data: q } = await svc.from('quiz_questions').insert({
      quiz_id: quizId, type: 'truefalse', position: 50, prompt: 'Temp',
    }).select().single();
    await mustWrite('insert quiz_answer_keys', svc.from('quiz_answer_keys').insert({ question_id: q.id, answer: { value: true } }));
    await mustWrite('delete quiz_questions', svc.from('quiz_questions').delete().eq('id', q.id));
    const { data } = await svc.from('quiz_answer_keys').select('question_id').eq('question_id', q.id);
    expect(data ?? []).toHaveLength(0);
  });

  it('cascades all the way down when the course is deleted', async () => {
    const { data: c } = await svc.from('courses').insert({
      slug: `${PREFIX}-cascade`, title: 'Cascade', created_by: trainer.id,
    }).select().single();
    const { data: qz } = await svc.from('quizzes')
      .insert({ course_id: c.id, title: 'Doomed' }).select().single();
    const { data: qq } = await svc.from('quiz_questions')
      .insert({ quiz_id: qz.id, type: 'truefalse', position: 1, prompt: 'T?' }).select().single();
    await mustWrite('insert quiz_answer_keys', svc.from('quiz_answer_keys').insert({ question_id: qq.id, answer: { value: true } }));

    await mustWrite('delete courses', svc.from('courses').delete().eq('id', c.id));

    const { data: keys } = await svc.from('quiz_answer_keys')
      .select('question_id').eq('question_id', qq.id);
    expect(keys ?? []).toHaveLength(0);
  });
});
