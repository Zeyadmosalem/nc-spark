import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mocks = vi.hoisted(() => ({
  quizForActivity: vi.fn(), myAttempt: vi.fn(), startQuiz: vi.fn(), submitQuiz: vi.fn(),
}));
vi.mock('../api/quizzes', () => ({
  quizForActivity: mocks.quizForActivity, myAttempt: mocks.myAttempt,
  startQuiz: mocks.startQuiz, submitQuiz: mocks.submitQuiz,
}));

const { useQuizForActivity, useMyAttempt, useStartQuiz, useSubmitQuiz } =
  await import('./useQuizzes');

let client;
function wrapper({ children }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

describe('useQuizForActivity', () => {
  it('does not fetch without an activity id', () => {
    renderHook(() => useQuizForActivity(undefined), { wrapper });
    expect(mocks.quizForActivity).not.toHaveBeenCalled();
  });

  it('returns the quiz', async () => {
    mocks.quizForActivity.mockResolvedValue({ id: 'q1', title: 'Mini', passMark: 0.7 });
    const { result } = renderHook(() => useQuizForActivity('a1'), { wrapper });
    await waitFor(() => expect(result.current.data?.id).toBe('q1'));
  });

  it('surfaces an error', async () => {
    mocks.quizForActivity.mockRejectedValue(new Error('denied'));
    const { result } = renderHook(() => useQuizForActivity('a1'), { wrapper });
    await waitFor(() => expect(result.current.error?.message).toMatch(/denied/));
  });
});

describe('useMyAttempt', () => {
  it('does not fetch without a quiz id', () => {
    renderHook(() => useMyAttempt(undefined), { wrapper });
    expect(mocks.myAttempt).not.toHaveBeenCalled();
  });

  it('returns the latest attempt', async () => {
    mocks.myAttempt.mockResolvedValue({ id: 'at1', attemptNo: 1, status: 'failed', passed: false });
    const { result } = renderHook(() => useMyAttempt('q1'), { wrapper });
    await waitFor(() => expect(result.current.data?.status).toBe('failed'));
  });
});

describe('useStartQuiz', () => {
  it('passes the quiz id', async () => {
    mocks.startQuiz.mockResolvedValue({ ok: true, questions: [] });
    const { result } = renderHook(() => useStartQuiz(), { wrapper });
    result.current.mutate('q1');
    await waitFor(() => expect(mocks.startQuiz).toHaveBeenCalledWith('q1'));
  });

  it('surfaces a locked refusal', async () => {
    mocks.startQuiz.mockRejectedValue(new Error('Finish the previous module first'));
    const { result } = renderHook(() => useStartQuiz(), { wrapper });
    result.current.mutate('q1');
    await waitFor(() => expect(result.current.error?.message).toMatch(/previous module/));
  });
});

describe('useSubmitQuiz', () => {
  it('passes the attempt and answers', async () => {
    mocks.submitQuiz.mockResolvedValue({ ok: true, score: 80, passed: true });
    const answers = [{ questionId: 'q1_1', response: { index: 2 } }];
    const { result } = renderHook(() => useSubmitQuiz(), { wrapper });
    result.current.mutate({ attemptId: 'at1', answers });
    await waitFor(() => expect(mocks.submitQuiz).toHaveBeenCalledWith('at1', answers));
  });

  // Passing a quiz completes an activity, which can unlock the next module.
  it('invalidates enrollments, outlines and the attempt on success', async () => {
    mocks.submitQuiz.mockResolvedValue({ ok: true, score: 100, passed: true });
    const spy = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useSubmitQuiz(), { wrapper });
    result.current.mutate({ attemptId: 'at1', answers: [], quizId: 'q1' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const keys = spy.mock.calls.map((c) => JSON.stringify(c[0].queryKey));
    expect(keys).toContain(JSON.stringify(['enrollments', 'mine']));
    expect(keys).toContain(JSON.stringify(['courses', 'outline']));
    expect(keys).toContain(JSON.stringify(['quizzes', 'attempt', 'q1']));
  });
});
