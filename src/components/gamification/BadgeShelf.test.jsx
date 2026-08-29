import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import BadgeShelf from './BadgeShelf';

// The shelf shows unearned badges alongside earned ones on purpose: a shelf of
// only what you already have says nothing about what to do next. That makes
// "which state is this tile in" the thing worth holding — and it has to be
// legible without colour, because dimming is not a status.

const CATALOG = [
  { code: 'first_steps', name: 'First steps', description: 'Finished your first activity.', icon: 'spark' },
  { code: 'century',     name: 'Century',     description: 'Earned 100 XP.',                icon: 'achievements' },
  { code: 'finisher',    name: 'Finisher',    description: 'Completed a whole course.',     icon: 'complete' },
];

const earned = (...codes) => new Map(codes.map((c) => [c, '2026-03-09T10:00:00Z']));

describe('the shelf', () => {
  it('shows every badge in the catalog, earned or not', () => {
    render(<BadgeShelf catalog={CATALOG} earned={earned('century')} />);
    for (const badge of CATALOG) {
      expect(screen.getByText(badge.name)).toBeInTheDocument();
      expect(screen.getByText(badge.description)).toBeInTheDocument();
    }
  });

  it('renders nothing when there is no catalog to show', () => {
    const { container } = render(<BadgeShelf catalog={[]} earned={earned()} />);
    expect(container.firstChild).toBeNull();
  });

  it('survives a missing catalog', () => {
    const { container } = render(<BadgeShelf />);
    expect(container.firstChild).toBeNull();
  });
});

describe('earned and not', () => {
  /**
   * Status in words. Dimming an unearned tile is a visual convention a
   * screen reader cannot read and a colourblind reader may not catch.
   */
  it('says "Not yet" on a badge that has not been earned', () => {
    render(<BadgeShelf catalog={CATALOG} earned={earned('century')} />);
    expect(screen.getAllByText('Not yet')).toHaveLength(2);
  });

  it('says when an earned badge was earned, with a readable date', () => {
    const { container } = render(<BadgeShelf catalog={CATALOG} earned={earned('century')} />);
    const states = [...container.querySelectorAll('.badge-tile-state')]
      .map((el) => el.textContent.trim());

    const got = states.find((t) => t.startsWith('Earned'));
    expect(got).toBeTruthy();
    // The date itself, not just the word — an empty formatDate would leave
    // "Earned" alone and read as a bug.
    expect(got).toMatch(/Earned .*2026/);
  });

  it('marks only the earned tiles', () => {
    const { container } = render(<BadgeShelf catalog={CATALOG} earned={earned('century', 'finisher')} />);
    expect(container.querySelectorAll('.badge-tile.is-earned')).toHaveLength(2);
    expect(container.querySelectorAll('.badge-tile')).toHaveLength(3);
  });

  it('shows nothing as earned when nothing is', () => {
    const { container } = render(<BadgeShelf catalog={CATALOG} earned={earned()} />);
    expect(container.querySelectorAll('.is-earned')).toHaveLength(0);
    expect(screen.getAllByText('Not yet')).toHaveLength(3);
  });

  it('treats a missing earned map as nothing earned, not as a crash', () => {
    render(<BadgeShelf catalog={CATALOG} />);
    expect(screen.getAllByText('Not yet')).toHaveLength(3);
  });
});
