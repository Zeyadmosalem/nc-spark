import { describe, it, expect } from 'vitest';
import { levelOf, pointsByDay, pointsByKind, LEVEL_SIZE } from './xp';

// The reads in this module are covered against the real database by
// supabase/tests/xp.test.js. What that cannot reach is the arithmetic the
// screens run on the rows afterwards — a level that is off by one, or a chart
// that silently drops the days nothing happened on.

const at = (daysAgo, points, kind = 'activity') => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return { createdAt: d.toISOString(), points, kind };
};

describe('levelOf', () => {
  it('starts everybody on level 1, not level 0', () => {
    expect(levelOf(0)).toMatchObject({ level: 1, into: 0, toNext: LEVEL_SIZE, percent: 0 });
  });

  it('advances a level exactly on the boundary', () => {
    expect(levelOf(LEVEL_SIZE - 1).level).toBe(1);
    expect(levelOf(LEVEL_SIZE).level).toBe(2);
  });

  it('reports how far into the level and how far to the next', () => {
    const l = levelOf(LEVEL_SIZE + 30);
    expect(l).toMatchObject({ level: 2, into: 30, toNext: LEVEL_SIZE - 30, percent: 30 });
  });

  /** A missing stats row must read as a new trainee, not as a crash. */
  it('treats missing XP as none', () => {
    expect(levelOf(undefined).level).toBe(1);
    expect(levelOf(null).level).toBe(1);
  });

  /** XP is a ledger sum and cannot go negative, but the display must not either. */
  it('floors a negative total at zero', () => {
    expect(levelOf(-50)).toMatchObject({ level: 1, into: 0, percent: 0 });
  });

  it('keeps climbing past the second level', () => {
    expect(levelOf(LEVEL_SIZE * 7 + 5).level).toBe(8);
  });
});

describe('pointsByDay', () => {
  it('returns one bucket per day in the window, oldest first', () => {
    const series = pointsByDay([], 7);
    expect(series).toHaveLength(7);
    expect(series[0].date < series[6].date).toBe(true);
  });

  /**
   * The whole reason the empty days are built first. A chart made only from
   * days that have events draws a straight line through a fortnight of doing
   * nothing, which is the opposite of what a progress chart is for.
   */
  it('keeps the days nothing happened on, at zero', () => {
    const series = pointsByDay([at(0, 25)], 5);
    expect(series).toHaveLength(5);
    expect(series.slice(0, 4).every((d) => d.points === 0)).toBe(true);
    expect(series[4].points).toBe(25);
  });

  it('adds up several events on the same day', () => {
    const series = pointsByDay([at(1, 10), at(1, 15), at(0, 5)], 3);
    expect(series[1].points).toBe(25);
    expect(series[2].points).toBe(5);
  });

  /** Older than the window is out of the window, not folded into day one. */
  it('ignores an event from before the window', () => {
    const series = pointsByDay([at(90, 999), at(0, 4)], 7);
    expect(series.reduce((n, d) => n + d.points, 0)).toBe(4);
  });

  it('copes with no events at all', () => {
    expect(pointsByDay([], 3).every((d) => d.points === 0)).toBe(true);
  });
});

describe('pointsByKind', () => {
  it('totals each kind and labels it', () => {
    const slices = pointsByKind([
      at(0, 10, 'activity'), at(0, 5, 'activity'), at(0, 20, 'quiz'),
    ]);
    expect(slices).toEqual([
      { kind: 'activity', label: expect.any(String), points: 15 },
      { kind: 'quiz', label: expect.any(String), points: 20 },
    ]);
  });

  /** A slice worth nothing is not a slice; it would draw a zero-width wedge. */
  it('drops a kind nobody has earned', () => {
    const slices = pointsByKind([at(0, 10, 'quiz')]);
    expect(slices.map((s) => s.kind)).toEqual(['quiz']);
  });

  it('ignores a kind the app does not know', () => {
    const slices = pointsByKind([at(0, 10, 'activity'), at(0, 99, 'smuggled')]);
    expect(slices).toHaveLength(1);
    expect(slices[0].points).toBe(10);
  });

  it('returns nothing at all for no events', () => {
    expect(pointsByKind([])).toEqual([]);
  });
});
