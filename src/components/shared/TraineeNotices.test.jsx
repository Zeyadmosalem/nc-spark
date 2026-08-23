import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mocks = vi.hoisted(() => ({ myNotices: vi.fn() }));
vi.mock('../../api/notices', () => ({ myNotices: mocks.myNotices }));

const { default: TraineeNotices } = await import('./TraineeNotices');

const empty = { awaitingReview: [], retakesReady: [], recentlyGraded: [], total: 0 };

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter><TraineeNotices /></MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => vi.clearAllMocks());

describe('TraineeNotices', () => {
  it('renders nothing when there is nothing to say', async () => {
    mocks.myNotices.mockResolvedValue(empty);
    const { container } = show();
    await screen.findByTestId; // let the query settle
    await new Promise((r) => setTimeout(r, 0));
    expect(container.textContent).toBe('');
  });

  it('stays quiet while loading rather than flashing an empty box', () => {
    mocks.myNotices.mockReturnValue(new Promise(() => {}));
    const { container } = show();
    expect(container.textContent).toBe('');
  });

  // A failed notices query must not break the dashboard it sits on.
  it('stays quiet when the query fails', async () => {
    mocks.myNotices.mockRejectedValue(new Error('network down'));
    const { container } = show();
    await new Promise((r) => setTimeout(r, 50));
    expect(container.textContent).toBe('');
  });

  it('announces a granted retake and links to the quiz', async () => {
    mocks.myNotices.mockResolvedValue({
      ...empty, total: 1,
      retakesReady: [{ grantId: 'g1', quizId: 'q1', quizTitle: 'Safety',
                       courseTitle: 'H&S', reason: 'Connection dropped' }],
    });
    show();
    expect(await screen.findByText(/retake/i)).toBeInTheDocument();
    expect(screen.getByText(/Safety/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /take it now/i }))
      .toHaveAttribute('href', '/trainee/quiz/q1');
  });

  it('shows the reason a trainer gave', async () => {
    mocks.myNotices.mockResolvedValue({
      ...empty, total: 1,
      retakesReady: [{ grantId: 'g1', quizId: 'q1', quizTitle: 'Safety',
                       courseTitle: 'H&S', reason: 'Connection dropped' }],
    });
    show();
    expect(await screen.findByText(/Connection dropped/)).toBeInTheDocument();
  });

  it('reports a paragraph still awaiting a trainer', async () => {
    mocks.myNotices.mockResolvedValue({
      ...empty, total: 1,
      awaitingReview: [{ attemptId: 'at1', quizId: 'q1', quizTitle: 'Loops', courseTitle: 'Prog' }],
    });
    show();
    expect(await screen.findByText(/awaiting your trainer/i)).toBeInTheDocument();
  });

  it('announces a marked result with its score', async () => {
    mocks.myNotices.mockResolvedValue({
      ...empty, total: 1,
      recentlyGraded: [{ attemptId: 'at1', quizId: 'q1', quizTitle: 'Loops',
                         courseTitle: 'Prog', passed: true, score: 90 }],
    });
    show();
    expect(await screen.findByText(/marked/i)).toBeInTheDocument();
    expect(screen.getByText(/90%/)).toBeInTheDocument();
  });

  it('does not reveal answers when reporting a failed result', async () => {
    mocks.myNotices.mockResolvedValue({
      ...empty, total: 1,
      recentlyGraded: [{ attemptId: 'at1', quizId: 'q1', quizTitle: 'Loops',
                         courseTitle: 'Prog', passed: false, score: 20 }],
    });
    show();
    await screen.findByText(/20%/);
    expect(document.body.textContent).not.toMatch(/correct answer|explanation/i);
  });
});
