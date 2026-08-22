import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import QueryError from './QueryError';

describe('QueryError', () => {
  it('renders nothing when there is no error', () => {
    const { container } = render(<QueryError error={null} what="the catalog" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('announces the failure to assistive tech', () => {
    render(<QueryError error={new Error('network down')} what="the catalog" />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('names what failed, so the user knows which part of the page is missing', () => {
    render(<QueryError error={new Error('network down')} what="the approval queue" />);
    expect(screen.getByRole('alert')).toHaveTextContent(/approval queue/i);
  });

  it('includes the server message', () => {
    render(<QueryError error={new Error('network down')} what="the catalog" />);
    expect(screen.getByRole('alert')).toHaveTextContent(/network down/);
  });

  it('still renders a message when the error carries no message', () => {
    render(<QueryError error={{}} what="the catalog" />);
    expect(screen.getByRole('alert')).toHaveTextContent(/catalog/i);
  });
});
