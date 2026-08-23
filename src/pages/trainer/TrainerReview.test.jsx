import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mocks = vi.hoisted(() => ({
  pendingReviews: vi.fn(), blockedAttempts: vi.fn(), openRetakeGrants: vi.fn(),
  gradeParagraph: vi.fn(), grantRetake: vi.fn(),
}));
vi.mock('../../api/review', () => ({
  pendingReviews: mocks.pendingReviews, blockedAttempts: mocks.blockedAttempts,
  openRetakeGrants: mocks.openRetakeGrants,
  gradeParagraph: mocks.gradeParagraph, grantRetake: mocks.grantRetake,
}));

const { default: TrainerReview } = await import('./TrainerReview');

const PENDING = [{
  attemptId: 'at1', quizId: 'q1', quizTitle: 'Loops', courseTitle: 'Programming',
  traineeName: 'Amira', traineeAvatar: 'AM', submittedAt: '2026-08-23T10:00:00Z', autoScore: 50,
  paragraphs: [{ questionId: 'qc', prompt: 'Explain a while loop.', points: 2, text: 'It repeats.' }],
}];

const BLOCKED = [{
  attemptId: 'at2', quizId: 'q2', quizTitle: 'Safety', courseTitle: 'Health and Safety',
  traineeId: 's2', traineeName: 'Sam', traineeAvatar: 'SA',
  status: 'failed', score: 40, attemptNo: 1,
}];

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}><TrainerReview /></QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.pendingReviews.mockResolvedValue([]);
  mocks.blockedAttempts.mockResolvedValue([]);
  mocks.openRetakeGrants.mockResolvedValue([]);
});

describe('TrainerReview', () => {
  it('shows a loading state first', () => {
    mocks.pendingReviews.mockReturnValue(new Promise(() => {}));
    show();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('says both queues are clear rather than showing a blank page', async () => {
    show();
    expect(await screen.findByText(/nothing waiting/i)).toBeInTheDocument();
  });

  it('reports a failed load instead of an empty queue', async () => {
    mocks.pendingReviews.mockRejectedValue(new Error('network down'));
    show();
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not load/i);
  });
});

describe('TrainerReview paragraph queue', () => {
  beforeEach(() => mocks.pendingReviews.mockResolvedValue(PENDING));

  it('lists the trainee, the question and their answer', async () => {
    show();
    expect(await screen.findByText('Amira')).toBeInTheDocument();
    expect(screen.getByText(/Explain a while loop/)).toBeInTheDocument();
    expect(screen.getByText(/It repeats/)).toBeInTheDocument();
  });

  it('grades the paragraph with the award the trainer chose', async () => {
    mocks.gradeParagraph.mockResolvedValue({ ok: true, status: 'passed', passed: true, score: 100 });
    const user = userEvent.setup();
    show();
    await screen.findByText('Amira');

    await user.clear(screen.getByLabelText(/marks awarded/i));
    await user.type(screen.getByLabelText(/marks awarded/i), '2');
    await user.type(screen.getByLabelText(/comment/i), 'Clear answer.');
    await user.click(screen.getByRole('button', { name: /save grade/i }));

    await waitFor(() => expect(mocks.gradeParagraph).toHaveBeenCalledWith({
      attemptId: 'at1', questionId: 'qc', awarded: 2, comment: 'Clear answer.',
    }));
  });

  it('will not let a trainer award more than the question is worth', async () => {
    const user = userEvent.setup();
    show();
    await screen.findByText('Amira');
    await user.clear(screen.getByLabelText(/marks awarded/i));
    await user.type(screen.getByLabelText(/marks awarded/i), '9');
    expect(screen.getByRole('button', { name: /save grade/i })).toBeDisabled();
  });

  it('surfaces a refusal from the server', async () => {
    mocks.gradeParagraph.mockRejectedValue(new Error('This attempt is not awaiting review'));
    const user = userEvent.setup();
    show();
    await screen.findByText('Amira');
    await user.click(screen.getByRole('button', { name: /save grade/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/not awaiting review/);
  });
});

describe('TrainerReview retake queue', () => {
  beforeEach(() => mocks.blockedAttempts.mockResolvedValue(BLOCKED));

  it('lists a blocked trainee with their score', async () => {
    show();
    expect(await screen.findByText('Sam')).toBeInTheDocument();
    expect(screen.getByText(/40%/)).toBeInTheDocument();
  });

  it('grants a retake with the reason given', async () => {
    mocks.grantRetake.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    show();
    await screen.findByText('Sam');
    await user.type(screen.getByLabelText(/reason/i), 'Connection dropped');
    await user.click(screen.getByRole('button', { name: /allow retake/i }));

    await waitFor(() => expect(mocks.grantRetake).toHaveBeenCalledWith({
      quizId: 'q2', traineeId: 's2', reason: 'Connection dropped',
    }));
  });

  // A trainer needs to know a grant is already outstanding, or they will keep
  // clicking and keep getting a 409.
  it('shows a retake as already granted instead of offering it again', async () => {
    mocks.openRetakeGrants.mockResolvedValue([{ id: 'g1', quiz_id: 'q2', trainee_id: 's2' }]);
    show();
    expect(await screen.findByText(/retake already granted/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /allow retake/i })).not.toBeInTheDocument();
  });
});
