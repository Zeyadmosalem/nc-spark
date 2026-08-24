import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mocks = vi.hoisted(() => ({
  useQuizForAuthoring: vi.fn(),
  saveQuiz: vi.fn(), saveQuestion: vi.fn(), deleteQuestion: vi.fn(), reorder: vi.fn(),
  state: { saveQuiz: {}, saveQuestion: {} },
}));

const asMutation = (spy, extra = {}) => ({
  mutate: spy, isPending: false, error: null, ...extra,
});

vi.mock('../../hooks/useAuthoring', () => ({
  useQuizForAuthoring: mocks.useQuizForAuthoring,
  useSaveQuiz: () => asMutation(mocks.saveQuiz, mocks.state.saveQuiz),
  useSaveQuizQuestion: () => asMutation(mocks.saveQuestion, mocks.state.saveQuestion),
  useDeleteQuizQuestion: () => asMutation(mocks.deleteQuestion),
  useReorderQuizQuestions: () => asMutation(mocks.reorder),
}));

vi.mock('../ui/toast-context', () => ({ useToast: () => ({ notify: vi.fn() }) }));

const QuizEditor = (await import('./QuizEditor')).default;

const query = (data, over) => ({ data, isLoading: false, error: null, ...over });
const varsOf = (spy) => spy.mock.calls.at(-1)?.[0];

const QUIZ = { id: 'q1', title: 'Fire safety', pass_mark: '0.70', time_limit_seconds: null };

const mcq = (over = {}) => ({
  id: 'quest1', type: 'mcq', position: 1, prompt: 'Which extinguisher?',
  options: ['Water', 'CO2', 'Foam'], points: 2, answer: { index: 1 },
  explanation: 'Water conducts.', ...over,
});

const show = (over) => render(
  <QuizEditor activityId="a1" activityTitle="Module quiz" courseId="c1" {...over} />);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.state = { saveQuiz: {}, saveQuestion: {} };
  mocks.useQuizForAuthoring.mockReturnValue(query({ quiz: QUIZ, questions: [] }));
});

describe('before a quiz exists', () => {
  beforeEach(() => {
    mocks.useQuizForAuthoring.mockReturnValue(query({ quiz: null, questions: [] }));
  });

  /**
   * A quiz activity with nothing behind it is a wall for every trainee in the
   * course, not a cosmetic gap. The screen has to say so.
   */
  it('says what an empty quiz activity costs', () => {
    show();
    expect(screen.getByText('No quiz here yet')).toBeInTheDocument();
    expect(screen.getByText(/cannot be published until it/)).toBeInTheDocument();
  });

  it('creates one named after the activity', async () => {
    show();
    await userEvent.click(screen.getByRole('button', { name: 'Create the quiz' }));
    expect(varsOf(mocks.saveQuiz)).toMatchObject({
      activityId: 'a1', courseId: 'c1', title: 'Module quiz', passMark: 0.7,
    });
  });
});

describe('quiz settings', () => {
  it('shows the pass mark as a percentage, not a fraction', () => {
    show();
    expect(screen.getByLabelText('Pass mark %')).toHaveValue('70');
  });

  it('will not save until something changed', () => {
    show();
    expect(screen.getByRole('button', { name: 'Save settings' })).toBeDisabled();
  });

  it('sends the pass mark back as a fraction and the limit in seconds', async () => {
    show();
    await userEvent.clear(screen.getByLabelText('Pass mark %'));
    await userEvent.type(screen.getByLabelText('Pass mark %'), '80');
    await userEvent.type(screen.getByLabelText('Time limit (min)'), '15');
    await userEvent.click(screen.getByRole('button', { name: 'Save settings' }));
    expect(varsOf(mocks.saveQuiz)).toMatchObject({
      quizId: 'q1', passMark: 0.8, timeLimitSeconds: 900,
    });
  });

  it('sends null for an empty time limit rather than zero', async () => {
    mocks.useQuizForAuthoring.mockReturnValue(query({
      quiz: { ...QUIZ, time_limit_seconds: 600 }, questions: [],
    }));
    show();
    await userEvent.clear(screen.getByLabelText('Time limit (min)'));
    await userEvent.click(screen.getByRole('button', { name: 'Save settings' }));
    expect(varsOf(mocks.saveQuiz).timeLimitSeconds).toBeNull();
  });
});

describe('the question list', () => {
  it('warns when the quiz has none', () => {
    show();
    expect(screen.getByText('No questions yet')).toBeInTheDocument();
    expect(screen.getByText(/will not publish/)).toBeInTheDocument();
  });

  /** Weighted by points, which is what the pass mark is measured against. */
  it('says how many points it takes to pass', () => {
    mocks.useQuizForAuthoring.mockReturnValue(query({
      quiz: QUIZ,
      questions: [mcq(), mcq({ id: 'quest2', position: 2, points: 3 })],
    }));
    show();
    expect(screen.getByText(/5 points · a trainee needs 4 to pass/)).toBeInTheDocument();
  });

  it('sends the whole order when a question moves', async () => {
    mocks.useQuizForAuthoring.mockReturnValue(query({
      quiz: QUIZ,
      questions: [mcq(), mcq({ id: 'quest2', position: 2 }), mcq({ id: 'quest3', position: 3 })],
    }));
    show();
    await userEvent.click(screen.getByRole('button', { name: 'Move question 3 up' }));
    expect(varsOf(mocks.reorder)).toMatchObject({
      quizId: 'q1', order: ['quest1', 'quest3', 'quest2'],
    });
  });

  it('cannot move the first question up or the last down', () => {
    mocks.useQuizForAuthoring.mockReturnValue(query({
      quiz: QUIZ, questions: [mcq(), mcq({ id: 'quest2', position: 2 })],
    }));
    show();
    expect(screen.getByRole('button', { name: 'Move question 1 up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move question 2 down' })).toBeDisabled();
  });

  it('does not delete on the first click', async () => {
    mocks.useQuizForAuthoring.mockReturnValue(query({ quiz: QUIZ, questions: [mcq()] }));
    show();
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(mocks.deleteQuestion).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(varsOf(mocks.deleteQuestion)).toMatchObject({ questionId: 'quest1' });
  });
});

describe('writing a question', () => {
  const open = async () => {
    show();
    await userEvent.click(screen.getByRole('button', { name: '+ Add a question' }));
  };

  it('will not submit without a prompt', async () => {
    await open();
    expect(screen.getByRole('button', { name: 'Add question' })).toBeDisabled();
    expect(screen.getByText('The question needs a prompt.')).toBeInTheDocument();
  });

  it('sends a complete multiple-choice question', async () => {
    await open();
    await userEvent.type(screen.getByLabelText('Question'), 'Which extinguisher?');
    await userEvent.type(screen.getByLabelText('Option 1'), 'Water');
    await userEvent.type(screen.getByLabelText('Option 2'), 'CO2');
    await userEvent.click(screen.getByLabelText('Option 2 is correct'));
    await userEvent.click(screen.getByRole('button', { name: 'Add question' }));

    expect(varsOf(mocks.saveQuestion)).toMatchObject({
      quizId: 'q1', type: 'mcq', prompt: 'Which extinguisher?',
      options: ['Water', 'CO2'], answer: { index: 1 },
    });
  });

  it('refuses two identical options before the request is made', async () => {
    await open();
    await userEvent.type(screen.getByLabelText('Question'), 'Q');
    await userEvent.type(screen.getByLabelText('Option 1'), 'Same');
    await userEvent.type(screen.getByLabelText('Option 2'), ' same ');
    expect(screen.getByText('Option 2 repeats an earlier one.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add question' })).toBeDisabled();
  });

  /**
   * The answer is stored as an index into the options array, so removing an
   * option above the correct one moves the right answer onto a different line.
   * submit-quiz compares indexes, so nothing on screen would show the mistake
   * and every trainee would get the question wrong.
   */
  it('follows the correct answer when an earlier option is deleted', async () => {
    await open();
    await userEvent.type(screen.getByLabelText('Question'), 'Q');
    await userEvent.click(screen.getByRole('button', { name: '+ Add an option' }));
    await userEvent.type(screen.getByLabelText('Option 1'), 'Water');
    await userEvent.type(screen.getByLabelText('Option 2'), 'CO2');
    await userEvent.type(screen.getByLabelText('Option 3'), 'Foam');
    await userEvent.click(screen.getByLabelText('Option 3 is correct'));

    await userEvent.click(screen.getByRole('button', { name: 'Remove option 1' }));

    // "Foam" is now option 2, and it is still the one marked correct.
    expect(screen.getByLabelText('Option 2')).toHaveValue('Foam');
    expect(screen.getByLabelText('Option 2 is correct')).toBeChecked();

    await userEvent.click(screen.getByRole('button', { name: 'Add question' }));
    expect(varsOf(mocks.saveQuestion)).toMatchObject({
      options: ['CO2', 'Foam'], answer: { index: 1 },
    });
  });

  it('drops back to the first option when the correct one is deleted', async () => {
    await open();
    await userEvent.type(screen.getByLabelText('Question'), 'Q');
    await userEvent.click(screen.getByRole('button', { name: '+ Add an option' }));
    await userEvent.type(screen.getByLabelText('Option 1'), 'a');
    await userEvent.type(screen.getByLabelText('Option 2'), 'b');
    await userEvent.type(screen.getByLabelText('Option 3'), 'c');
    await userEvent.click(screen.getByLabelText('Option 2 is correct'));
    await userEvent.click(screen.getByRole('button', { name: 'Remove option 2' }));
    expect(screen.getByLabelText('Option 1 is correct')).toBeChecked();
  });

  it('will not go below two options', async () => {
    await open();
    expect(screen.getByRole('button', { name: 'Remove option 1' })).toBeDisabled();
  });

  /**
   * The answer key is shaped by the type. Carrying {index: 1} onto a
   * true/false question is a key submit-quiz can never match, and leftover
   * options would render a second answer widget to the trainee.
   */
  it('resets the answer and options when the type changes', async () => {
    await open();
    await userEvent.type(screen.getByLabelText('Question'), 'Statement');
    await userEvent.type(screen.getByLabelText('Option 1'), 'a');
    await userEvent.type(screen.getByLabelText('Option 2'), 'b');
    await userEvent.selectOptions(screen.getByLabelText('Type'), 'truefalse');

    expect(screen.queryByLabelText('Option 1')).not.toBeInTheDocument();
    await userEvent.click(screen.getByLabelText('False'));
    await userEvent.click(screen.getByRole('button', { name: 'Add question' }));

    expect(varsOf(mocks.saveQuestion)).toMatchObject({
      type: 'truefalse', answer: { value: false }, options: [],
    });
  });

  /** A written answer blocks the trainee until a human marks it. */
  it('says what a written answer costs before it is chosen', async () => {
    await open();
    await userEvent.selectOptions(screen.getByLabelText('Type'), 'paragraph');
    expect(screen.getByText(/not graded\s+automatically/)).toBeInTheDocument();
    expect(screen.getByText(/cannot move on until then/)).toBeInTheDocument();
  });

  it('sends marking guidance with a written answer', async () => {
    await open();
    await userEvent.selectOptions(screen.getByLabelText('Type'), 'paragraph');
    await userEvent.type(screen.getByLabelText('Question'), 'Describe the route.');
    await userEvent.type(screen.getByLabelText('Marking guidance'), 'Names the exit.');
    await userEvent.click(screen.getByRole('button', { name: 'Add question' }));
    expect(varsOf(mocks.saveQuestion)).toMatchObject({
      type: 'paragraph', answer: { guidance: 'Names the exit.' },
    });
  });

  it('surfaces what the server refused', async () => {
    mocks.state.saveQuestion = { error: new Error('Two options are the same') };
    await open();
    expect(screen.getByRole('alert')).toHaveTextContent(/Two options are the same/);
  });
});

describe('editing an existing question', () => {
  it('opens with what was stored, answer key included', async () => {
    mocks.useQuizForAuthoring.mockReturnValue(query({ quiz: QUIZ, questions: [mcq()] }));
    show();
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));

    expect(screen.getByLabelText('Question')).toHaveValue('Which extinguisher?');
    expect(screen.getByLabelText('Option 2 is correct')).toBeChecked();
    expect(screen.getByLabelText('Points')).toHaveValue('2');
    expect(screen.getByLabelText('Explanation (optional)')).toHaveValue('Water conducts.');
  });

  it('sends the question id so it updates rather than duplicating', async () => {
    mocks.useQuizForAuthoring.mockReturnValue(query({ quiz: QUIZ, questions: [mcq()] }));
    show();
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save question' }));
    expect(varsOf(mocks.saveQuestion)).toMatchObject({ questionId: 'quest1' });
  });

  /** Two open forms on one page must not share input ids. */
  it('keeps each open form addressing its own fields', async () => {
    mocks.useQuizForAuthoring.mockReturnValue(query({
      quiz: QUIZ,
      questions: [mcq(), mcq({ id: 'quest2', position: 2, prompt: 'Second one' })],
    }));
    show();
    for (const button of screen.getAllByRole('button', { name: 'Edit' })) {
      await userEvent.click(button);
    }
    const prompts = screen.getAllByLabelText('Question');
    expect(prompts).toHaveLength(2);
    expect(prompts[0]).toHaveValue('Which extinguisher?');
    expect(prompts[1]).toHaveValue('Second one');
  });
});

describe('when it cannot load', () => {
  it('says so rather than offering to create a second quiz', () => {
    mocks.useQuizForAuthoring.mockReturnValue(query(undefined, { error: new Error('nope') }));
    show();
    expect(screen.getByRole('alert')).toHaveTextContent(/Could not load this quiz/);
    expect(screen.queryByRole('button', { name: 'Create the quiz' })).not.toBeInTheDocument();
  });
});
