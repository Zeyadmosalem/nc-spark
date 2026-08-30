import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeClient } from '../test/supabaseStub';

// Two halves. The authoring calls, which all go through one Edge Function
// because quiz_answer_keys has no grant for any browser role — so the action
// name is the only thing distinguishing them, and getting it wrong silently
// performs a different operation.
//
// And questionProblem, which says the same things author-quiz enforces, before
// the request rather than after it. The function stays the authority; this
// only decides whether Save is worth clicking.

const { client, invoke } = makeClient();
vi.mock('./client', () => ({
  supabase: client, isConfigured: true, requireClient: () => client,
}));

const {
  quizForAuthoring, saveQuiz, saveQuizQuestion, deleteQuizQuestion,
  reorderQuizQuestions, questionProblem,
} = await import('./quizzes');

beforeEach(() => {
  invoke.mockReset();
  invoke.mockResolvedValue({ data: { ok: true }, error: null });
});

const bodyOf = () => invoke.mock.calls[0][1].body;

describe('the authoring calls', () => {
  it('reads the quiz behind an activity', async () => {
    await quizForAuthoring('a1');
    expect(invoke).toHaveBeenCalledWith('author-quiz', {
      body: { action: 'get', activityId: 'a1' },
    });
  });

  it('creates a quiz when there is no id yet', async () => {
    await saveQuiz({ activityId: 'a1', title: 'Check', passMark: 0.7, timeLimitSeconds: null });
    expect(bodyOf()).toMatchObject({
      action: 'save-quiz', activityId: 'a1', title: 'Check', passMark: 0.7,
    });
    expect(bodyOf().quizId).toBeUndefined();
  });

  it('updates the quiz when there is one', async () => {
    await saveQuiz({ quizId: 'q1', activityId: 'a1', title: 'Check', passMark: 0.8 });
    expect(bodyOf()).toMatchObject({ action: 'save-quiz', quizId: 'q1' });
  });

  /**
   * The question and its key go in one call. They live in two tables, and a
   * question without a key is one submit-quiz marks wrong for everybody.
   */
  it('sends the question and its answer key together', async () => {
    await saveQuizQuestion({
      quizId: 'q1', type: 'mcq', prompt: 'Pick', options: ['a', 'b'],
      points: 1, answer: { index: 1 },
    });
    expect(bodyOf()).toMatchObject({
      action: 'save-question', quizId: 'q1', answer: { index: 1 },
    });
  });

  it('deletes a question', async () => {
    await deleteQuizQuestion('qq1');
    expect(bodyOf()).toEqual({ action: 'delete-question', questionId: 'qq1' });
  });

  it('reorders with the whole order, not a moved pair', async () => {
    await reorderQuizQuestions('q1', ['c', 'a', 'b']);
    expect(bodyOf()).toEqual({ action: 'reorder', quizId: 'q1', order: ['c', 'a', 'b'] });
  });

  it('throws the reason the function gave', async () => {
    invoke.mockResolvedValue({ data: { error: 'A quiz needs a title' }, error: null });
    await expect(saveQuiz({ activityId: 'a1' })).rejects.toThrow('A quiz needs a title');
  });
});

describe('questionProblem', () => {
  const mcq = (over = {}) => ({
    type: 'mcq', prompt: 'Pick one', points: 1,
    options: ['First', 'Second'], answer: { index: 0 }, ...over,
  });

  it('passes a complete multiple-choice question', () => {
    expect(questionProblem(mcq())).toBeNull();
  });

  it('wants a prompt', () => {
    expect(questionProblem(mcq({ prompt: '   ' })))
      .toBe('The question needs a prompt.');
  });

  it('wants whole points of at least one', () => {
    expect(questionProblem(mcq({ points: 0 })))
      .toBe('Points must be a whole number of at least 1.');
    expect(questionProblem(mcq({ points: 1.5 })))
      .toBe('Points must be a whole number of at least 1.');
  });

  it('wants at least two options', () => {
    expect(questionProblem(mcq({ options: ['Only one'] })))
      .toBe('A multiple-choice question needs at least two options.');
  });

  /** Numbered from one, because that is how they are numbered on screen. */
  it('names which option is empty', () => {
    expect(questionProblem(mcq({ options: ['First', '  '] })))
      .toBe('Option 2 is empty.');
  });

  /** Two identical options make one of them unmarkable. */
  it('names which option repeats', () => {
    expect(questionProblem(mcq({ options: ['Same', 'same'] })))
      .toBe('Option 2 repeats an earlier one.');
  });

  it('wants a correct option marked', () => {
    expect(questionProblem(mcq({ answer: {} }))).toBe('Mark which option is correct.');
  });

  /** An index past the last option marks nothing at all. */
  it('refuses an answer index outside the options', () => {
    expect(questionProblem(mcq({ answer: { index: 5 } })))
      .toBe('Mark which option is correct.');
    expect(questionProblem(mcq({ answer: { index: -1 } })))
      .toBe('Mark which option is correct.');
  });

  it('wants a true/false question answered either way', () => {
    expect(questionProblem({ type: 'truefalse', prompt: 'Water conducts', points: 1, answer: {} }))
      .toBe('Mark whether the statement is true or false.');
    expect(questionProblem({
      type: 'truefalse', prompt: 'Water conducts', points: 1, answer: { value: false },
    })).toBeNull();
  });

  /** A paragraph has no key to check; guidance is optional. */
  it('passes a paragraph with only a prompt and points', () => {
    expect(questionProblem({ type: 'paragraph', prompt: 'Explain why', points: 3 })).toBeNull();
  });
});
