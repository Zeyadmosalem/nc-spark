import { describe, it, expect, vi, beforeEach } from 'vitest';
import { chain, callTo, makeClient } from '../test/supabaseStub';

// supabase/tests/badges.test.js proves the awarding rules and the leaderboard's
// access filter against the real database. These cover the shaping on this
// side: the catalog dropping sort_order once it has been sorted, the earned
// map the shelf reads, and the deactivated-account fallback that stops a
// leaderboard row rendering blank.

const { client, from } = makeClient({ signedInAs: 'me' });
vi.mock('./client', () => ({
  supabase: client, isConfigured: true, requireClient: () => client,
}));

const { badgeCatalog, myBadges, courseLeaderboard } = await import('./badges');

beforeEach(() => { from.mockReset(); });

describe('badgeCatalog', () => {
  it('reads every badge in display order', async () => {
    const q = chain({ data: [
      { code: 'first_steps', name: 'First steps', description: 'Finished your first activity.', icon: 'spark', sort_order: 1 },
    ], error: null });
    from.mockReturnValue(q);

    expect(await badgeCatalog()).toEqual([{
      code: 'first_steps', name: 'First steps',
      description: 'Finished your first activity.', icon: 'spark',
    }]);
    expect(from).toHaveBeenCalledWith('badges');
    expect(callTo(q, 'order')).toEqual(['order', 'sort_order']);
  });

  it('returns an empty catalog rather than null', async () => {
    from.mockReturnValue(chain({ data: null, error: null }));
    expect(await badgeCatalog()).toEqual([]);
  });
});

describe('myBadges', () => {
  /** A Map, because the shelf asks "have I got this one" per badge. */
  it('returns what the reader has earned, keyed by code', async () => {
    const q = chain({ data: [
      { badge_code: 'century', earned_at: '2026-03-09T10:00:00Z' },
    ], error: null });
    from.mockReturnValue(q);

    const earned = await myBadges();
    expect(earned.get('century')).toBe('2026-03-09T10:00:00Z');
    expect(callTo(q, 'eq')).toEqual(['eq', 'trainee_id', 'me']);
  });

  it('returns an empty map for somebody who has earned nothing', async () => {
    from.mockReturnValue(chain({ data: null, error: null }));
    expect((await myBadges()).size).toBe(0);
  });
});

describe('courseLeaderboard', () => {
  it('reads the standing in position order', async () => {
    const q = chain({ data: [
      { trainee_id: 'a', name: 'Alice', avatar: 'AA', xp: 110, position: 1 },
    ], error: null });
    from.mockReturnValue(q);

    expect(await courseLeaderboard('c1')).toEqual([
      { traineeId: 'a', name: 'Alice', avatar: 'AA', xp: 110, position: 1 },
    ]);
    expect(from).toHaveBeenCalledWith('course_leaderboard');
    expect(callTo(q, 'eq')).toEqual(['eq', 'course_id', 'c1']);
    expect(callTo(q, 'order')).toEqual(['order', 'position']);
  });

  /** public_profiles returns a null name for a deactivated account. */
  it('names a row it cannot resolve rather than rendering blank', async () => {
    from.mockReturnValue(chain({ data: [
      { trainee_id: 'x', name: null, avatar: null, xp: 40, position: 2 },
    ], error: null }));

    expect((await courseLeaderboard('c1'))[0].name).toBe('Deactivated account');
  });

  it('asks for nothing without a course id', async () => {
    expect(await courseLeaderboard(undefined)).toEqual([]);
    expect(from).not.toHaveBeenCalled();
  });

  it('returns an empty standing rather than null', async () => {
    from.mockReturnValue(chain({ data: null, error: null }));
    expect(await courseLeaderboard('c1')).toEqual([]);
  });
});
