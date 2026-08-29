import { describe, it, expect, vi, beforeEach } from 'vitest';
import { waitFor } from '@testing-library/react';
import { renderQuery } from '../test/queryHarness';

// The grant behind this names two columns exactly — `update (name, avatar)` —
// so role and status are not writable here. That is why the account page can
// show them without offering to change them, and why the mutation is written
// to send those two fields and nothing else.
//
// The profile does not live in the query cache: useSession holds it, and the
// sidebar keeps its own copy. So success calls profileChanged rather than
// invalidating a query, and that is easy to lose in a refactor.

const mocks = vi.hoisted(() => ({
  updateMyProfile: vi.fn(), changePassword: vi.fn(), profileChanged: vi.fn(),
}));
vi.mock('../api/profiles', () => ({ updateMyProfile: mocks.updateMyProfile }));
vi.mock('../api/auth', () => ({ changePassword: mocks.changePassword }));
vi.mock('./useSession', () => ({ profileChanged: mocks.profileChanged }));

const { useUpdateMyProfile, useChangePassword } = await import('./useAccount');

beforeEach(() => {
  vi.clearAllMocks();
  mocks.updateMyProfile.mockResolvedValue({ id: 'me', name: 'New Name' });
  mocks.changePassword.mockResolvedValue({});
});

describe('changing your own details', () => {
  it('sends the name and the badge', async () => {
    const { result } = renderQuery(() => useUpdateMyProfile());

    result.current.mutate({ name: 'Sam Reed', avatar: 'SR' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mocks.updateMyProfile).toHaveBeenCalledWith({ name: 'Sam Reed', avatar: 'SR' });
  });

  /** The grant covers name and avatar only; anything else would be refused. */
  it('sends nothing else, whatever the caller passes', async () => {
    const { result } = renderQuery(() => useUpdateMyProfile());

    result.current.mutate({ name: 'Sam', avatar: 'S', role: 'admin', status: 'active' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mocks.updateMyProfile).toHaveBeenCalledWith({ name: 'Sam', avatar: 'S' });
  });

  /**
   * Not a query invalidation: the profile lives in useSession's local state,
   * so the sidebar would keep the old name until a reload without this.
   */
  it('tells the session the profile changed', async () => {
    const { result } = renderQuery(() => useUpdateMyProfile());

    result.current.mutate({ name: 'Sam', avatar: 'S' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mocks.profileChanged).toHaveBeenCalled();
  });

  it('does not touch the session when the update is refused', async () => {
    mocks.updateMyProfile.mockRejectedValue(new Error('refused'));
    const { result } = renderQuery(() => useUpdateMyProfile());

    result.current.mutate({ name: 'Sam', avatar: 'S' });
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(mocks.profileChanged).not.toHaveBeenCalled();
  });
});

describe('changing your password', () => {
  it('passes the password through', async () => {
    const { result } = renderQuery(() => useChangePassword());

    result.current.mutate({ password: 'correct-horse-battery' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mocks.changePassword).toHaveBeenCalledWith('correct-horse-battery');
  });

  it('surfaces a refusal rather than reporting success', async () => {
    mocks.changePassword.mockRejectedValue(new Error('Password is too short'));
    const { result } = renderQuery(() => useChangePassword());

    result.current.mutate({ password: 'short' });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error.message).toBe('Password is too short');
  });
});
