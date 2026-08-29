import { describe, it, expect, vi, beforeEach } from 'vitest';
import { waitFor } from '@testing-library/react';
import { renderQuery } from '../test/queryHarness';

// The catalog is held for an hour on purpose — it changes about never, and
// refetching it on every mount of the achievements page is a request that can
// only ever return the same seven rows.

const mocks = vi.hoisted(() => ({
  badgeCatalog: vi.fn(), myBadges: vi.fn(), courseLeaderboard: vi.fn(),
}));
vi.mock('../api/badges', () => mocks);

const {
  useBadgeCatalog, useMyBadges, useCourseLeaderboard, badgeKeys,
} = await import('./useBadges');

beforeEach(() => {
  vi.clearAllMocks();
  mocks.badgeCatalog.mockResolvedValue([{ code: 'century' }]);
  mocks.myBadges.mockResolvedValue(new Map());
  mocks.courseLeaderboard.mockResolvedValue([]);
});

describe('the catalog', () => {
  it('reads every badge that exists', async () => {
    const { result } = renderQuery(() => useBadgeCatalog());
    await waitFor(() => expect(result.current.data).toHaveLength(1));
  });

  it('is held long enough not to refetch on every mount', async () => {
    const { result, client } = renderQuery(() => useBadgeCatalog());
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const entry = client.getQueryCache().find({ queryKey: badgeKeys.catalog });
    expect(entry.options.staleTime).toBeGreaterThanOrEqual(60 * 60 * 1000);
  });
});

describe('what the reader has earned', () => {
  it('reads their own badges', async () => {
    mocks.myBadges.mockResolvedValue(new Map([['century', '2026-03-09']]));
    const { result } = renderQuery(() => useMyBadges());
    await waitFor(() => expect(result.current.data?.size).toBe(1));
  });
});

describe('the leaderboard', () => {
  it('fetches the standing for a course', async () => {
    const { result } = renderQuery(() => useCourseLeaderboard('c1'));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mocks.courseLeaderboard).toHaveBeenCalledWith('c1');
  });

  it('does not fire before the course id arrives', () => {
    renderQuery(() => useCourseLeaderboard(undefined));
    expect(mocks.courseLeaderboard).not.toHaveBeenCalled();
  });

  it('keys by course, so two leaderboards do not share a cache', () => {
    expect(badgeKeys.leaderboard('a')).not.toEqual(badgeKeys.leaderboard('b'));
  });
});
