import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const mocks = vi.hoisted(() => ({ signIn: vi.fn(), resetPassword: vi.fn() }));
vi.mock('../../api/auth', () => ({ signIn: mocks.signIn, resetPassword: mocks.resetPassword }));

const { default: LoginPage } = await import('./LoginPage');

const renderPage = () => render(<MemoryRouter><LoginPage /></MemoryRouter>);
beforeEach(() => vi.clearAllMocks());

describe('LoginPage', () => {
  it('renders email and password fields, not a role picker', () => {
    renderPage();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
    expect(screen.queryByText(/Enter as Admin/i)).not.toBeInTheDocument();
  });

  it('submits the credentials', async () => {
    mocks.signIn.mockResolvedValue({ user: { id: 'u1' } });
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText(/email/i), 'amira@example.com');
    await user.type(screen.getByLabelText(/^password$/i), 'secret123');
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    expect(mocks.signIn).toHaveBeenCalledWith('amira@example.com', 'secret123');
  });

  it('shows the server error message on failure', async () => {
    mocks.signIn.mockRejectedValue(new Error('Invalid login credentials'));
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText(/email/i), 'a@b.com');
    await user.type(screen.getByLabelText(/^password$/i), 'wrong');
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Invalid login credentials/);
  });

  it('disables the button while submitting', async () => {
    let resolve;
    mocks.signIn.mockReturnValue(new Promise((r) => { resolve = r; }));
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText(/email/i), 'a@b.com');
    await user.type(screen.getByLabelText(/^password$/i), 'pw');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    // The label deliberately does not change to "Signing in…" — swapping it
    // resizes the button under the cursor mid-click. The button reports the
    // wait through aria-busy and refuses a second submit.
    const button = screen.getByRole('button', { name: /sign in/i });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    resolve({ user: {} });
  });

  it('does not submit with an empty password', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText(/email/i), 'a@b.com');
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    expect(mocks.signIn).not.toHaveBeenCalled();
  });

  it('lets you check what you typed before submitting', async () => {
    const user = userEvent.setup();
    renderPage();
    const password = screen.getByLabelText(/^password$/i);
    await user.type(password, 'Rv-y0ke');
    expect(password).toHaveAttribute('type', 'password');
    await user.click(screen.getByRole('button', { name: 'Show password' }));
    expect(password).toHaveAttribute('type', 'text');
  });
});
