import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({ useSession: vi.fn() }));
vi.mock('./hooks/useSession', () => ({ useSession: mocks.useSession }));

const { default: App } = await import('./App');
const { AppProvider } = await import('./context/AppContext');
const { USERS } = await import('./data/dummyData');

const trainee = USERS.trainees[0];

function session(status, profile = null) {
  mocks.useSession.mockReturnValue({ status, profile, session: null, isLoading: status === 'loading' });
}

function renderApp(path = '/', currentUser = null) {
  window.history.pushState({}, '', path);
  return render(<AppProvider currentUser={currentUser}><App /></AppProvider>);
}

let consoleError;
beforeEach(() => {
  vi.clearAllMocks();
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  consoleError.mockRestore();
  window.history.pushState({}, '', '/');
});

describe('routing by session status', () => {
  it('shows the login screen when signed out', async () => {
    session('signed-out');
    renderApp('/trainee');
    expect(await screen.findByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('shows a loading state while resolving the session', () => {
    session('loading');
    renderApp('/');
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows the pending screen for an unapproved account', async () => {
    session('pending', { id: 'u1', role: 'trainee', status: 'pending' });
    renderApp('/');
    expect(await screen.findByText(/Awaiting approval/i)).toBeInTheDocument();
  });

  it('shows the suspended screen for a suspended account', async () => {
    session('suspended', { id: 'u1', role: 'trainee', status: 'suspended' });
    renderApp('/');
    expect(await screen.findByText(/Account suspended/i)).toBeInTheDocument();
  });

  it('does not offer the app to a pending account', async () => {
    session('pending', { id: 'u1', role: 'trainee', status: 'pending' });
    renderApp('/trainee');
    expect(await screen.findByText(/Awaiting approval/i)).toBeInTheDocument();
    expect(screen.queryByText(/Learning Library/i)).not.toBeInTheDocument();
  });

  it('lets an active trainee reach the trainee area', async () => {
    session('active', { ...trainee, status: 'active' });
    renderApp('/trainee/courses', trainee);
    expect(await screen.findByText(/Learning Library/i)).toBeInTheDocument();
  });

  it('REDIRECTS a trainee away from the admin area', async () => {
    session('active', { ...trainee, status: 'active' });
    renderApp('/admin', trainee);
    await waitFor(() => expect(window.location.pathname).toBe('/trainee'));
  });

  it('sends a signed-out visitor from a protected route to login', async () => {
    session('signed-out');
    renderApp('/admin');
    expect(await screen.findByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('exposes the signup route to a signed-out visitor', async () => {
    session('signed-out');
    renderApp('/signup');
    expect(await screen.findByRole('button', { name: /create account/i })).toBeInTheDocument();
  });

  it('keeps a signed-in user away from the login screen', async () => {
    session('active', { ...trainee, status: 'active' });
    renderApp('/login', trainee);
    await waitFor(() => expect(window.location.pathname).toBe('/trainee'));
  });
});
