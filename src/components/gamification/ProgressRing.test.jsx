import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ProgressRing from './ProgressRing';

// The ring is drawn by stroke-dashoffset, which is the one number here nobody
// can eyeball: an off-by-one in the arithmetic still draws a convincing ring.
// The percentage under it is what a screen reader actually gets.

const arc = (container) => {
  const circles = container.querySelectorAll('circle');
  return circles[circles.length - 1];
};
const offset = (container) => Number(arc(container).style.strokeDashoffset);
const circumference = (radius, stroke) => (radius - stroke * 2) * 2 * Math.PI;

describe('the arc', () => {
  it('draws nothing at zero', () => {
    const { container } = render(<ProgressRing progress={0} />);
    expect(offset(container)).toBeCloseTo(circumference(40, 8), 3);
  });

  it('closes the ring at a hundred', () => {
    const { container } = render(<ProgressRing progress={100} />);
    expect(offset(container)).toBeCloseTo(0, 3);
  });

  it('draws half the ring at fifty', () => {
    const { container } = render(<ProgressRing progress={50} />);
    expect(offset(container)).toBeCloseTo(circumference(40, 8) / 2, 3);
  });

  it('scales with the radius it is given', () => {
    const { container } = render(<ProgressRing progress={0} radius={20} stroke={4} />);
    expect(offset(container)).toBeCloseTo(circumference(20, 4), 3);
  });
});

describe('a number outside the range', () => {
  /** Clamped, so a bad figure upstream reads as 100%, not as a broken ring. */
  it('does not over-fill past a hundred', () => {
    const { container } = render(<ProgressRing progress={150} />);
    expect(offset(container)).toBeCloseTo(0, 3);
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('does not draw backwards below zero', () => {
    const { container } = render(<ProgressRing progress={-20} />);
    expect(offset(container)).toBeCloseTo(circumference(40, 8), 3);
    expect(screen.getByText('0%')).toBeInTheDocument();
  });

  it('treats a missing or unreadable value as zero', () => {
    render(<ProgressRing />);
    expect(screen.getByText('0%')).toBeInTheDocument();
  });
});

describe('the label', () => {
  it('states the percentage in text, not in the arc alone', () => {
    render(<ProgressRing progress={42} />);
    expect(screen.getByText('42%')).toBeInTheDocument();
  });

  it('rounds rather than showing a fraction of a percent', () => {
    render(<ProgressRing progress={66.6666} />);
    expect(screen.getByText('67%')).toBeInTheDocument();
  });
});
