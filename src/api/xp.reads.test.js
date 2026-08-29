import { describe, it, expect, vi, beforeEach } from 'vitest';
import { chain, callTo, makeClient } from '../test/supabaseStub';

// The reads. supabase/tests/xp.test.js proves the LEDGER and its policies
// against the real database; what it never touches is the shaping this module
// does on the way back — the defaults for a trainee with no stats row yet, and
// the standings roll-up, which reads names from public_profiles precisely so a
// trainer never needs `profiles` and its email column.

const { client, from } = makeClient({ signedInAs: 'me' });
vi.mock('./client', () => ({
  supabase: client, isConfigured: true, requireClient: () => client,
}));

const { myStats, myXpEvents, courseStandings } = await import('./xp');

beforeEach(() => { from.mockReset(); });

describe('myStats', () => {
  it('reads the signed-in trainee row', async () => {
    const q = chain({ data: { xp: 240, streak: 4, last_active_on: '2026-03-09' }, error: null });
    from.mockReturnValue(q);

    expect(await myStats()).toEqual({ xp: 240, streak: 4, lastActiveOn: '2026-03-09' });
    expect(from).toHaveBeenCalledWith('trainee_stats');
    expect(callTo(q, 'eq')).toEqual(['eq', 'profile_id', 'me']);
  });

  /**
   * A trainee whose stats row has not been created yet must read as a new
   * trainee, not as a blank card. Nulls here render as "—" and look broken.
   */
  it('reads zero for a trainee with no row yet', async () => {
    from.mockReturnValue(chain({ data: null, error: null }));
    expect(await myStats()).toEqual({ xp: 0, streak: 0, lastActiveOn: null });
  });

  it('throws when the read is refused, rather than reporting zero XP', async () => {
    from.mockReturnValue(chain({ data: null, error: { message: 'permission denied' } }));
    await expect(myStats()).rejects.toThrow('permission denied');
  });
});

describe('myXpEvents', () => {
  it('reads the newest first, for the signed-in trainee', async () => {
    const q = chain({ data: [], error: null });
    from.mockReturnValue(q);

    await myXpEvents();
    expect(from).toHaveBeenCalledWith('xp_events');
    expect(callTo(q, 'eq')).toEqual(['eq', 'trainee_id', 'me']);
    expect(callTo(q, 'order')).toEqual(['order', 'created_at', { ascending: false }]);
    expect(callTo(q, 'limit')).toEqual(['limit', 50]);
  });

  it('takes a caller limit', async () => {
    const q = chain({ data: [], error: null });
    from.mockReturnValue(q);
    await myXpEvents(5);
    expect(callTo(q, 'limit')).toEqual(['limit', 5]);
  });

  it('returns an empty list rather than null when there is nothing', async () => {
    from.mockReturnValue(chain({ data: null, error: null }));
    expect(await myXpEvents()).toEqual([]);
  });
});

describe('courseStandings', () => {
  const events = [
    { trainee_id: 'a', points: 10, kind: 'activity', created_at: '2026-03-01' },
    { trainee_id: 'a', points: 15, kind: 'quiz', created_at: '2026-03-02' },
    { trainee_id: 'b', points: 30, kind: 'activity', created_at: '2026-03-02' },
  ];
  const people = [
    { id: 'a', name: 'Alice Ahmed', avatar: 'AA' },
    { id: 'b', name: 'Bob Brown', avatar: null },
  ];

  const twoReads = () => {
    const first = chain({ data: events, error: null });
    const second = chain({ data: people, error: null });
    from.mockReturnValueOnce(first).mockReturnValueOnce(second);
    return { first, second };
  };

  it('totals each trainee and orders by XP', async () => {
    twoReads();
    const rows = await courseStandings('c1');

    expect(rows.map((r) => [r.traineeId, r.xp, r.awards]))
      .toEqual([['b', 30, 1], ['a', 25, 2]]);
  });

  it('names people from public_profiles, which carries no email', async () => {
    const { first, second } = twoReads();
    await courseStandings('c1');

    expect(from).toHaveBeenNthCalledWith(1, 'xp_events');
    expect(from).toHaveBeenNthCalledWith(2, 'public_profiles');
    expect(callTo(first, 'eq')).toEqual(['eq', 'course_id', 'c1']);
    expect(callTo(second, 'select')).toEqual(['select', 'id, name, avatar']);
  });

  /** A deleted account still has a ledger; it must not render as blank. */
  it('names a trainee it cannot look up', async () => {
    from.mockReturnValueOnce(chain({ data: events, error: null }))
        .mockReturnValueOnce(chain({ data: [people[0]], error: null }));

    const rows = await courseStandings('c1');
    expect(rows.find((r) => r.traineeId === 'b').name).toBe('Deactivated account');
  });

  it('asks for nothing at all without a course id', async () => {
    expect(await courseStandings(undefined)).toEqual([]);
    expect(from).not.toHaveBeenCalled();
  });

  /** No events means no second query: there are no names to look up. */
  it('does not look up names when nobody has earned anything', async () => {
    from.mockReturnValueOnce(chain({ data: [], error: null }));
    expect(await courseStandings('c1')).toEqual([]);
    expect(from).toHaveBeenCalledTimes(1);
  });
});
