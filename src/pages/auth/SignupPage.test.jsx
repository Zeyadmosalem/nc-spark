import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import SignupPage from './SignupPage';

// The route is still mounted although public signup is closed at the project
// level (audit S2), so re-opening it is one setting and one link. That makes
// these worth keeping rather than deleting with the link: they are what says
// the page still behaves when it is switched back on.
//
// The interesting behaviour is the waiting it warns about up front. Somebody
// who confirms their email and is only then told to wait, with no warning that
// a wait was coming, reads it as a failure.

vi.mock('../../api/auth', () => ({ signUp: vi.fn() }));
const { signUp } = await import('../../api/auth');

const show = () => {
  const user = userEvent.setup();
  render(<MemoryRouter><SignupPage /></MemoryRouter>);
  return user;
};

const fillIn = async (user, { name = 'Sam Reed', email = 'sam@example.com', password = 'longenough1' } = {}) => {
  await user.type(screen.getByLabelText('Full name'), name);
  await user.type(screen.getByLabelText('Email'), email);
  await user.type(screen.getByLabelText('Password'), password);
};

beforeEach(() => {
  signUp.mockReset();
  signUp.mockResolvedValue({});
});

describe('the form', () => {
  it('asks for a name, an address and a password', () => {
    show();
    expect(screen.getByLabelText('Full name')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
  });

  /** Stated before it is broken, not only after. */
  it('states the approval rule up front', () => {
    show();
    expect(screen.getByText(/need administrator approval/i)).toBeInTheDocument();
  });

  it('states the password length rule up front', () => {
    show();
    expect(screen.getByText(/at least 8 characters/i)).toBeInTheDocument();
  });

  it('offers a way to sign in instead', () => {
    show();
    expect(screen.getByRole('link', { name: /already have an account/i })).toBeInTheDocument();
  });
});

describe('creating the account', () => {
  it('sends what was typed', async () => {
    const user = show();
    await fillIn(user);
    await user.click(screen.getByRole('button', { name: /create account/i }));

    expect(signUp).toHaveBeenCalledWith({
      name: 'Sam Reed', email: 'sam@example.com', password: 'longenough1',
    });
  });

  /**
   * Checked here as well as on the server, because there is no confirm field
   * — a short password rejected only by the server costs a round trip to say
   * something the form already knew.
   */
  it('refuses a short password without asking the server', async () => {
    const user = show();
    await fillIn(user, { password: 'short' });
    await user.click(screen.getByRole('button', { name: /create account/i }));

    expect(await screen.findByRole('alert'))
      .toHaveTextContent('Password must be at least 8 characters.');
    expect(signUp).not.toHaveBeenCalled();
  });

  it('names the address to confirm', async () => {
    const user = show();
    await fillIn(user);
    await user.click(screen.getByRole('button', { name: /create account/i }));

    expect(await screen.findByText(/sam@example\.com/)).toBeInTheDocument();
  });

  /**
   * The warning that matters. Without it, somebody confirms their email, tries
   * to sign in, is told to wait, and reads that as the signup having failed.
   */
  it('warns that an unapproved domain still waits for an administrator', async () => {
    const user = show();
    await fillIn(user);
    await user.click(screen.getByRole('button', { name: /create account/i }));

    expect(await screen.findByText(/an administrator has\s+to admit you/i)).toBeInTheDocument();
  });

  it('replaces the form, so it cannot be submitted twice by habit', async () => {
    const user = show();
    await fillIn(user);
    await user.click(screen.getByRole('button', { name: /create account/i }));

    await screen.findByText(/check your inbox/i);
    expect(screen.queryByLabelText('Full name')).not.toBeInTheDocument();
  });
});

describe('when signup is refused', () => {
  /** Which it now always is, at the project level. */
  it('shows the reason and keeps the form', async () => {
    signUp.mockRejectedValue(new Error('Signups not allowed for this instance'));
    const user = show();
    await fillIn(user);
    await user.click(screen.getByRole('button', { name: /create account/i }));

    expect(await screen.findByRole('alert'))
      .toHaveTextContent('Signups not allowed for this instance');
    expect(screen.getByLabelText('Full name')).toBeInTheDocument();
  });

  it('lets it be tried again', async () => {
    signUp.mockRejectedValueOnce(new Error('Network unreachable'));
    const user = show();
    await fillIn(user);
    await user.click(screen.getByRole('button', { name: /create account/i }));
    await screen.findByRole('alert');

    await user.click(screen.getByRole('button', { name: /create account/i }));
    expect(await screen.findByText(/check your inbox/i)).toBeInTheDocument();
  });
});
