import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import EmptyState from './EmptyState';

// An empty list and a failed request look identical when both render as blank
// space. QueryError covers the failure side; this is the other half — nothing
// here, on purpose, and what to do about it.

describe('saying there is nothing', () => {
  it('states the situation', () => {
    render(<EmptyState title="Nothing on your plate yet" />);
    expect(screen.getByText('Nothing on your plate yet')).toBeInTheDocument();
  });

  it('explains it', () => {
    render(<EmptyState title="No courses">You are not enrolled in anything yet.</EmptyState>);
    expect(screen.getByText('You are not enrolled in anything yet.')).toBeInTheDocument();
  });

  /** The way out matters more than the message: an empty state without an
      action is a dead end. */
  it('carries an action', () => {
    render(<EmptyState title="No courses" action={<button type="button">Browse the catalog</button>} />);
    expect(screen.getByRole('button', { name: 'Browse the catalog' })).toBeInTheDocument();
  });
});

describe('the icon', () => {
  it('hides it from a screen reader, because it repeats the title', () => {
    const { container } = render(<EmptyState icon="compass" title="Nothing here" />);
    expect(container.querySelector('.empty-state-icon')).toHaveAttribute('aria-hidden', 'true');
  });

  /**
   * Named icons and literal nodes both work. Several callers still pass an
   * emoji belonging to their own subject matter, which is why changing icon
   * system did not have to land in fourteen files at once.
   */
  it('accepts a node as well as an icon name', () => {
    render(<EmptyState icon={<span data-testid="custom">🎯</span>} title="Nothing here" />);
    expect(screen.getByTestId('custom')).toBeInTheDocument();
  });

  it('omits the icon block entirely when there is none', () => {
    const { container } = render(<EmptyState title="Nothing here" />);
    expect(container.querySelector('.empty-state-icon')).toBeNull();
  });
});
