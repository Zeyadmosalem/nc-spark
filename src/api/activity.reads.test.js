import { describe, it, expect, vi, beforeEach } from 'vitest';
import { chain, callTo, makeClient } from '../test/supabaseStub';

// Usage tracking, from the browser's side. supabase/tests/user-activity.test.js
// proves the definer function records the CALLER; these cover the two things
// that live here instead — that a failed visit-record can never be the reason
// somebody cannot use the app, and the daily roll-up, which has to count
// distinct people rather than visits.

const { client, from } = makeClient();
const rpc = vi.fn();
client.rpc = rpc;
vi.mock('./client', () => ({
  supabase: client, isConfigured: true, requireClient: () => client,
}));

const { touchActivity, usageSummary, dailyActiveUsers } = await import('./activity');

beforeEach(() => {
  from.mockReset();
  rpc.mockReset();
  rpc.mockResolvedValue({ error: null });
});

describe('touchActivity', () => {
  it('records the visit through the definer function', async () => {
    await touchActivity();
    expect(rpc).toHaveBeenCalledWith('touch_activity');
  });

  /**
   * The whole reason for the try/catch. A missed visit is a gap in a report;
   * a thrown error here is a blank screen on sign-in.
   */
  it('never throws, whatever the server does', async () => {
    rpc.mockRejectedValue(new Error('offline'));
    await expect(touchActivity()).resolves.toBeUndefined();
  });
});

describe('usageSummary', () => {
  it('reads the summary view, most recently seen first', async () => {
    const q = chain({ data: [], error: null });
    from.mockReturnValue(q);

    await usageSummary();
    expect(from).toHaveBeenCalledWith('user_activity_summary');
    expect(callTo(q, 'order'))
      .toEqual(['order', 'last_seen_at', { ascending: false, nullsFirst: false }]);
  });

  /**
   * An account nobody has ever used is the most interesting row on that
   * screen, so it must sort last rather than be dropped — hence nullsFirst
   * false rather than a filter.
   */
  it('keeps an account that has never been seen', async () => {
    from.mockReturnValue(chain({
      data: [{ user_id: 'u1', name: 'Never Signedin', role: 'trainee', last_seen_at: null, visits_30: 0 }],
      error: null,
    }));

    const [row] = await usageSummary();
    expect(row.lastSeenAt).toBeNull();
    expect(row.name).toBe('Never Signedin');
  });

  it('returns an empty list rather than null', async () => {
    from.mockReturnValue(chain({ data: null, error: null }));
    expect(await usageSummary()).toEqual([]);
  });
});

describe('dailyActiveUsers', () => {
  const today = new Date().toISOString().slice(0, 10);
  const dayBefore = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

  it('returns one bucket per day in the window, oldest first', async () => {
    from.mockReturnValue(chain({ data: [], error: null }));
    const series = await dailyActiveUsers(7);

    expect(series).toHaveLength(7);
    expect(series[6].date).toBe(today);
    expect(series[0].date < series[6].date).toBe(true);
  });

  /** Active USERS, not visits: three visits by one person is one person. */
  it('counts each person once a day, however often they visited', async () => {
    from.mockReturnValue(chain({
      data: [
        { user_id: 'a', day: today }, { user_id: 'a', day: today },
        { user_id: 'b', day: today },
      ],
      error: null,
    }));

    const series = await dailyActiveUsers(3);
    expect(series[2]).toEqual({ date: today, points: 2 });
  });

  it('keeps the days nobody signed in, at zero', async () => {
    from.mockReturnValue(chain({ data: [{ user_id: 'a', day: today }], error: null }));
    const series = await dailyActiveUsers(3);

    expect(series.map((d) => d.points)).toEqual([0, 0, 1]);
  });

  it('asks only for the window it is going to draw', async () => {
    const q = chain({ data: [], error: null });
    from.mockReturnValue(q);

    await dailyActiveUsers(10);
    expect(from).toHaveBeenCalledWith('user_activity');
    expect(callTo(q, 'gte')).toEqual(['gte', 'day', dayBefore(10)]);
  });

  it('ignores a row from outside the window rather than misplacing it', async () => {
    from.mockReturnValue(chain({
      data: [{ user_id: 'a', day: dayBefore(90) }], error: null,
    }));

    const series = await dailyActiveUsers(5);
    expect(series.every((d) => d.points === 0)).toBe(true);
  });
});
