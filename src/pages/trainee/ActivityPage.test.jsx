import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mocks = vi.hoisted(() => ({
  getActivity: vi.fn(), completeActivity: vi.fn(),
  quizForActivity: vi.fn(), getQuiz: vi.fn(), myAttempt: vi.fn(),
  startQuiz: vi.fn(), submitQuiz: vi.fn(),
  useSession: vi.fn(() => ({ profile: { id: 's1', role: 'trainee' }, status: 'active' })),
}));
vi.mock('../../api/activities', () => ({
  getActivity: mocks.getActivity, completeActivity: mocks.completeActivity,
}));
vi.mock('../../api/quizzes', () => ({
  quizForActivity: mocks.quizForActivity, getQuiz: mocks.getQuiz,
  myAttempt: mocks.myAttempt, startQuiz: mocks.startQuiz, submitQuiz: mocks.submitQuiz,
}));
// Task 7 adds useSession to this page to supply traineeId for uploads. It
// reads the Supabase session, which is absent under test, so it is stubbed.
vi.mock('../../hooks/useSession', () => ({ useSession: mocks.useSession }));
// CourseChatDrawer still reads the prototype's in-memory context until M5.

const { default: ActivityPage } = await import('./ActivityPage');

function renderAt(activityId = 'a1', state = undefined) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[{ pathname: `/activity/${activityId}`, state }]}>
        <Routes>
          <Route path="/activity/:activityId" element={<ActivityPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => vi.clearAllMocks());

describe('ActivityPage', () => {
  it('shows a loading state first', () => {
    mocks.getActivity.mockReturnValue(new Promise(() => {}));
    renderAt();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('renders a reading activity', async () => {
    mocks.getActivity.mockResolvedValue({
      id: 'a1', type: 'reading', title: 'Safety Guide', xp: 8, body: '## Rules',
    });
    renderAt();
    expect(await screen.findByText(/Safety Guide/)).toBeInTheDocument();
  });

  it('renders a flashcards activity', async () => {
    mocks.getActivity.mockResolvedValue({
      id: 'a1', type: 'flashcards', title: 'Keywords', xp: 12,
      cards: [{ front: 'Q', back: 'A' }],
    });
    renderAt();
    expect(await screen.findByText(/Keywords/)).toBeInTheDocument();
  });

  it('shows not-found for a missing activity', async () => {
    mocks.getActivity.mockResolvedValue(null);
    renderAt();
    expect(await screen.findByText(/Activity not found/i)).toBeInTheDocument();
  });

  it('explains an activity type it cannot render yet', async () => {
    mocks.getActivity.mockResolvedValue({ id: 'a1', type: 'podcast', title: 'Listen', xp: 0 });
    renderAt();
    expect(await screen.findByText(/not available yet/i)).toBeInTheDocument();
  });

  // A quiz is completed by passing it, so it must NOT get ActivityWrapper's
  // "Mark as Complete" button — that would let a trainee complete an
  // assessment without answering it.
  it('runs a quiz activity and offers no Mark as Complete button', async () => {
    mocks.getActivity.mockResolvedValue({ id: 'a1', type: 'quiz', title: 'Mini Quiz', xp: 0 });
    mocks.quizForActivity.mockResolvedValue({
      id: 'q1', title: 'Mini Quiz', passMark: 0.7, timeLimitSeconds: null,
    });
    mocks.myAttempt.mockResolvedValue(null);
    renderAt();
    expect(await screen.findByRole('button', { name: /start quiz/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /mark as complete/i })).not.toBeInTheDocument();
  });

  it('says so when the quiz has no questions yet', async () => {
    mocks.getActivity.mockResolvedValue({ id: 'a1', type: 'quiz', title: 'Empty Quiz', xp: 0 });
    mocks.quizForActivity.mockResolvedValue(null);
    renderAt();
    expect(await screen.findByText(/no questions yet/i)).toBeInTheDocument();
  });

  it('surfaces a locked-module refusal as an alert', async () => {
    mocks.getActivity.mockResolvedValue({
      id: 'a1', type: 'reading', title: 'Locked One', xp: 5, body: 'x',
    });
    mocks.completeActivity.mockRejectedValue(new Error('Finish the previous module first'));
    const user = userEvent.setup();
    renderAt();
    await screen.findByText(/Locked One/);
    await user.click(screen.getByRole('button', { name: /mark as complete/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/previous module/);
  });

  it('calls the api when completing', async () => {
    mocks.getActivity.mockResolvedValue({
      id: 'a1', type: 'reading', title: 'Done One', xp: 5, body: 'x',
    });
    mocks.completeActivity.mockResolvedValue({ ok: true, progress: { percent: 100 } });
    const user = userEvent.setup();
    renderAt();
    await screen.findByText(/Done One/);
    await user.click(screen.getByRole('button', { name: /mark as complete/i }));
    await waitFor(() => expect(mocks.completeActivity).toHaveBeenCalledWith('a1', {}));
  });

  /**
   * The Discuss button is gone, and this test is the reverse of the one that
   * used to keep it. The reasoning changed rather than being forgotten: the
   * drawer behind it was the prototype's in-memory chat, so a message reached
   * nobody and was lost on reload. Offering a trainee a way to ask their
   * trainer a question that silently goes nowhere is worse than not offering
   * one. It returns with M5 (backlog B8).
   */
  it('offers no discussion, because the chat behind it reached nobody', async () => {
    mocks.getActivity.mockResolvedValue({
      id: 'a1', type: 'reading', title: 'Chatty', xp: 5, body: 'x',
    });
    renderAt('a1', { courseId: 'c1' });
    await screen.findByText(/Chatty/);
    expect(screen.queryByRole('button', { name: /discuss/i })).not.toBeInTheDocument();
  });

  it('renders an activity reached without course context', async () => {
    mocks.getActivity.mockResolvedValue({
      id: 'a1', type: 'reading', title: 'Lonely', xp: 5, body: 'x',
    });
    renderAt();
    await screen.findByText(/Lonely/);
    expect(screen.queryByRole('button', { name: /discuss/i })).not.toBeInTheDocument();
  });
});
