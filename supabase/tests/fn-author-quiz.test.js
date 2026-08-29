// Quiz authoring, against the live project.
//
// author-quiz is the only door to quiz_answer_keys. That table has no grant
// for `authenticated` at all, so nothing a mocked frontend test does can tell
// you whether this works: the whole feature is the difference between what
// service_role may do and what a browser may do.
//
// The test that matters most is the last one. Everything else checks that the
// function refuses what it should; that one authors a quiz through the api the
// editor calls, then takes it as a trainee through start-quiz and submit-quiz
// and checks it grades correctly. A quiz a trainer can write but nobody can
// pass is the failure mode this whole milestone exists to avoid.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { serviceClient, createUser, signIn, uniqueEmail, SUPABASE_URL, applyAppEnv } from './helpers.js';

applyAppEnv();

const { supabase } = await import('../../src/api/client.js');
const {
  quizForAuthoring, saveQuiz, saveQuizQuestion, deleteQuizQuestion,
  reorderQuizQuestions,
} = await import('../../src/api/quizzes.js');
const { publishCourse } = await import('../../src/api/courses.js');

const svc = serviceClient();
const PASSWORD = 'Test-Passw0rd!';
const PREFIX = `aq${Date.now()}`;

let trainer, other, trainee;
const madeUsers = [];
let seq = 0;

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

/** Fails loudly with its own name rather than leaving a null to trip over. */
function must(what, { data, error }) {
  if (error) throw new Error(`${what}: ${error.message}`);
  if (!data) throw new Error(`${what}: no row returned`);
  return data;
}

/** A draft course owned by `trainer`, one module, one empty quiz activity. */
async function courseWithQuizActivity({ status = 'draft' } = {}) {
  seq += 1;
  const course = must('course', await svc.from('courses').insert({
    slug: `${PREFIX}-${seq}`, title: 'Authoring Course', status,
    trainer_id: trainer.id, created_by: trainer.id,
  }).select().single());

  const mod = must('module', await svc.from('modules')
    .insert({ course_id: course.id, title: 'M', position: 1 }).select().single());

  const activity = must('activity', await svc.from('activities').insert({
    module_id: mod.id, type: 'quiz', title: 'Module quiz', position: 1, content: {},
  }).select().single());

  return { courseId: course.id, moduleId: mod.id, activityId: activity.id };
}

beforeAll(async () => {
  trainer = await mk('trainer');
  other = await mk('trainer');
  trainee = await mk('trainee');
}, 60000);

afterAll(async () => {
  await supabase.auth.signOut();
  await svc.from('courses').delete().like('slug', `${PREFIX}-%`);
  for (const id of madeUsers) {
    await svc.auth.admin.deleteUser(id).catch(() => null);
  }
});

describe('the trainer who owns the course', () => {
  let ctx;

  beforeAll(async () => {
    await become(trainer.email);
    ctx = await courseWithQuizActivity();
  });

  /** A quiz activity exists before its quiz does. That is not an error state. */
  it('reports no quiz behind a fresh quiz activity', async () => {
    const result = await quizForAuthoring(ctx.activityId);
    expect(result.quiz).toBeNull();
    expect(result.questions).toEqual([]);
  });

  it('creates the quiz', async () => {
    const { quiz } = await saveQuiz({
      activityId: ctx.activityId, title: 'Fire safety check', passMark: 0.6,
      timeLimitSeconds: 600,
    });
    expect(quiz.title).toBe('Fire safety check');
    expect(Number(quiz.pass_mark)).toBe(0.6);
    expect(quiz.time_limit_seconds).toBe(600);
    ctx.quizId = quiz.id;
  });

  /** activity_id is UNIQUE, and a double click is the ordinary way to hit it. */
  it('treats creating it twice as success, not a duplicate-key error', async () => {
    const { quiz, unchanged } = await saveQuiz({
      activityId: ctx.activityId, title: 'Ignored', passMark: 0.9,
    });
    expect(quiz.id).toBe(ctx.quizId);
    expect(unchanged).toBe(true);
  });

  it('adds a multiple-choice question with its answer key', async () => {
    const { questionId } = await saveQuizQuestion({
      quizId: ctx.quizId, type: 'mcq',
      prompt: 'Which extinguisher suits an electrical fire?',
      options: ['Water', 'CO2', 'Foam'],
      points: 2,
      answer: { index: 1 },
      explanation: 'Water conducts.',
    });
    expect(questionId).toBeTruthy();

    const { questions } = await quizForAuthoring(ctx.activityId);
    expect(questions).toHaveLength(1);
    expect(questions[0]).toMatchObject({
      type: 'mcq', points: 2, position: 1,
      options: ['Water', 'CO2', 'Foam'],
      answer: { index: 1 },
      explanation: 'Water conducts.',
    });
  });

  it('adds the other two question types', async () => {
    await saveQuizQuestion({
      quizId: ctx.quizId, type: 'truefalse',
      prompt: 'A propped fire door is a breach.', answer: { value: true },
    });
    await saveQuizQuestion({
      quizId: ctx.quizId, type: 'paragraph',
      prompt: 'Describe your evacuation route.', points: 3,
      answer: { guidance: 'Names the nearest exit and the assembly point.' },
    });

    const { questions } = await quizForAuthoring(ctx.activityId);
    expect(questions.map((q) => q.type)).toEqual(['mcq', 'truefalse', 'paragraph']);
    // Positions are assigned by the function, not the caller.
    expect(questions.map((q) => q.position)).toEqual([1, 2, 3]);
  });

  it('edits a question without disturbing its neighbours', async () => {
    const before = await quizForAuthoring(ctx.activityId);
    const target = before.questions[1];
    await saveQuizQuestion({
      questionId: target.id, type: 'truefalse',
      prompt: 'Propping a fire door open is allowed.', answer: { value: false },
    });

    const after = await quizForAuthoring(ctx.activityId);
    expect(after.questions[1].prompt).toBe('Propping a fire door open is allowed.');
    expect(after.questions[1].answer).toEqual({ value: false });
    expect(after.questions.map((q) => q.position)).toEqual([1, 2, 3]);
    expect(after.questions[0].prompt).toBe(before.questions[0].prompt);
  });

  /**
   * `unique (quiz_id, position)` means a naive reorder collides with itself
   * halfway through. The function parks every row above the range first.
   */
  it('reorders questions', async () => {
    const before = await quizForAuthoring(ctx.activityId);
    const ids = before.questions.map((q) => q.id);
    await reorderQuizQuestions(ctx.quizId, [ids[2], ids[0], ids[1]]);

    const after = await quizForAuthoring(ctx.activityId);
    expect(after.questions.map((q) => q.id)).toEqual([ids[2], ids[0], ids[1]]);
    expect(after.questions.map((q) => q.position)).toEqual([1, 2, 3]);
  });

  it('refuses an order that is not the whole quiz', async () => {
    const { questions } = await quizForAuthoring(ctx.activityId);
    await expect(reorderQuizQuestions(ctx.quizId, [questions[0].id]))
      .rejects.toThrow(/every question in this quiz exactly once/);
  });

  it('deletes a question', async () => {
    const before = await quizForAuthoring(ctx.activityId);
    await deleteQuizQuestion(before.questions[2].id);
    const after = await quizForAuthoring(ctx.activityId);
    expect(after.questions).toHaveLength(2);
  });
});

describe('what the function will not store', () => {
  let ctx;

  beforeAll(async () => {
    await become(trainer.email);
    ctx = await courseWithQuizActivity();
    const { quiz } = await saveQuiz({ activityId: ctx.activityId, title: 'Validation' });
    ctx.quizId = quiz.id;
  });

  const bad = (over) => saveQuizQuestion({
    quizId: ctx.quizId, type: 'mcq', prompt: 'P',
    options: ['a', 'b'], answer: { index: 0 }, ...over,
  });

  it('refuses a question with no prompt', async () => {
    await expect(bad({ prompt: '   ' })).rejects.toThrow(/needs a prompt/);
  });

  it('refuses an mcq with one option', async () => {
    await expect(bad({ options: ['only'] })).rejects.toThrow(/at least two options/);
  });

  it('refuses an mcq with a blank option', async () => {
    await expect(bad({ options: ['a', '  '] })).rejects.toThrow(/needs some text/);
  });

  /** Two identical options mark half the trainees who chose right as wrong. */
  it('refuses two identical options', async () => {
    await expect(bad({ options: ['Same', 'same'] })).rejects.toThrow(/the same/);
  });

  /**
   * Nothing in the schema relates the answer key to the options, and the
   * failure is silent: submit-quiz compares indexes, so an out-of-range key
   * marks every trainee wrong forever with nothing on screen to explain it.
   */
  it('refuses an answer key pointing past the last option', async () => {
    await expect(bad({ options: ['a', 'b'], answer: { index: 7 } }))
      .rejects.toThrow(/Mark which option is the correct one/);
  });

  it('refuses an mcq with no correct option marked', async () => {
    await expect(bad({ answer: {} })).rejects.toThrow(/Mark which option/);
  });

  it('refuses a true/false with no value', async () => {
    await expect(bad({ type: 'truefalse', answer: {} }))
      .rejects.toThrow(/true or false/);
  });

  it('refuses zero or fractional points', async () => {
    await expect(bad({ points: 0 })).rejects.toThrow(/at least 1/);
    await expect(bad({ points: 1.5 })).rejects.toThrow(/whole number/);
  });

  it('refuses a pass mark outside 1-100%', async () => {
    await expect(saveQuiz({ quizId: ctx.quizId, title: 'x', passMark: 0 }))
      .rejects.toThrow(/between 1% and 100%/);
    await expect(saveQuiz({ quizId: ctx.quizId, title: 'x', passMark: 1.5 }))
      .rejects.toThrow(/between 1% and 100%/);
  });

  /**
   * Changing a question's type has to replace the answer key, not leave the
   * old shape behind — {index: 0} on a true/false question is never equal to
   * the {value: …} submit-quiz compares against.
   */
  it('replaces the answer key when the type changes', async () => {
    const { questionId } = await saveQuizQuestion({
      quizId: ctx.quizId, type: 'mcq', prompt: 'Changing type',
      options: ['a', 'b'], answer: { index: 1 },
    });
    await saveQuizQuestion({
      questionId, type: 'truefalse', prompt: 'Changing type', answer: { value: false },
    });
    const { questions } = await quizForAuthoring(ctx.activityId);
    const q = questions.find((x) => x.id === questionId);
    expect(q.answer).toEqual({ value: false });
    // Leftover options would render a second answer widget to the trainee.
    expect(q.options).toEqual([]);
  });
});

describe('a trainer who does not own the course', () => {
  let ctx;

  beforeAll(async () => {
    await become(trainer.email);
    ctx = await courseWithQuizActivity();
    const { quiz } = await saveQuiz({ activityId: ctx.activityId, title: 'Mine' });
    ctx.quizId = quiz.id;
    await saveQuizQuestion({
      quizId: ctx.quizId, type: 'truefalse', prompt: 'Secret', answer: { value: true },
    });
    await become(other.email);
  });

  // Not vacuous: every one of these succeeds for the owner above.
  it('cannot read the answer keys', async () => {
    await expect(quizForAuthoring(ctx.activityId)).rejects.toThrow(/Not your course/);
  });

  it('cannot add a question', async () => {
    await expect(saveQuizQuestion({
      quizId: ctx.quizId, type: 'truefalse', prompt: 'Mine now', answer: { value: true },
    })).rejects.toThrow(/Not your course/);
  });

  it('cannot change the pass mark', async () => {
    await expect(saveQuiz({ quizId: ctx.quizId, title: 'x', passMark: 0.01 }))
      .rejects.toThrow(/Not your course/);
  });
});

describe('a trainee', () => {
  let ctx;

  beforeAll(async () => {
    await become(trainer.email);
    ctx = await courseWithQuizActivity({ status: 'published' });
    const { quiz } = await saveQuiz({ activityId: ctx.activityId, title: 'Locked' });
    ctx.quizId = quiz.id;
    await saveQuizQuestion({
      quizId: ctx.quizId, type: 'mcq', prompt: 'Which one?',
      options: ['right', 'wrong'], answer: { index: 0 }, explanation: 'Because.',
    });
    await svc.from('enrollments')
      .insert({ trainee_id: trainee.id, course_id: ctx.courseId, status: 'active' });
    await become(trainee.email);
  });

  it('cannot reach the function at all', async () => {
    await expect(quizForAuthoring(ctx.activityId)).rejects.toThrow(/role|Insufficient/i);
  });

  it('cannot write a question', async () => {
    await expect(saveQuizQuestion({
      quizId: ctx.quizId, type: 'truefalse', prompt: 'Free marks', answer: { value: true },
    })).rejects.toThrow(/role|Insufficient/i);
  });

  /**
   * The table itself, not the function. quiz_answer_keys has no grant, so this
   * must fail loudly rather than come back as an empty set that a later
   * permissive policy could quietly turn into a leak.
   */
  it('cannot read the answer key table directly', async () => {
    const { error } = await supabase.from('quiz_answer_keys').select('answer');
    expect(error).toBeTruthy();
    expect(error.message).toMatch(/permission denied/i);
  });

  /** What a trainee CAN read must carry nothing about correctness. */
  it('reads the questions, with no correctness in them', async () => {
    const { data, error } = await supabase
      .from('quiz_questions').select('*').eq('quiz_id', ctx.quizId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    const keys = new Set(Object.keys(data[0]));
    for (const leak of ['answer', 'is_correct', 'correct_index', 'explanation']) {
      expect(keys.has(leak)).toBe(false);
    }
  });
});

describe('publishing a course whose quiz is empty', () => {
  /**
   * An empty quiz is a wall, not an inconvenience: submit-quiz scores
   * `possible === 0 ? 0`, every pass mark is above zero, and a module quiz
   * gates the next module — so the whole course past it is unreachable for
   * everyone who enrols.
   */
  it('is refused when the quiz activity has no quiz behind it', async () => {
    await become(trainer.email);
    const ctx = await courseWithQuizActivity();
    await expect(publishCourse(ctx.courseId, true))
      .rejects.toThrow(/quiz with nothing in it/);
  });

  it('is refused when the quiz exists but has no questions', async () => {
    await become(trainer.email);
    const ctx = await courseWithQuizActivity();
    await saveQuiz({ activityId: ctx.activityId, title: 'Empty' });
    await expect(publishCourse(ctx.courseId, true))
      .rejects.toThrow(/no questions yet/);
  });

  it('goes through once the quiz has a question', async () => {
    await become(trainer.email);
    const ctx = await courseWithQuizActivity();
    const { quiz } = await saveQuiz({ activityId: ctx.activityId, title: 'Filled' });
    await saveQuizQuestion({
      quizId: quiz.id, type: 'truefalse', prompt: 'Ready?', answer: { value: true },
    });
    const result = await publishCourse(ctx.courseId, true);
    expect(result.course.status).toBe('published');
  });
});

/**
 * The whole point, end to end.
 *
 * Every test above checks that authoring stores what it was given. This one
 * checks the thing that actually matters: that a quiz written through the
 * editor's api can be taken by a trainee and graded correctly by a function
 * that reads the answer key from the other side of the wall.
 */
describe('a quiz authored here, taken by a trainee', () => {
  let ctx, ids;

  beforeAll(async () => {
    await become(trainer.email);
    ctx = await courseWithQuizActivity({ status: 'published' });
    const { quiz } = await saveQuiz({
      activityId: ctx.activityId, title: 'End to end', passMark: 0.5,
    });
    ctx.quizId = quiz.id;

    await saveQuizQuestion({
      quizId: quiz.id, type: 'mcq', prompt: 'Which extinguisher for electrical?',
      options: ['Water', 'CO2', 'Foam'], points: 2, answer: { index: 1 },
      explanation: 'Water conducts.',
    });
    await saveQuizQuestion({
      quizId: quiz.id, type: 'truefalse', prompt: 'Fire doors may be propped open.',
      points: 1, answer: { value: false },
    });

    await publishCourse(ctx.courseId, true);
    await svc.from('enrollments')
      .insert({ trainee_id: trainee.id, course_id: ctx.courseId, status: 'active' });

    const { questions } = await quizForAuthoring(ctx.activityId);
    ids = questions.map((q) => q.id);
  }, 60000);

  async function take(responses) {
    await become(trainee.email);
    const client = await signIn(trainee.email);
    const { data: { session } } = await client.auth.getSession();
    const call = async (name, body) => {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      return { status: res.status, body: await res.json().catch(() => null) };
    };
    const started = await call('start-quiz', { quizId: ctx.quizId });
    if (started.status !== 200) {
      throw new Error(`start-quiz failed: ${JSON.stringify(started.body)}`);
    }
    return { started, ...await call('submit-quiz', {
      attemptId: started.body.attempt.id, answers: responses(ids),
    }) };
  }

  it('serves the questions with no answers in them', async () => {
    const { started } = await take(() => []);
    const text = JSON.stringify(started.body);
    expect(text).not.toMatch(/"answer"|isCorrect|"index":1|guidance/);
    expect(started.body.questions).toHaveLength(2);
  });

  it('grades a fully correct attempt as a pass', async () => {
    await svc.from('quiz_attempts').delete().eq('quiz_id', ctx.quizId);
    const { status, body } = await take((q) => [
      { questionId: q[0], response: { index: 1 } },
      { questionId: q[1], response: { value: false } },
    ]);
    expect(status).toBe(200);
    expect(body.score).toBe(100);
    expect(body.passed).toBe(true);
  });

  /** 2 points of 3 is 67%, over the 50% pass mark this quiz was authored with. */
  it('weights by the points the trainer set, not by question count', async () => {
    await svc.from('quiz_attempts').delete().eq('quiz_id', ctx.quizId);
    const { body } = await take((q) => [
      { questionId: q[0], response: { index: 1 } },
      { questionId: q[1], response: { value: true } },
    ]);
    expect(body.score).toBe(67);
    expect(body.passed).toBe(true);
  });

  it('fails an attempt that gets the two-point question wrong', async () => {
    await svc.from('quiz_attempts').delete().eq('quiz_id', ctx.quizId);
    const { body } = await take((q) => [
      { questionId: q[0], response: { index: 0 } },
      { questionId: q[1], response: { value: false } },
    ]);
    expect(body.score).toBe(33);
    expect(body.passed).toBe(false);
  });
});
