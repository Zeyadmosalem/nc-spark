import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mocks = vi.hoisted(() => ({
  myTeachingRequests: vi.fn(), requestToTeach: vi.fn(),
}));
vi.mock('../api/teaching', () => mocks);

const { useMyTeachingRequests, useRequestToTeach, teachingKeys } =
  await import('./useTeaching');

let client;
function wrapper({ children }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

describe('useMyTeachingRequests', () => {
  it('returns the requests', async () => {
    mocks.myTeachingRequests.mockResolvedValue([{ id: 'r1', status: 'pending' }]);
    const { result } = renderHook(() => useMyTeachingRequests(), { wrapper });
    await waitFor(() => expect(result.current.data?.[0]?.status).toBe('pending'));
  });
});

describe('useRequestToTeach', () => {
  it('sends the course id alone', async () => {
    mocks.requestToTeach.mockResolvedValue({ id: 'r1' });
    const { result } = renderHook(() => useRequestToTeach(), { wrapper });
    result.current.mutate({ courseId: 'c1' });
    await waitFor(() => expect(mocks.requestToTeach).toHaveBeenCalledWith('c1'));
    expect(mocks.requestToTeach.mock.calls[0]).toHaveLength(1);
  });

  /**
   * teaching_requests_one_open is a partial unique index over pending rows.
   * Asking twice is a duplicate-key error, and the page has to be able to say
   * so rather than looking like it did nothing.
   */
  it('surfaces the duplicate-request error', async () => {
    mocks.requestToTeach.mockRejectedValue(new Error('duplicate key value violates unique constraint'));
    const { result } = renderHook(() => useRequestToTeach(), { wrapper });
    result.current.mutate({ courseId: 'c1' });
    await waitFor(() => expect(result.current.error?.message).toMatch(/duplicate key/));
  });

  // The course does not change hands until an admin approves, so only the
  // request list is stale.
  it('refreshes the request list', async () => {
    mocks.requestToTeach.mockResolvedValue({ id: 'r1' });
    const spy = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useRequestToTeach(), { wrapper });
    result.current.mutate({ courseId: 'c1' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(spy.mock.calls.map((c) => JSON.stringify(c[0].queryKey)))
      .toContain(JSON.stringify(teachingKeys.mine));
  });
});
