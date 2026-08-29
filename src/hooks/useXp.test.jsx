import { describe, it, expect, vi, beforeEach } from 'vitest';
import { waitFor } from '@testing-library/react';
import { renderQuery } from '../test/queryHarness';

// Two things here are worth holding. The query keys, because everything that
// invalidates XP elsewhere has to name the same key or the screen keeps
// showing a stale total. And the `enabled` guard: a standings query fired
// before the course id arrives asks the server for the leaderboard of
// undefined, which is a 400 the user sees as a broken page.

const mocks = vi.hoisted(() => ({
  myStats: vi.fn(), myXpEvents: vi.fn(), courseStandings: vi.fn(),
}));
vi.mock('../api/xp', () => mocks);

const { useMyXp, useMyXpEvents, useCourseStandings, xpKeys } = await import('./useXp');

beforeEach(() => {
  vi.clearAllMocks();
  mocks.myStats.mockResolvedValue({ xp: 120, streak: 3 });
  mocks.myXpEvents.mockResolvedValue([]);
  mocks.courseStandings.mockResolvedValue([]);
});

describe('the keys', () => {
  it('names them so an invalidation elsewhere can match', () => {
    expect(xpKeys.stats).toEqual(['xp', 'stats']);
    expect(xpKeys.events(20)).toEqual(['xp', 'events', 20]);
    expect(xpKeys.standings('c1')).toEqual(['xp', 'standings', 'c1']);
  });

  it('varies the events key by limit, so two windows do not share a cache', () => {
    expect(xpKeys.events(10)).not.toEqual(xpKeys.events(50));
  });
});

describe('useMyXp', () => {
  it('reads the signed-in trainee stats', async () => {
    const { result } = renderQuery(() => useMyXp());
    await waitFor(() => expect(result.current.data).toEqual({ xp: 120, streak: 3 }));
    expect(mocks.myStats).toHaveBeenCalled();
  });

  it('surfaces a failure rather than sitting on it', async () => {
    mocks.myStats.mockRejectedValue(new Error('refused'));
    const { result } = renderQuery(() => useMyXp());
    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.error.message).toBe('refused');
  });
});

describe('useMyXpEvents', () => {
  it('asks for the default window', async () => {
    const { result } = renderQuery(() => useMyXpEvents());
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mocks.myXpEvents).toHaveBeenCalledWith(50);
  });

  it('passes a caller limit through', async () => {
    const { result } = renderQuery(() => useMyXpEvents(10));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mocks.myXpEvents).toHaveBeenCalledWith(10);
  });
});

describe('useCourseStandings', () => {
  it('fetches the standings for a course', async () => {
    const { result } = renderQuery(() => useCourseStandings('course-1'));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mocks.courseStandings).toHaveBeenCalledWith('course-1');
  });

  /** The guard. Without it this asks for the leaderboard of undefined. */
  it('does not fire before the course id arrives', () => {
    const { result } = renderQuery(() => useCourseStandings(undefined));
    expect(mocks.courseStandings).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('does not fire for an empty id either', () => {
    renderQuery(() => useCourseStandings(''));
    expect(mocks.courseStandings).not.toHaveBeenCalled();
  });
});
