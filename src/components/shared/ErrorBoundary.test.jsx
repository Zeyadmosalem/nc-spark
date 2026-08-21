import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import ErrorBoundary from './ErrorBoundary';

function Boom({ message = 'kaboom' }) {
  throw new Error(message);
}

let consoleError;
beforeEach(() => {
  // React logs caught boundary errors; silence to keep test output readable.
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => consoleError.mockRestore());

describe('ErrorBoundary', () => {
  it('renders children when nothing throws', () => {
    render(<ErrorBoundary><p>healthy content</p></ErrorBoundary>);
    expect(screen.getByText('healthy content')).toBeInTheDocument();
  });

  it('catches a throwing child instead of propagating', () => {
    expect(() =>
      render(<ErrorBoundary><Boom /></ErrorBoundary>)
    ).not.toThrow();
  });

  it('shows the fallback panel with recovery actions', () => {
    render(<ErrorBoundary><Boom /></ErrorBoundary>);
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /back to start/i })).toBeInTheDocument();
  });

  it('uses a custom title when given', () => {
    render(<ErrorBoundary title="NC Spark failed to start"><Boom /></ErrorBoundary>);
    expect(screen.getByText('NC Spark failed to start')).toBeInTheDocument();
  });

  it('logs the error for diagnostics', () => {
    render(<ErrorBoundary><Boom message="disk on fire" /></ErrorBoundary>);
    const logged = consoleError.mock.calls.some((args) =>
      args.some((a) => a instanceof Error && a.message === 'disk on fire')
    );
    expect(logged).toBe(true);
  });

  it('recovers when the child stops throwing and Try again is clicked', async () => {
    const user = userEvent.setup();

    function Flaky() {
      const [broken, setBroken] = useState(true);
      return (
        <>
          <button onClick={() => setBroken(false)}>repair</button>
          <ErrorBoundary onReset={() => {}}>
            {broken ? <Boom /> : <p>recovered content</p>}
          </ErrorBoundary>
        </>
      );
    }

    render(<Flaky />);
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'repair' }));
    await user.click(screen.getByRole('button', { name: /try again/i }));

    expect(screen.getByText('recovered content')).toBeInTheDocument();
  });

  it('invokes onReset when Try again is clicked', async () => {
    const user = userEvent.setup();
    const onReset = vi.fn();
    render(<ErrorBoundary onReset={onReset}><Boom /></ErrorBoundary>);
    await user.click(screen.getByRole('button', { name: /try again/i }));
    expect(onReset).toHaveBeenCalledOnce();
  });
});
