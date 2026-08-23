import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mocks = vi.hoisted(() => ({
  listUsers: vi.fn(), pendingSignups: vi.fn(), platformStats: vi.fn(), recentAudit: vi.fn(),
  setUserRole: vi.fn(), reviewSignup: vi.fn(), suspendUser: vi.fn(),
  pendingTeachingRequests: vi.fn(), decideTeachingRequest: vi.fn(),
}));
vi.mock('../api/admin', () => ({
  listUsers: mocks.listUsers, pendingSignups: mocks.pendingSignups,
  platformStats: mocks.platformStats, recentAudit: mocks.recentAudit,
}));
vi.mock('../api/teaching', () => ({
  pendingTeachingRequests: mocks.pendingTeachingRequests,
  decideTeachingRequest: mocks.decideTeachingRequest,
}));
vi.mock('../api/profiles', () => ({
  setUserRole: mocks.setUserRole, reviewSignup: mocks.reviewSignup,
  suspendUser: mocks.suspendUser,
}));

const {
  useUsers, usePendingSignups, usePlatformStats, useRecentAudit,
  useSetUserRole, useReviewSignup, useSuspendUser, adminKeys,
  useTeachingRequests, useDecideTeachingRequest,
} = await import('./useAdmin');

let client;
function wrapper({ children }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

describe('queries', () => {
  it('useUsers returns the directory', async () => {
    mocks.listUsers.mockResolvedValue([{ id: 'u1', name: 'Ada' }]);
    const { result } = renderHook(() => useUsers(), { wrapper });
    await waitFor(() => expect(result.current.data?.[0]?.name).toBe('Ada'));
  });

  it('usePendingSignups returns the queue', async () => {
    mocks.pendingSignups.mockResolvedValue([{ id: 'u2', status: 'pending' }]);
    const { result } = renderHook(() => usePendingSignups(), { wrapper });
    await waitFor(() => expect(result.current.data).toHaveLength(1));
  });

  it('usePlatformStats returns counts', async () => {
    mocks.platformStats.mockResolvedValue({ courses: { total: 3, published: 2 } });
    const { result } = renderHook(() => usePlatformStats(), { wrapper });
    await waitFor(() => expect(result.current.data?.courses.total).toBe(3));
  });

  it('useRecentAudit passes its limit through', async () => {
    mocks.recentAudit.mockResolvedValue([]);
    renderHook(() => useRecentAudit(5), { wrapper });
    await waitFor(() => expect(mocks.recentAudit).toHaveBeenCalledWith(5));
  });

  it('surfaces a refusal rather than rendering an empty directory', async () => {
    mocks.listUsers.mockRejectedValue(new Error('permission denied'));
    const { result } = renderHook(() => useUsers(), { wrapper });
    await waitFor(() => expect(result.current.error?.message).toMatch(/permission denied/));
  });
});

describe('mutations', () => {
  /**
   * TanStack calls mutationFn with (variables, context). An api function taking
   * positional arguments would receive a QueryClient as its second one and post
   * it in the request body. Every mutation here must unpack a single object.
   */
  it('useSetUserRole sends only userId and role', async () => {
    mocks.setUserRole.mockResolvedValue({ ok: true });
    const { result } = renderHook(() => useSetUserRole(), { wrapper });
    result.current.mutate({ userId: 'u1', role: 'trainer' });
    await waitFor(() => expect(mocks.setUserRole).toHaveBeenCalledWith('u1', 'trainer'));
    expect(mocks.setUserRole.mock.calls[0]).toHaveLength(2);
  });

  it('useReviewSignup sends the decision and role', async () => {
    mocks.reviewSignup.mockResolvedValue({ ok: true });
    const { result } = renderHook(() => useReviewSignup(), { wrapper });
    result.current.mutate({ userId: 'u2', decision: 'approve', role: 'trainee' });
    await waitFor(() =>
      expect(mocks.reviewSignup).toHaveBeenCalledWith('u2', 'approve', 'trainee'));
    expect(mocks.reviewSignup.mock.calls[0]).toHaveLength(3);
  });

  it('useSuspendUser sends the boolean', async () => {
    mocks.suspendUser.mockResolvedValue({ ok: true });
    const { result } = renderHook(() => useSuspendUser(), { wrapper });
    result.current.mutate({ userId: 'u3', suspend: true });
    await waitFor(() => expect(mocks.suspendUser).toHaveBeenCalledWith('u3', true));
    expect(mocks.suspendUser.mock.calls[0]).toHaveLength(2);
  });

  it('surfaces the last-admin refusal instead of swallowing it', async () => {
    mocks.suspendUser.mockRejectedValue(new Error('Cannot suspend the last active admin'));
    const { result } = renderHook(() => useSuspendUser(), { wrapper });
    result.current.mutate({ userId: 'u3', suspend: true });
    await waitFor(() => expect(result.current.error?.message).toMatch(/last active admin/));
  });

  // Approving somebody moves them out of the queue AND into the directory, and
  // writes an audit row. A stale list here means an admin approves twice.
  it.each([
    ['useSetUserRole',  () => useSetUserRole(),  { userId: 'u1', role: 'trainer' }, 'setUserRole'],
    ['useReviewSignup', () => useReviewSignup(), { userId: 'u1', decision: 'approve' }, 'reviewSignup'],
    ['useSuspendUser',  () => useSuspendUser(),  { userId: 'u1', suspend: true }, 'suspendUser'],
  ])('%s refreshes the directory, the queue and the audit trail', async (_n, hook, vars, fn) => {
    mocks[fn].mockResolvedValue({ ok: true });
    const spy = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(hook, { wrapper });
    result.current.mutate(vars);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const keys = spy.mock.calls.map((c) => JSON.stringify(c[0].queryKey));
    expect(keys).toContain(JSON.stringify(adminKeys.users));
    expect(keys).toContain(JSON.stringify(adminKeys.pendingSignups));
    expect(keys).toContain(JSON.stringify(adminKeys.audit));
  });
});

describe('teaching requests', () => {
  it('returns the queue', async () => {
    mocks.pendingTeachingRequests.mockResolvedValue([{ id: 'r1', courseTitle: 'Fire Safety' }]);
    const { result } = renderHook(() => useTeachingRequests(), { wrapper });
    await waitFor(() => expect(result.current.data?.[0]?.courseTitle).toBe('Fire Safety'));
  });

  it('sends the request id and decision', async () => {
    mocks.decideTeachingRequest.mockResolvedValue({ ok: true });
    const { result } = renderHook(() => useDecideTeachingRequest(), { wrapper });
    result.current.mutate({ requestId: 'r1', decision: 'approve' });
    await waitFor(() =>
      expect(mocks.decideTeachingRequest).toHaveBeenCalledWith('r1', 'approve'));
    expect(mocks.decideTeachingRequest.mock.calls[0]).toHaveLength(2);
  });

  /**
   * Approving sets courses.trainer_id. Leaving the course list cached means the
   * Curriculum page still says "no trainer" for a course that now has one, and
   * still offers the request that was just approved.
   */
  it('refreshes the queue and the course list together', async () => {
    mocks.decideTeachingRequest.mockResolvedValue({ ok: true });
    const spy = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useDecideTeachingRequest(), { wrapper });
    result.current.mutate({ requestId: 'r1', decision: 'approve' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const keys = spy.mock.calls.map((c) => JSON.stringify(c[0].queryKey));
    expect(keys).toContain(JSON.stringify(adminKeys.teachingRequests));
    expect(keys).toContain(JSON.stringify(['courses']));
  });
});
