import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mocks = vi.hoisted(() => ({
  myQuizResults: vi.fn(), completedActivityCount: vi.fn(),
}));
vi.mock('../api/progress', () => mocks);

const { useMyQuizResults, useCompletedActivityCount, progressKeys } =
  await import('./useProgress');

let client;
function wrapper({ children }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

describe('useMyQuizResults', () => {
  it('returns the history', async () => {
    mocks.myQuizResults.mockResolvedValue([{ id: 'a1', quizTitle: 'Check' }]);
    const { result } = renderHook(() => useMyQuizResults(), { wrapper });
    await waitFor(() => expect(result.current.data?.[0]?.quizTitle).toBe('Check'));
  });

  it('surfaces a refusal instead of an empty history', async () => {
    mocks.myQuizResults.mockRejectedValue(new Error('permission denied'));
    const { result } = renderHook(() => useMyQuizResults(), { wrapper });
    await waitFor(() => expect(result.current.error?.message).toMatch(/permission denied/));
  });
});

describe('useCompletedActivityCount', () => {
  /**
   * The enrolment list arrives from another query. Firing with undefined would
   * flash "0 activities" at a trainee who has done twenty.
   */
  it('waits for the enrolment list', () => {
    renderHook(() => useCompletedActivityCount(undefined), { wrapper });
    expect(mocks.completedActivityCount).not.toHaveBeenCalled();
  });

  it('runs on an empty list, which is a real answer', async () => {
    mocks.completedActivityCount.mockResolvedValue(0);
    const { result } = renderHook(() => useCompletedActivityCount([]), { wrapper });
    await waitFor(() => expect(result.current.data).toBe(0));
  });

  it('counts', async () => {
    mocks.completedActivityCount.mockResolvedValue(17);
    const { result } = renderHook(() => useCompletedActivityCount(['e1']), { wrapper });
    await waitFor(() => expect(result.current.data).toBe(17));
  });

  // The key is the cache identity. Same set, different order, same entry.
  it('does not treat a reordered list as a different query', () => {
    expect(progressKeys.completions(['b', 'a']))
      .toEqual(progressKeys.completions(['a', 'b']));
  });

  it('does not mutate the array it was given', () => {
    const ids = ['b', 'a'];
    progressKeys.completions(ids);
    expect(ids).toEqual(['b', 'a']);
  });
});
