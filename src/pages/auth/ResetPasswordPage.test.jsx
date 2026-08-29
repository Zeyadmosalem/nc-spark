import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import ResetPasswordPage from './ResetPasswordPage';

// The interesting property here is what the page REFUSES to tell you. "No
// account with that email" is how somebody enumerates who has one, so the
// confirmation has to read the same whether the address exists or not — and
// that is a thing only a test will hold in place, because both paths look
// identical on screen by design.

vi.mock('../../api/auth', () => ({ resetPassword: vi.fn() }));
const { resetPassword } = await import('../../api/auth');

const setup = () => {
  const user = userEvent.setup();
  render(<MemoryRouter><ResetPasswordPage /></MemoryRouter>);
  return user;
};

beforeEach(() => {
  resetPassword.mockReset();
  resetPassword.mockResolvedValue(undefined);
});

describe('asking for a link', () => {
  it('asks for an email and nothing else', () => {
    setup();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send reset link/i })).toBeInTheDocument();
  });

  it('sends the address that was typed', async () => {
    const user = setup();

    await user.type(screen.getByLabelText('Email'), 'sam@example.com');
    await user.click(screen.getByRole('button', { name: /send reset link/i }));

    expect(resetPassword).toHaveBeenCalledWith('sam@example.com');
  });

  it('offers a way back to sign in', () => {
    setup();
    expect(screen.getByRole('link', { name: /back to sign in/i })).toBeInTheDocument();
  });
});

describe('what it says afterwards', () => {
  /**
   * The whole point. Both of these must produce the same words, or the page
   * becomes a way to ask "does this person have an account here".
   */
  it('confirms without saying whether the account exists', async () => {
    const user = setup();

    await user.type(screen.getByLabelText('Email'), 'someone@example.com');
    await user.click(screen.getByRole('button', { name: /send reset link/i }));

    const message = await screen.findByText(/if that address has an account/i);
    expect(message).toBeInTheDocument();
    expect(screen.queryByText(/no account|not found|does not exist/i)).not.toBeInTheDocument();
  });

  it('says the same thing for an address that has no account', async () => {
    const user = setup();

    await user.type(screen.getByLabelText('Email'), 'nobody@example.com');
    await user.click(screen.getByRole('button', { name: /send reset link/i }));

    expect(await screen.findByText(/if that address has an account/i)).toBeInTheDocument();
  });

  it('says the link expires and that nothing has changed yet', async () => {
    const user = setup();

    await user.type(screen.getByLabelText('Email'), 'sam@example.com');
    await user.click(screen.getByRole('button', { name: /send reset link/i }));

    expect(await screen.findByText(/expires after an hour/i)).toBeInTheDocument();
    expect(screen.getByText(/nothing changes about your current/i)).toBeInTheDocument();
  });

  it('replaces the form, so the request cannot be fired twice by habit', async () => {
    const user = setup();

    await user.type(screen.getByLabelText('Email'), 'sam@example.com');
    await user.click(screen.getByRole('button', { name: /send reset link/i }));

    await screen.findByText(/if that address has an account/i);
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument();
  });
});

describe('when the request fails', () => {
  /** A transport failure is not a secret, and hiding it strands the user. */
  it('shows the failure and keeps the form', async () => {
    resetPassword.mockRejectedValue(new Error('Network unreachable'));
    const user = setup();

    await user.type(screen.getByLabelText('Email'), 'sam@example.com');
    await user.click(screen.getByRole('button', { name: /send reset link/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Network unreachable');
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
  });

  it('lets the request be tried again', async () => {
    resetPassword.mockRejectedValueOnce(new Error('Network unreachable'));
    const user = setup();

    await user.type(screen.getByLabelText('Email'), 'sam@example.com');
    await user.click(screen.getByRole('button', { name: /send reset link/i }));
    await screen.findByRole('alert');

    await user.click(screen.getByRole('button', { name: /send reset link/i }));

    expect(await screen.findByText(/if that address has an account/i)).toBeInTheDocument();
    expect(resetPassword).toHaveBeenCalledTimes(2);
  });
});
