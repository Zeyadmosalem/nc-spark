import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mocks = vi.hoisted(() => ({
  quizForActivity: vi.fn(), myAttempt: vi.fn(), startQuiz: vi.fn(), submitQuiz: vi.fn(),
}));
vi.mock('../../api/quizzes', () => ({
  quizForActivity: mocks.quizForActivity, myAttempt: mocks.myAttempt,
  startQuiz: mocks.startQuiz, submitQuiz: mocks.submitQuiz,
}));

const { default: QuizRunner } = await import('./QuizRunner');

const QUIZ = { id: 'q1', title: 'Loops and Iteration', passMark: 0.7, timeLimitSeconds: 600 };

const QUESTIONS = [
  { id: 'qa', type: 'mcq', position: 1, points: 1,
    prompt: 'Which loop runs at least once?', options: ['for', 'while', 'do...while'] },
  { id: 'qb', type: 'truefalse', position: 2, points: 1,
    prompt: 'for...of iterates plain objects', options: [] },
  { id: 'qc', type: 'paragraph', position: 3, points: 2,
    prompt: 'Explain when you would use a while loop.', options: [] },
];

function started(over = {}) {
  return {
    ok: true,
    quiz: QUIZ,
    attempt: { id: 'at1', attemptNo: 1, startedAt: new Date().toISOString(), deadline: null },
    questions: QUESTIONS,
    ...over,
  };
}

function show(props = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <QuizRunner quiz={QUIZ} {...props} />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.myAttempt.mockResolvedValue(null);
});

describe('QuizRunner intro', () => {
  it('shows the quiz title, question count and pass mark', async () => {
    show();
    expect(await screen.findByText(/Loops and Iteration/)).toBeInTheDocument();
    expect(screen.getByText(/70%/)).toBeInTheDocument();
  });

  it('warns that there is only one attempt', async () => {
    show();
    expect(await screen.findByText(/one attempt/i)).toBeInTheDocument();
  });

  it('starts the attempt when asked', async () => {
    mocks.startQuiz.mockResolvedValue(started());
    const user = userEvent.setup();
    show();
    await user.click(await screen.findByRole('button', { name: /start/i }));
    await waitFor(() => expect(mocks.startQuiz).toHaveBeenCalledWith('q1'));
  });

  it('surfaces a locked refusal instead of a blank screen', async () => {
    mocks.startQuiz.mockRejectedValue(new Error('Finish the previous module first'));
    const user = userEvent.setup();
    show();
    await user.click(await screen.findByRole('button', { name: /start/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/previous module/);
  });

  it('offers no start button once the attempt is spent', async () => {
    mocks.myAttempt.mockResolvedValue({
      id: 'at1', attemptNo: 1, status: 'failed', passed: false, finalScore: 40,
    });
    show();
    expect(await screen.findByText(/40%/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /start/i })).not.toBeInTheDocument();
    expect(screen.getByText(/ask your trainer/i)).toBeInTheDocument();
  });

  it('says an attempt is awaiting review rather than showing a score', async () => {
    mocks.myAttempt.mockResolvedValue({
      id: 'at1', attemptNo: 1, status: 'pending_review', passed: null, finalScore: null,
    });
    show();
    expect(await screen.findByText(/awaiting your trainer/i)).toBeInTheDocument();
  });
});

describe('QuizRunner questions', () => {
  async function begin() {
    mocks.startQuiz.mockResolvedValue(started());
    const user = userEvent.setup();
    show();
    await user.click(await screen.findByRole('button', { name: /start/i }));
    await screen.findByText(/Which loop runs at least once/);
    return user;
  }

  it('renders the mcq options', async () => {
    await begin();
    expect(screen.getByRole('button', { name: 'do...while' })).toBeInTheDocument();
  });

  it('renders true and false for a truefalse question', async () => {
    const user = await begin();
    await user.click(screen.getByRole('button', { name: 'do...while' }));
    await user.click(screen.getByRole('button', { name: /next/i }));
    expect(await screen.findByRole('button', { name: /^true$/i })).toBeInTheDocument();
  });

  it('renders a textarea for a paragraph question', async () => {
    const user = await begin();
    await user.click(screen.getByRole('button', { name: 'do...while' }));
    await user.click(screen.getByRole('button', { name: /next/i }));
    await user.click(await screen.findByRole('button', { name: /^true$/i }));
    await user.click(screen.getByRole('button', { name: /next/i }));
    expect(await screen.findByRole('textbox')).toBeInTheDocument();
  });

  it('submits every answer in the shape the server expects', async () => {
    mocks.submitQuiz.mockResolvedValue({
      ok: true, status: 'pending_review', score: 50, passed: null,
      perQuestion: [{ questionId: 'qa', isCorrect: true }],
    });
    const user = await begin();
    await user.click(screen.getByRole('button', { name: 'do...while' }));
    await user.click(screen.getByRole('button', { name: /next/i }));
    await user.click(await screen.findByRole('button', { name: /^false$/i }));
    await user.click(screen.getByRole('button', { name: /next/i }));
    await user.type(await screen.findByRole('textbox'), 'When the count is unknown.');
    await user.click(screen.getByRole('button', { name: /finish/i }));

    await waitFor(() => expect(mocks.submitQuiz).toHaveBeenCalled());
    const [attemptId, answers] = mocks.submitQuiz.mock.calls[0];
    expect(attemptId).toBe('at1');
    expect(answers).toEqual([
      { questionId: 'qa', response: { index: 2 } },
      { questionId: 'qb', response: { value: false } },
      { questionId: 'qc', response: { text: 'When the count is unknown.' } },
    ]);
  });
});

describe('QuizRunner results', () => {
  async function finish(result) {
    mocks.startQuiz.mockResolvedValue(started({ questions: [QUESTIONS[0]] }));
    mocks.submitQuiz.mockResolvedValue(result);
    const user = userEvent.setup();
    show();
    await user.click(await screen.findByRole('button', { name: /start/i }));
    await screen.findByText(/Which loop runs at least once/);
    await user.click(screen.getByRole('button', { name: 'while' }));
    await user.click(screen.getByRole('button', { name: /finish/i }));
  }

  it('shows the score and a fail', async () => {
    await finish({
      ok: true, status: 'failed', score: 0, passed: false,
      perQuestion: [{ questionId: 'qa', isCorrect: false }],
    });
    expect(await screen.findByText(/0%/)).toBeInTheDocument();
    expect(screen.getByText(/not passed|failed/i)).toBeInTheDocument();
  });

  it('marks each question right or wrong', async () => {
    await finish({
      ok: true, status: 'failed', score: 0, passed: false,
      perQuestion: [{ questionId: 'qa', isCorrect: false }],
    });
    expect(await screen.findByLabelText(/incorrect/i)).toBeInTheDocument();
  });

  // The whole point of the milestone, asserted from the rendered DOM.
  it('reveals NO correct answer and NO explanation', async () => {
    await finish({
      ok: true, status: 'failed', score: 0, passed: false,
      perQuestion: [{ questionId: 'qa', isCorrect: false }],
    });
    await screen.findByText(/0%/);
    const text = document.body.textContent;
    expect(text).not.toMatch(/correct answer/i);
    expect(text).not.toMatch(/do\.\.\.while checks/i);
    expect(text).not.toMatch(/explanation/i);
  });

  it('tells a pending_review trainee to wait rather than showing a verdict', async () => {
    await finish({
      ok: true, status: 'pending_review', score: 50, passed: null,
      perQuestion: [{ questionId: 'qa', isCorrect: true }],
    });
    expect(await screen.findByText(/awaiting your trainer/i)).toBeInTheDocument();
    expect(screen.queryByText(/passed/i)).not.toBeInTheDocument();
  });

  it('reports an expired attempt as out of time', async () => {
    await finish({
      ok: true, status: 'expired', score: 100, passed: false,
      perQuestion: [{ questionId: 'qa', isCorrect: true }],
    });
    expect(await screen.findByText(/ran out of time/i)).toBeInTheDocument();
  });
});
