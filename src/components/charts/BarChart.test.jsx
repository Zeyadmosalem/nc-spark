import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import BarChart from './BarChart';

// A chart fails quietly: a wrong scale still draws bars, and nobody notices
// until a decision is made on them. These check the arithmetic that decides
// how long a bar is, which is the part with no visual tell when it is wrong.

const ROWS = [
  { id: 'a', label: 'Fire safety', value: 20 },
  { id: 'b', label: 'Manual handling', value: 10 },
  { id: 'c', label: 'First aid', value: 0 },
];

const widthOf = (container, i) =>
  container.querySelectorAll('.bar-fill')[i].style.width;

describe('drawing the bars', () => {
  it('lists every row with its label and value', () => {
    render(<BarChart rows={ROWS} />);
    for (const row of ROWS) {
      expect(screen.getByText(row.label)).toBeInTheDocument();
    }
    expect(screen.getByText('20')).toBeInTheDocument();
  });

  it('scales to the largest value, so the biggest bar is full width', () => {
    const { container } = render(<BarChart rows={ROWS} />);
    expect(widthOf(container, 0)).toBe('100%');
    expect(widthOf(container, 1)).toBe('50%');
  });

  /**
   * A dash is not a zero, and a zero is not a missing bar: a course nobody has
   * finished has to render as an empty track rather than disappear.
   */
  it('draws a zero as an empty bar rather than dropping the row', () => {
    const { container } = render(<BarChart rows={ROWS} />);
    expect(container.querySelectorAll('.bar-row')).toHaveLength(3);
    expect(widthOf(container, 2)).toBe('0%');
  });

  /**
   * A fixed max is what makes two charts comparable. Without it each chart
   * normalises to itself and a 3-of-100 bar looks identical to 100-of-100.
   */
  it('honours a fixed max instead of normalising to the data', () => {
    const { container } = render(<BarChart rows={ROWS} max={100} />);
    expect(widthOf(container, 0)).toBe('20%');
    expect(widthOf(container, 1)).toBe('10%');
  });

  it('never draws past the track, even if a value exceeds the max', () => {
    const { container } = render(<BarChart rows={[{ label: 'Over', value: 250 }]} max={100} />);
    expect(widthOf(container, 0)).toBe('100%');
  });

  it('never draws backwards from a negative value', () => {
    const { container } = render(<BarChart rows={[{ label: 'Under', value: -5 }]} max={100} />);
    expect(widthOf(container, 0)).toBe('0%');
  });

  /** Max is floored at 1, so an all-zero chart cannot divide by zero. */
  it('survives every value being zero', () => {
    const { container } = render(<BarChart rows={[
      { label: 'None', value: 0 }, { label: 'Also none', value: 0 },
    ]} />);
    expect(widthOf(container, 0)).toBe('0%');
    expect(widthOf(container, 1)).toBe('0%');
  });
});

describe('what it says with no data', () => {
  it('explains an empty chart rather than rendering a blank box', () => {
    render(<BarChart rows={[]} />);
    expect(screen.getByText('Nothing to show yet.')).toBeInTheDocument();
  });

  it('takes a caller-supplied empty message', () => {
    render(<BarChart rows={[]} emptyLabel="No one has fallen behind." />);
    expect(screen.getByText('No one has fallen behind.')).toBeInTheDocument();
  });

  it('treats a missing rows prop as empty, not as a crash', () => {
    render(<BarChart />);
    expect(screen.getByText('Nothing to show yet.')).toBeInTheDocument();
  });
});

describe('presentation hooks', () => {
  it('formats values through the caller, so units are not baked in', () => {
    render(<BarChart rows={[{ label: 'Away', value: 12 }]} formatValue={(n) => `${n} days`} />);
    expect(screen.getByText('12 days')).toBeInTheDocument();
  });

  it('lets the caller colour a bar by what it means', () => {
    const { container } = render(
      <BarChart rows={ROWS} colorFor={(row) => (row.value === 0 ? 'red' : 'green')} />);
    const fills = container.querySelectorAll('.bar-fill');
    expect(fills[0].style.background).toBe('green');
    expect(fills[2].style.background).toBe('red');
  });

  it('renders as a list, so a screen reader reads rows rather than a graphic', () => {
    render(<BarChart rows={ROWS} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });
});
