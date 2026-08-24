import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mocks = vi.hoisted(() => ({
  useSession: vi.fn(),
  updateProfile: vi.fn(), changePassword: vi.fn(),
  state: { profile: {}, password: {} },
}));

const asMutation = (spy, extra = {}) => ({
  mutate: spy, isPending: false, error: null, ...extra,
});

vi.mock('../../hooks/useSession', () => ({ useSession: mocks.useSession }));
vi.mock('../../hooks/useAccount', () => ({
  useUpdateMyProfile: () => asMutation(mocks.updateProfile, mocks.state.profile),
  useChangePassword: () => asMutation(mocks.changePassword, mocks.state.password),
}));
vi.mock('../../components/ui/toast-context', () => ({
  useToast: () => ({ notify: vi.fn() }),
}));

const AccountPage = (await import('./AccountPage')).default;

const PROFILE = {
  id: 'u1', role: 'trainee', status: 'active',
  name: 'Aisha Rahman', email: 'aisha@example.com', avatar: 'AR',
  createdAt: '2026-02-01T00:00:00Z',
};

const varsOf = (spy) => spy.mock.calls.at(-1)?.[0];

const show = (profile = PROFILE, session = null) => {
  mocks.useSession.mockReturnValue({ profile, session, status: 'active', isLoading: false });
  return render(<AccountPage />);
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.state = { profile: {}, password: {} };
});

describe('the identity form', () => {
  it('opens with what is stored', () => {
    show();
    expect(screen.getByLabelText('Display name')).toHaveValue('Aisha Rahman');
    expect(screen.getByLabelText('Badge')).toHaveValue('AR');
  });

  it('will not save until something changed', () => {
    show();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  });

  it('saves a new name', async () => {
    show();
    await userEvent.clear(screen.getByLabelText('Display name'));
    await userEvent.type(screen.getByLabelText('Display name'), 'Aisha R');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(varsOf(mocks.updateProfile)).toEqual({ name: 'Aisha R', avatar: 'AR' });
  });

  /**
   * profiles.name is `not null default ''`, so a blank one stores happily and
   * then reads as an empty row in every roster and review queue.
   */
  it('refuses a blank name, and says why it matters', async () => {
    show();
    await userEvent.clear(screen.getByLabelText('Display name'));
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    expect(screen.getByText(/cannot be blank/)).toBeInTheDocument();
  });

  /** An empty badge is "no badge", not the empty string. */
  it('sends null rather than an empty badge', async () => {
    show();
    await userEvent.clear(screen.getByLabelText('Badge'));
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(varsOf(mocks.updateProfile).avatar).toBeNull();
  });

  it('previews the badge before it is saved', async () => {
    show();
    await userEvent.clear(screen.getByLabelText('Badge'));
    await userEvent.type(screen.getByLabelText('Badge'), '🔥');
    expect(screen.getByText('Preview').previousSibling).toHaveTextContent('🔥');
  });

  it('falls back to the first letter of the name when there is no badge', () => {
    show({ ...PROFILE, avatar: null });
    expect(screen.getByText('Preview').previousSibling).toHaveTextContent('A');
  });

  it('surfaces a rejected save', () => {
    mocks.state.profile = { error: new Error('permission denied for table profiles') };
    show();
    expect(screen.getByRole('alert')).toHaveTextContent(/permission denied/);
  });
});

describe('what the page shows but cannot change', () => {
  /**
   * The column grant is `update (name, avatar)`. Offering to change anything
   * else would be a field that silently fails, so each of these says who does
   * change it instead.
   */
  it('shows the email as read-only, and who changes it', () => {
    show();
    expect(screen.getByText('aisha@example.com')).toBeInTheDocument();
    expect(screen.queryByLabelText(/email/i)).not.toBeInTheDocument();
    expect(screen.getByText(/An administrator changes this/)).toBeInTheDocument();
  });

  it('explains what the role means rather than just naming it', () => {
    show();
    expect(screen.getByText('trainee')).toBeInTheDocument();
    expect(screen.getByText(/your progress is recorded/)).toBeInTheDocument();
  });

  it.each([
    ['trainer', /own courses/],
    ['supervisor', /cohort figures/],
    ['admin', /approve signups/],
  ])('describes the %s role', (role, description) => {
    show({ ...PROFILE, role });
    expect(screen.getByText(description)).toBeInTheDocument();
  });

  it('does not offer a role or status control', () => {
    show();
    expect(screen.queryByLabelText(/role/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/status/i)).not.toBeInTheDocument();
  });
});

describe('changing the password', () => {
  const type = async (a, b) => {
    await userEvent.type(screen.getByLabelText('New password'), a);
    await userEvent.type(screen.getByLabelText('Confirm it'), b);
  };

  it('will not submit an empty form', () => {
    show();
    expect(screen.getByRole('button', { name: 'Change password' })).toBeDisabled();
  });

  it('refuses a mismatch, and says so', async () => {
    show();
    await type('correct-horse', 'correct-hors');
    expect(screen.getByText('The two passwords do not match.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Change password' })).toBeDisabled();
  });

  it('states the minimum length before it is hit', async () => {
    show();
    await userEvent.type(screen.getByLabelText('New password'), 'abc');
    expect(screen.getByText('Use at least 6 characters.')).toBeInTheDocument();
  });

  it('sends a matching pair', async () => {
    show();
    await type('correct-horse', 'correct-horse');
    await userEvent.click(screen.getByRole('button', { name: 'Change password' }));
    expect(varsOf(mocks.changePassword)).toEqual({ password: 'correct-horse' });
  });

  /**
   * Changing a password does not sign other sessions out — Supabase keeps them
   * until their refresh token expires. Somebody changing it because they think
   * the account is compromised has to be told that.
   */
  it('says what a password change does not do', async () => {
    mocks.changePassword.mockImplementation((_vars, opts) => opts?.onSuccess?.());
    show();
    await type('correct-horse', 'correct-horse');
    expect(screen.queryByText(/stays signed in/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Change password' }));
    expect(screen.getByText(/stays signed in/)).toBeInTheDocument();
    expect(screen.getByText(/suspend the account/)).toBeInTheDocument();
  });

  it('clears the fields once it succeeds', async () => {
    mocks.changePassword.mockImplementation((_vars, opts) => opts?.onSuccess?.());
    show();
    await type('correct-horse', 'correct-horse');
    await userEvent.click(screen.getByRole('button', { name: 'Change password' }));
    expect(screen.getByLabelText('New password')).toHaveValue('');
    expect(screen.getByLabelText('Confirm it')).toHaveValue('');
  });

  it('surfaces what the server refused', () => {
    mocks.state.password = { error: new Error('New password should be different') };
    show();
    expect(screen.getByRole('alert')).toHaveTextContent(/should be different/);
  });
});

describe('before the profile arrives', () => {
  it('shows a loader rather than an empty form', () => {
    show(null);
    expect(screen.queryByLabelText('Display name')).not.toBeInTheDocument();
    expect(screen.getByText(/Loading your account/)).toBeInTheDocument();
  });
});
