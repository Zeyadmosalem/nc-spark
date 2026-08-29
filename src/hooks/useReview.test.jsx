import { describe, it, expect, vi, beforeEach } from 'vitest';
import { waitFor } from '@testing-library/react';
import { renderQuery } from '../test/queryHarness';

// Both queues shift when a grade lands: a marked attempt leaves the review
// list and, if it failed, joins the blocked one. Invalidating one and not the
// other leaves a trainer looking at work they have already done.

const mocks = vi.hoisted(() => ({
  pendingReviews: vi.fn(), blockedAttempts: vi.fn(), openRetakeGrants: vi.fn(),
  gradeParagraph: vi.fn(), grantRetake: vi.fn(),
}));
vi.mock('../api/review', () => mocks);

const {
  usePendingReviews, useBlockedAttempts, useOpenRetakeGrants,
  useGradeParagraph, useGrantRetake, reviewKeys,
} = await import('./useReview');

beforeEach(() => {
  vi.clearAllMocks();
  mocks.pendingReviews.mockResolvedValue([{ id: 'a' }]);
  mocks.blockedAttempts.mockResolvedValue([]);
  mocks.openRetakeGrants.mockResolvedValue([]);
  mocks.gradeParagraph.mockResolvedValue({ ok: true });
  mocks.grantRetake.mockResolvedValue({ ok: true });
});

describe('the queues', () => {
  it('reads what is waiting to be marked', async () => {
    const { result } = renderQuery(() => usePendingReviews());
    await waitFor(() => expect(result.current.data).toHaveLength(1));
  });

  it('reads what is blocked', async () => {
    const { result } = renderQuery(() => useBlockedAttempts());
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mocks.blockedAttempts).toHaveBeenCalled();
  });

  it('reads the open retake grants', async () => {
    const { result } = renderQuery(() => useOpenRetakeGrants());
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mocks.openRetakeGrants).toHaveBeenCalled();
  });
});

describe('grading', () => {
  const keysOf = (client) => {
    const spy = vi.spyOn(client, 'invalidateQueries');
    return () => spy.mock.calls.map((c) => JSON.stringify(c[0].queryKey));
  };

  it('refreshes all three queues after a grade', async () => {
    const { result, client } = renderQuery(() => useGradeParagraph());
    const keys = keysOf(client);

    result.current.mutate({ attemptId: 'a1', answerId: 'x', award: 2 });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    for (const key of [reviewKeys.pending, reviewKeys.blocked, reviewKeys.grants]) {
      expect(keys()).toContain(JSON.stringify(key));
    }
  });

  it('refreshes all three after a retake is granted', async () => {
    const { result, client } = renderQuery(() => useGrantRetake());
    const keys = keysOf(client);

    result.current.mutate({ quizId: 'q1', traineeId: 't1' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(keys()).toHaveLength(3);
  });

  /**
   * TanStack calls a mutationFn with (variables, context). Passing an api
   * function by reference hands it a mutation context it never asked for,
   * which is how an internal object ends up in a request body.
   */
  it('calls the api with the variables and nothing else', async () => {
    const { result } = renderQuery(() => useGradeParagraph());
    result.current.mutate({ attemptId: 'a1' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mocks.gradeParagraph).toHaveBeenCalledTimes(1);
    expect(mocks.gradeParagraph.mock.calls[0]).toHaveLength(1);
    expect(mocks.gradeParagraph.mock.calls[0][0]).toEqual({ attemptId: 'a1' });
  });

  it('does not refresh anything when the grade is refused', async () => {
    mocks.gradeParagraph.mockRejectedValue(new Error('not pending review'));
    const { result, client } = renderQuery(() => useGradeParagraph());
    const spy = vi.spyOn(client, 'invalidateQueries');

    result.current.mutate({ attemptId: 'a1' });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(spy).not.toHaveBeenCalled();
  });
});
