import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthChange: vi.fn(() => () => {}),
  fetchMyProfile: vi.fn(),
}));

vi.mock('../api/auth', () => ({ getSession: mocks.getSession, onAuthChange: mocks.onAuthChange }));
vi.mock('../api/profiles', () => ({ fetchMyProfile: mocks.fetchMyProfile }));

const { useSession } = await import('./useSession');

beforeEach(() => vi.clearAllMocks());

describe('useSession', () => {
  it('reports signed-out when there is no session', async () => {
    mocks.getSession.mockResolvedValue(null);
    const { result } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.status).toBe('signed-out'));
    expect(result.current.profile).toBeNull();
  });

  it('reports active for an active profile', async () => {
    mocks.getSession.mockResolvedValue({ user: { id: 'u1' } });
    mocks.fetchMyProfile.mockResolvedValue({ id: 'u1', role: 'trainee', status: 'active' });
    const { result } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.status).toBe('active'));
    expect(result.current.profile.role).toBe('trainee');
  });

  it('reports pending for a profile awaiting approval', async () => {
    mocks.getSession.mockResolvedValue({ user: { id: 'u1' } });
    mocks.fetchMyProfile.mockResolvedValue({ id: 'u1', role: 'trainee', status: 'pending' });
    const { result } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.status).toBe('pending'));
  });

  it('reports suspended for a suspended profile', async () => {
    mocks.getSession.mockResolvedValue({ user: { id: 'u1' } });
    mocks.fetchMyProfile.mockResolvedValue({ id: 'u1', role: 'trainee', status: 'suspended' });
    const { result } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.status).toBe('suspended'));
  });

  // Without a catch on the session lookup the effect never settles, so the app
  // sits on "Loading…" forever rather than showing a login page.
  it('falls back to signed-out when the session lookup rejects', async () => {
    mocks.getSession.mockRejectedValue(new Error('Supabase is not configured'));
    const { result } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.status).toBe('signed-out'));
  });

  it('subscribes to auth changes and unsubscribes on unmount', async () => {
    const unsub = vi.fn();
    mocks.onAuthChange.mockReturnValue(unsub);
    mocks.getSession.mockResolvedValue(null);
    const { unmount } = renderHook(() => useSession());
    await waitFor(() => expect(mocks.onAuthChange).toHaveBeenCalled());
    unmount();
    expect(unsub).toHaveBeenCalled();
  });
});
