import { describe, it, expect, vi, beforeEach } from 'vitest';
import { waitFor } from '@testing-library/react';
import { renderQuery } from '../test/queryHarness';

// A trainer grading a paragraph or granting a retake happens while the trainee
// is sitting on the page, so this refetches when the window regains focus
// rather than waiting for a reload. Not realtime, but it costs one small query
// — and it is the sort of option that gets dropped in a refactor without
// anybody noticing the notice stopped arriving.

const mocks = vi.hoisted(() => ({ myNotices: vi.fn() }));
vi.mock('../api/notices', () => mocks);

const { useMyNotices, noticeKeys } = await import('./useNotices');

beforeEach(() => {
  vi.clearAllMocks();
  mocks.myNotices.mockResolvedValue([{ attemptId: 'a1', passed: true }]);
});

describe('useMyNotices', () => {
  it('reads the reader notices', async () => {
    const { result } = renderQuery(() => useMyNotices());
    await waitFor(() => expect(result.current.data).toHaveLength(1));
  });

  it('refetches when the window regains focus', async () => {
    const { result, client } = renderQuery(() => useMyNotices());
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const entry = client.getQueryCache().find({ queryKey: noticeKeys.mine });
    expect(entry.options.refetchOnWindowFocus).toBe(true);
  });

  it('does not refetch on every render, only after it goes stale', async () => {
    const { result, client } = renderQuery(() => useMyNotices());
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const entry = client.getQueryCache().find({ queryKey: noticeKeys.mine });
    expect(entry.options.staleTime).toBeGreaterThan(0);
  });
});
