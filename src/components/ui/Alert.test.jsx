import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Alert from './Alert';

// There were four near-identical copies of this, each a bare <p> in the accent
// colour, and two were not marked as alerts at all — a screen-reader user
// pressed a button, the request was refused, and nothing was announced. The
// live-region rules below are the whole reason the component exists, and they
// are invisible to every kind of review except a test.

describe('announcing', () => {
  /** An error interrupts: "that was refused" is worth cutting in for. */
  it.each(['error', 'warning'])('announces a %s assertively', (tone) => {
    render(<Alert tone={tone}>Something went wrong.</Alert>);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveAttribute('aria-live', 'assertive');
  });

  /** Context does not: cutting in to say "here is some background" is rude. */
  it.each(['success', 'info'])('announces a %s politely', (tone) => {
    render(<Alert tone={tone}>All done.</Alert>);
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('defaults to an error, which is the safe way to be wrong', () => {
    render(<Alert>Refused.</Alert>);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});

describe('what it shows', () => {
  it('renders its children', () => {
    render(<Alert>Could not save the module.</Alert>);
    expect(screen.getByText('Could not save the module.')).toBeInTheDocument();
  });

  /** Most callers have a TanStack mutation error and nothing else to say. */
  it('takes the message straight off an Error', () => {
    render(<Alert error={new Error('Finish the previous module first')} />);
    expect(screen.getByText('Finish the previous module first')).toBeInTheDocument();
  });

  it('prefers explicit children over the error message', () => {
    render(<Alert error={new Error('raw postgres text')}>Something clearer.</Alert>);
    expect(screen.getByText('Something clearer.')).toBeInTheDocument();
    expect(screen.queryByText('raw postgres text')).not.toBeInTheDocument();
  });

  it('shows a title alongside the body', () => {
    render(<Alert title="Could not load the catalog.">The server said no.</Alert>);
    expect(screen.getByText('Could not load the catalog.')).toBeInTheDocument();
    expect(screen.getByText('The server said no.')).toBeInTheDocument();
  });

  /**
   * An Error with an empty message must not silence the title. QueryError
   * relies on this: the title says what failed even when the server said
   * nothing useful about why.
   */
  it('still renders a title when the error carries no message', () => {
    render(<Alert title="Could not load the catalog." error={new Error('')} />);
    expect(screen.getByText('Could not load the catalog.')).toBeInTheDocument();
  });

  it('renders nothing when there is neither a body nor a title', () => {
    const { container } = render(<Alert />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing for an empty error and no title', () => {
    const { container } = render(<Alert error={new Error('')} />);
    expect(container.firstChild).toBeNull();
  });
});

describe('tone', () => {
  it('carries the tone in a class rather than an inline colour', () => {
    const { container } = render(<Alert tone="success">Saved.</Alert>);
    expect(container.querySelector('.alert-success')).not.toBeNull();
  });
});
