import { describe, it, expect, vi, beforeEach } from 'vitest';
import { waitFor } from '@testing-library/react';
import { renderQuery } from '../test/queryHarness';

// The domain allowlist and the usage reads. The existing useAdmin test covers
// the directory and the approval queue.
//
// What the allowlist mutations invalidate is a real decision rather than a
// blanket refresh: changing the allowlist changes who lands in the approval
// queue FROM NOW ON, so the list and the audit go stale — but it never touches
// accounts that already exist, which is why the directory does not.

const mocks = vi.hoisted(() => ({
  listUsers: vi.fn(), pendingSignups: vi.fn(), platformStats: vi.fn(),
  recentAudit: vi.fn(), listAllowedDomains: vi.fn(), addAllowedDomain: vi.fn(),
  removeAllowedDomain: vi.fn(), setUserRole: vi.fn(), reviewSignup: vi.fn(),
  suspendUser: vi.fn(),
  usageSummary: vi.fn(), dailyActiveUsers: vi.fn(),
}));
vi.mock('../api/admin', () => ({
  listUsers: mocks.listUsers, pendingSignups: mocks.pendingSignups,
  platformStats: mocks.platformStats, recentAudit: mocks.recentAudit,
  listAllowedDomains: mocks.listAllowedDomains,
  addAllowedDomain: mocks.addAllowedDomain,
  removeAllowedDomain: mocks.removeAllowedDomain,
}));
vi.mock('../api/profiles', () => ({
  setUserRole: mocks.setUserRole, reviewSignup: mocks.reviewSignup,
  suspendUser: mocks.suspendUser,
}));
vi.mock('../api/activity', () => ({
  usageSummary: mocks.usageSummary, dailyActiveUsers: mocks.dailyActiveUsers,
}));

const {
  useAllowedDomains, useAddAllowedDomain, useRemoveAllowedDomain,
  useUsageSummary, useDailyActiveUsers, adminKeys,
} = await import('./useAdmin');

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listAllowedDomains.mockResolvedValue(['example.com']);
  mocks.addAllowedDomain.mockResolvedValue({});
  mocks.removeAllowedDomain.mockResolvedValue({});
  mocks.usageSummary.mockResolvedValue([]);
  mocks.dailyActiveUsers.mockResolvedValue([]);
});

const keysOf = (client) => {
  const spy = vi.spyOn(client, 'invalidateQueries');
  return () => spy.mock.calls.map((c) => JSON.stringify(c[0].queryKey));
};

describe('the allowlist', () => {
  it('reads the domains', async () => {
    const { result } = renderQuery(() => useAllowedDomains());
    await waitFor(() => expect(result.current.data).toEqual(['example.com']));
  });

  it('adds a domain', async () => {
    const { result } = renderQuery(() => useAddAllowedDomain());
    result.current.mutate({ domain: 'acme.test' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mocks.addAllowedDomain).toHaveBeenCalledWith('acme.test');
  });

  it('removes a domain', async () => {
    const { result } = renderQuery(() => useRemoveAllowedDomain());
    result.current.mutate({ domain: 'acme.test' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mocks.removeAllowedDomain).toHaveBeenCalledWith('acme.test');
  });

  it('refreshes the list and the audit trail', async () => {
    const { result, client } = renderQuery(() => useAddAllowedDomain());
    const keys = keysOf(client);

    result.current.mutate({ domain: 'acme.test' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(keys()).toContain(JSON.stringify(adminKeys.allowedDomains));
    expect(keys()).toContain(JSON.stringify(adminKeys.audit));
  });

  /**
   * The allowlist decides who skips approval from now on. It cannot change an
   * account that already exists, so refreshing the directory would be a query
   * that can only return what it already had.
   */
  it('leaves the user directory alone', async () => {
    const { result, client } = renderQuery(() => useRemoveAllowedDomain());
    const keys = keysOf(client);

    result.current.mutate({ domain: 'acme.test' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(keys()).not.toContain(JSON.stringify(adminKeys.users));
    expect(keys()).toHaveLength(2);
  });

  it('refreshes nothing when the write is refused', async () => {
    mocks.addAllowedDomain.mockRejectedValue(new Error('not an admin'));
    const { result, client } = renderQuery(() => useAddAllowedDomain());
    const spy = vi.spyOn(client, 'invalidateQueries');

    result.current.mutate({ domain: 'acme.test' });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('usage', () => {
  it('reads the summary', async () => {
    mocks.usageSummary.mockResolvedValue([{ userId: 'u1' }]);
    const { result } = renderQuery(() => useUsageSummary());
    await waitFor(() => expect(result.current.data).toHaveLength(1));
  });

  it('reads the default window of daily actives', async () => {
    const { result } = renderQuery(() => useDailyActiveUsers());
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mocks.dailyActiveUsers).toHaveBeenCalledWith(30);
  });

  it('takes a caller window', async () => {
    const { result } = renderQuery(() => useDailyActiveUsers(7));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mocks.dailyActiveUsers).toHaveBeenCalledWith(7);
  });

  /** Two windows are two different series and must not share a cache. */
  it('keys the series by its window', async () => {
    const { result, client } = renderQuery(() => useDailyActiveUsers(7));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(client.getQueryCache().find({ queryKey: ['admin', 'dau', 7] })).toBeTruthy();
    expect(client.getQueryCache().find({ queryKey: ['admin', 'dau', 30] })).toBeFalsy();
  });
});
