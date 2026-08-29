import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import StatusPill from './StatusPill';

// This exists because four inline-styled pills had drifted: "Draft" and
// "Pending" were meant to be the same amber and were not, and "Not passed" and
// "Suspended" used two different reds. Its vocabulary is the database enums, so
// these hold the mapping in place — a status losing its tone is exactly the
// regression that started it.

const toneOf = (container) =>
  [...container.querySelector('span').classList].find((c) => c.startsWith('pill-'));

describe('the status vocabulary', () => {
  it.each([
    ['active', 'Active', 'pill-positive'],
    ['published', 'Published', 'pill-positive'],
    ['completed', 'Complete', 'pill-positive'],
    ['passed', 'Passed', 'pill-positive'],
    ['approved', 'Approved', 'pill-positive'],
  ])('renders %s as a positive pill reading "%s"', (status, label, tone) => {
    const { container } = render(<StatusPill status={status} />);
    expect(screen.getByText(label)).toBeInTheDocument();
    expect(toneOf(container)).toBe(tone);
  });

  /** The drift that started it: draft and pending are one amber, not two. */
  it('gives draft and pending the same warning tone', () => {
    const draft = render(<StatusPill status="draft" />);
    const pending = render(<StatusPill status="pending" />);
    expect(toneOf(draft.container)).toBe('pill-warning');
    expect(toneOf(pending.container)).toBe('pill-warning');
  });

  it('gives suspended and failed the same danger tone', () => {
    const suspended = render(<StatusPill status="suspended" />);
    const failed = render(<StatusPill status="failed" />);
    expect(toneOf(suspended.container)).toBe('pill-danger');
    expect(toneOf(failed.container)).toBe('pill-danger');
  });

  /** The enum values are not what a person should read. */
  it('turns enum values into words a person would use', () => {
    render(<StatusPill status="pending_review" />);
    expect(screen.getByText('Awaiting marking')).toBeInTheDocument();
  });

  it('calls a failed attempt "Not passed" rather than "Failed"', () => {
    render(<StatusPill status="failed" />);
    expect(screen.getByText('Not passed')).toBeInTheDocument();
  });
});

describe('a status it does not know', () => {
  /**
   * An unknown status still renders. Disappearing would hide a state the
   * schema has grown and this has not, which is the one case worth seeing.
   */
  it('shows it rather than rendering nothing', () => {
    const { container } = render(<StatusPill status="quarantined" />);
    expect(container.querySelector('span')).not.toBeNull();
    expect(toneOf(container)).toBe('pill-neutral');
  });

  it('renders nothing at all only when there is no status and no label', () => {
    const { container } = render(<StatusPill />);
    expect(container.firstChild).toBeNull();
  });
});

describe('caller overrides', () => {
  it('takes an explicit label', () => {
    render(<StatusPill status="active" label="On the course" />);
    expect(screen.getByText('On the course')).toBeInTheDocument();
  });

  it('takes an explicit tone', () => {
    const { container } = render(<StatusPill status="active" tone="danger" />);
    expect(toneOf(container)).toBe('pill-danger');
  });

  it('renders a label with no status at all', () => {
    render(<StatusPill label="Anything" />);
    expect(screen.getByText('Anything')).toBeInTheDocument();
  });
});
