import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import App from './App';

// Does currentUser going null while a page is mounted actually crash the app,
// or do the route guards in App.jsx unmount the subtree first? This decides
// whether the 39 unguarded `currentUser.x` dereferences are a real defect or
// merely a theoretical one.

function Controls() {
  const { login, logout, currentUser } = useApp();
  useEffect(() => { if (!currentUser) login('trainee', 's1'); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return <button onClick={logout}>do-logout</button>;
}

let consoleError;
beforeEach(() => {
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  window.history.pushState({}, '', '/trainee');
});
afterEach(() => {
  consoleError.mockRestore();
  window.history.pushState({}, '', '/');
});

const crashed = () =>
  consoleError.mock.calls.flat().some((a) => {
    const msg = a instanceof Error ? a.message : String(a);
    return /Cannot read properties of null|Cannot read properties of undefined/i.test(msg);
  });

describe('logout while a trainee page is mounted', () => {
  it('unmounts to the login screen without dereferencing a null user', async () => {
    const user = userEvent.setup();

    render(
      <AppProvider>
        <Controls />
        <App />
      </AppProvider>
    );

    // Trainee dashboard is up.
    await waitFor(() => expect(screen.getByText(/do-logout/)).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'do-logout' }));

    // Should land on the login screen, not crash.
    await waitFor(() =>
      expect(screen.getByText(/Welcome to NC Spark/i)).toBeInTheDocument()
    );
    expect(crashed()).toBe(false);
  });
});
