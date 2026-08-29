import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import TrendChart from './TrendChart';

// The geometry is the part with no visual tell when it is wrong: a chart with a
// broken scale still draws a plausible line. These check the coordinates the
// path is actually built from, plus the one thing a screen reader gets — the
// aria-label, which is the whole chart as far as it is concerned.

const days = (points) =>
  points.map((p, i) => ({ day: `2026-03-${String(i + 1).padStart(2, '0')}`, points: p }));

// Two paths: the area fill first, then the line on top of it. The line is the
// one carrying just the data points.
const linePath = (container) => container.querySelectorAll('path')[1]?.getAttribute('d') ?? '';
const areaPath = (container) => container.querySelectorAll('path')[0]?.getAttribute('d') ?? '';

describe('plotting', () => {
  it('draws a point for every day it is given', () => {
    const { container } = render(<TrendChart data={days([1, 2, 3, 4])} />);
    // Move-to plus three line-tos in the line path.
    expect((linePath(container).match(/[ML] /g) ?? []).length).toBe(4);
  });

  /**
   * Empty days are drawn, not skipped. A chart built only from days with
   * events draws a smooth line through a fortnight of nothing, which is the
   * opposite of what a progress chart is for.
   */
  it('keeps a zero day as a point on the floor', () => {
    const { container } = render(<TrendChart data={days([10, 0, 10])} />);
    const d = linePath(container);
    // Highest value sits at the top of the plot, zero at the bottom.
    const ys = [...d.matchAll(/[ML] [\d.]+ ([\d.]+)/g)].map((m) => Number(m[1]));
    expect(ys[1]).toBeGreaterThan(ys[0]);
    expect(ys[0]).toBe(ys[2]);
  });

  it('scales to the largest value in the window', () => {
    const { container } = render(<TrendChart data={days([5, 10])} />);
    const ys = [...linePath(container).matchAll(/[ML] [\d.]+ ([\d.]+)/g)].map((m) => Number(m[1]));
    // 5 is half of 10, so it sits halfway down the plot from the top.
    expect(ys[0]).toBeGreaterThan(ys[1]);
  });

  /** Max is floored at 1, so a week of nothing cannot divide by zero. */
  it('survives a window where nothing happened', () => {
    const { container } = render(<TrendChart data={days([0, 0, 0])} />);
    const ys = [...linePath(container).matchAll(/[ML] [\d.]+ ([\d.]+)/g)].map((m) => Number(m[1]));
    expect(ys.every(Number.isFinite)).toBe(true);
    expect(new Set(ys).size).toBe(1);
  });

  /** One day would divide by zero when spacing points across the width. */
  it('centres a single day instead of dividing by zero', () => {
    const { container } = render(<TrendChart data={days([7])} />);
    const xs = [...linePath(container).matchAll(/[ML] ([\d.]+) /g)].map((m) => Number(m[1]));
    expect(xs.every(Number.isFinite)).toBe(true);
  });

  it('closes the area back down to the baseline', () => {
    const { container } = render(<TrendChart data={days([1, 2])} />);
    expect(areaPath(container).trim().endsWith('Z')).toBe(true);
  });
});

describe('what it is called', () => {
  /**
   * An SVG is opaque to a screen reader, so the label is the entire chart for
   * anyone not looking at it. It has to carry the measure, the window and the
   * total, or it says nothing at all.
   */
  it('describes itself with the measure, the window and the total', () => {
    render(<TrendChart data={days([2, 3, 5])} label="XP" />);
    expect(screen.getByRole('img', { name: 'XP over the last 3 days, 10 in total' }))
      .toBeInTheDocument();
  });

  it('formats the total through the caller', () => {
    render(<TrendChart data={days([2, 3])} label="Time" formatValue={(n) => `${n} min`} />);
    expect(screen.getByRole('img', { name: /5 min in total/ })).toBeInTheDocument();
  });
});

describe('nothing to draw', () => {
  it('renders nothing at all rather than an empty frame', () => {
    const { container } = render(<TrendChart data={[]} />);
    expect(container.querySelector('svg')).toBeNull();
  });

  it('treats missing data the same way', () => {
    const { container } = render(<TrendChart />);
    expect(container.querySelector('svg')).toBeNull();
  });
});
