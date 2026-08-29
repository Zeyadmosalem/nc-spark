import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import StatCard from './StatCard';

// Two rules live in this component and nowhere else. A dash is not a zero —
// "not measured yet" and "measured, and it is nothing" must stay distinguishable
// on a trainee's record. And the count-up must never run for somebody who has
// asked for reduced motion, because it is a JavaScript animation that CSS
// cannot stop.

vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useReducedMotion: () => globalThis.__reducedMotion ?? false };
});

afterEach(() => { globalThis.__reducedMotion = false; });

describe('the figure', () => {
  it('shows the label and the value', () => {
    render(<StatCard label="Completed" value={3} />);
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  /**
   * The distinction the card exists to preserve. An em dash means nobody has
   * measured this; a zero means somebody did and the answer was none.
   */
  it('renders an em dash as given, rather than turning it into a zero', () => {
    render(<StatCard label="Average score" value="—" />);
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('renders a real zero as a zero', () => {
    render(<StatCard label="Completed" value={0} />);
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('passes a formatted string straight through', () => {
    render(<StatCard label="Progress" value="67%" />);
    expect(screen.getByText('67%')).toBeInTheDocument();
  });

  it('shows a subtitle when given one', () => {
    render(<StatCard label="Awaiting approval" value={2} sub="Two people are waiting" />);
    expect(screen.getByText('Two people are waiting')).toBeInTheDocument();
  });

  it('omits the subtitle entirely when there is none', () => {
    const { container } = render(<StatCard label="Completed" value={1} />);
    expect(container.querySelector('.stat-card-sub')).toBeNull();
  });
});

describe('the count-up', () => {
  /**
   * Small numbers are shown outright: counting 0, 1, 2 draws more attention
   * than the figure deserves.
   */
  it('does not animate a number too small to be worth watching', () => {
    render(<StatCard label="In progress" value={3} />);
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  /**
   * useReducedMotion rather than the media query, because CSS cannot stop a
   * requestAnimationFrame loop. Somebody who asked for less motion gets the
   * final figure immediately, not an animated approach to it.
   */
  it('shows the final figure at once under reduced motion', () => {
    globalThis.__reducedMotion = true;
    render(<StatCard label="XP" value={840} />);
    expect(screen.getByText('840')).toBeInTheDocument();
  });

  it('shows the final figure at once when animation is switched off', () => {
    render(<StatCard label="XP" value={840} animate={false} />);
    expect(screen.getByText('840')).toBeInTheDocument();
  });
});

describe('presentation', () => {
  it('exposes the caller colour as a custom property rather than a hard style', () => {
    const { container } = render(<StatCard label="XP" value={1} color="var(--brand-primary)" />);
    expect(container.querySelector('.stat-card').style.getPropertyValue('--stat-color'))
      .toBe('var(--brand-primary)');
  });

  it('renders an icon when asked', () => {
    const { container } = render(<StatCard label="Courses" value={2} icon="book" />);
    expect(container.querySelector('.stat-card-icon')).not.toBeNull();
  });
});
