import { describe, it, expect, vi, afterEach } from 'vitest';
import { sinceLabel } from './activity';

// usageSummary and touchActivity are covered against the real database by
// supabase/tests/user-activity.test.js. sinceLabel is not — it is what the
// admin console actually shows, and "Never" versus "Today" is the difference
// between an account nobody has used and one somebody is using right now.

const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
};

afterEach(() => vi.useRealTimers());

describe('sinceLabel', () => {
  /** An account never signed into is the most interesting row on that screen. */
  it('says Never when there is no date at all', () => {
    expect(sinceLabel(null)).toBe('Never');
    expect(sinceLabel(undefined)).toBe('Never');
    expect(sinceLabel('')).toBe('Never');
  });

  it('says Today for something within the last day', () => {
    expect(sinceLabel(new Date().toISOString())).toBe('Today');
  });

  it('says Yesterday rather than "1 days ago"', () => {
    expect(sinceLabel(daysAgo(1))).toBe('Yesterday');
  });

  it('counts days up to a month', () => {
    expect(sinceLabel(daysAgo(9))).toBe('9 days ago');
    expect(sinceLabel(daysAgo(29))).toBe('29 days ago');
  });

  it('stops counting days at a month', () => {
    expect(sinceLabel(daysAgo(31))).toBe('Over a month ago');
  });

  it('counts months after two', () => {
    expect(sinceLabel(daysAgo(75))).toBe('Over 2 months ago');
    expect(sinceLabel(daysAgo(200))).toBe('Over 6 months ago');
  });

  /**
   * Clock skew between the browser and the database can put last_seen_at
   * slightly in the future. "Today" is the honest answer; a negative day
   * count would render as "-1 days ago".
   */
  it('treats a future timestamp as today', () => {
    const soon = new Date(Date.now() + 60_000).toISOString();
    expect(sinceLabel(soon)).toBe('Today');
  });
});
