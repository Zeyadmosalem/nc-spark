import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mocks = vi.hoisted(() => ({
  useUsers: vi.fn(), usePendingSignups: vi.fn(),
  setRole: vi.fn(), review: vi.fn(), suspend: vi.fn(),
  useSession: vi.fn(),
  // Mutation state the tests can move, so a rejected mutation can be rendered
  // rather than only asserted on the call.
  state: { suspend: { isPending: false, error: null } },
}));

const idle = (mutate) => ({ mutate, isPending: false, error: null });

vi.mock('../../hooks/useAdmin', () => ({
  useUsers: mocks.useUsers,
  usePendingSignups: mocks.usePendingSignups,
  useSetUserRole: () => idle(mocks.setRole),
  useReviewSignup: () => idle(mocks.review),
  useSuspendUser: () => ({ mutate: mocks.suspend, ...mocks.state.suspend }),
}));
vi.mock('../../hooks/useSession', () => ({ useSession: mocks.useSession }));

const UserManager = (await import('./UserManager')).default;

const user = (over) => ({
  id: 'u1', role: 'trainee', status: 'active', name: 'Ada Lovelace',
  email: 'ada@x.io', avatar: 'A', createdAt: '2026-01-01T00:00:00Z', ...over,
});

const query = (data, over) => ({ data, isLoading: false, error: null, ...over });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.useSession.mockReturnValue({ profile: { id: 'me', role: 'admin' } });
  mocks.useUsers.mockReturnValue(query([]));
  mocks.usePendingSignups.mockReturnValue(query([]));
  mocks.state.suspend = { isPending: false, error: null };
});

describe('the approval queue', () => {
  it('shows how long somebody has been waiting', () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString();
    mocks.usePendingSignups.mockReturnValue(query([
      user({ id: 'p1', status: 'pending', name: 'Grace', createdAt: threeDaysAgo }),
    ]));
    render(<UserManager />);
    expect(screen.getByText(/waiting 3 days/)).toBeInTheDocument();
  });

  it('approves with the role the admin picked, not the default', async () => {
    mocks.usePendingSignups.mockReturnValue(query([user({ id: 'p1', status: 'pending' })]));
    render(<UserManager />);
    await userEvent.selectOptions(screen.getByLabelText('Join as'), 'trainer');
    await userEvent.click(screen.getByRole('button', { name: 'Approve' }));
    expect(mocks.review).toHaveBeenCalledWith({
      userId: 'p1', decision: 'approve', role: 'trainer',
    });
  });

  /**
   * Rejection cannot be undone — admin-review-signup refuses anyone who is not
   * pending, so a mis-click permanently locks a real trainee out. One click
   * must not be enough.
   */
  it('does not reject on the first click', async () => {
    mocks.usePendingSignups.mockReturnValue(query([user({ id: 'p1', status: 'pending' })]));
    render(<UserManager />);
    await userEvent.click(screen.getByRole('button', { name: 'Reject' }));
    expect(mocks.review).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Confirm reject' }));
    expect(mocks.review).toHaveBeenCalledWith({ userId: 'p1', decision: 'reject' });
  });

  it('says so plainly when nobody is waiting', () => {
    render(<UserManager />);
    expect(screen.getByText(/Nobody is waiting/)).toBeInTheDocument();
  });
});

describe('the directory', () => {
  it('filters by tab', async () => {
    mocks.useUsers.mockReturnValue(query([
      user({ id: 'u1', name: 'Ada', role: 'trainee' }),
      user({ id: 'u2', name: 'Brendan', role: 'trainer' }),
    ]));
    render(<UserManager />);
    expect(screen.getByText('Ada')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Trainers \(1\)/ }));
    expect(screen.queryByText('Ada')).not.toBeInTheDocument();
    expect(screen.getByText('Brendan')).toBeInTheDocument();
  });

  it('searches on email as well as name', async () => {
    mocks.useUsers.mockReturnValue(query([
      user({ id: 'u1', name: 'Ada', email: 'ada@x.io' }),
      user({ id: 'u2', name: 'Brendan', email: 'bren@y.io' }),
    ]));
    render(<UserManager />);
    await userEvent.type(screen.getByLabelText(/Search users/), 'bren@');
    expect(screen.queryByText('Ada')).not.toBeInTheDocument();
    expect(screen.getByText('Brendan')).toBeInTheDocument();
  });

  it('changes a role through the Edge Function', async () => {
    mocks.useUsers.mockReturnValue(query([user({ id: 'u1', name: 'Ada' })]));
    render(<UserManager />);
    await userEvent.selectOptions(screen.getByLabelText('Role for Ada'), 'supervisor');
    expect(mocks.setRole).toHaveBeenCalledWith({ userId: 'u1', role: 'supervisor' });
  });

  it('suspends, then offers to reinstate', async () => {
    mocks.useUsers.mockReturnValue(query([user({ id: 'u1' })]));
    const { rerender } = render(<UserManager />);
    await userEvent.click(screen.getByRole('button', { name: 'Suspend' }));
    expect(mocks.suspend).toHaveBeenCalledWith({ userId: 'u1', suspend: true });

    mocks.useUsers.mockReturnValue(query([user({ id: 'u1', status: 'suspended' })]));
    rerender(<UserManager />);
    await userEvent.click(screen.getByRole('button', { name: 'Reinstate' }));
    expect(mocks.suspend).toHaveBeenLastCalledWith({ userId: 'u1', suspend: false });
  });

  /**
   * The server refuses only the LAST active admin. An admin demoting or
   * suspending themselves while colleagues remain is allowed server-side and
   * is never intended — they lose the console mid-session with no way back.
   */
  it('will not let an admin act on their own row', () => {
    mocks.useUsers.mockReturnValue(query([
      user({ id: 'me', name: 'Me', role: 'admin' }),
      user({ id: 'u1', name: 'Ada' }),
    ]));
    render(<UserManager />);
    expect(screen.getByLabelText('Role for Me')).toBeDisabled();
    // Ada is somebody else, so her row keeps its button; mine is the one gone.
    const adasRow = screen.getByText('Ada').closest('.card');
    expect(within(adasRow).getByRole('button', { name: 'Suspend' })).toBeEnabled();
    expect(screen.getAllByRole('button', { name: 'Suspend' })).toHaveLength(1);
  });
});

describe('failures', () => {
  it('shows a load failure instead of an empty directory', () => {
    mocks.useUsers.mockReturnValue(
      query(undefined, { error: new Error('permission denied') }));
    render(<UserManager />);
    expect(screen.getByRole('alert')).toHaveTextContent(/Could not load the user directory/);
  });

  /**
   * The 409 from the last-admin guard is the one refusal an admin will
   * actually hit, and it is the whole reason the guard is worth having. If it
   * renders as nothing, the button just looks broken.
   */
  it('renders the last-admin refusal next to the row that caused it', () => {
    mocks.useUsers.mockReturnValue(query([user({ id: 'u1', name: 'Ada', role: 'admin' })]));
    mocks.state.suspend = {
      isPending: false, error: new Error('Cannot suspend the last active admin'),
    };
    render(<UserManager />);
    const adasRow = screen.getByText('Ada').closest('.card');
    expect(within(adasRow).getByRole('alert'))
      .toHaveTextContent('Cannot suspend the last active admin');
  });

  it('disables the row while a suspension is in flight', () => {
    mocks.useUsers.mockReturnValue(query([user({ id: 'u1', name: 'Ada' })]));
    mocks.state.suspend = { isPending: true, error: null };
    render(<UserManager />);
    expect(screen.getByRole('button', { name: 'Working...' })).toBeDisabled();
    expect(screen.getByLabelText('Role for Ada')).toBeDisabled();
  });
});
