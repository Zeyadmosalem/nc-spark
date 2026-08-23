import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mocks = vi.hoisted(() => ({
  getActivity: vi.fn(),
  completeActivity: vi.fn(),
}));
vi.mock('../api/activities', () => ({
  getActivity: mocks.getActivity, completeActivity: mocks.completeActivity,
}));

const { useActivity, useCompleteActivity } = await import('./useActivities');

let client;
function wrapper({ children }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

describe('useActivity', () => {
  it('does not fetch without an id', () => {
    renderHook(() => useActivity(undefined), { wrapper });
    expect(mocks.getActivity).not.toHaveBeenCalled();
  });

  it('returns the activity once loaded', async () => {
    mocks.getActivity.mockResolvedValue({ id: 'a1', type: 'reading', body: 'x' });
    const { result } = renderHook(() => useActivity('a1'), { wrapper });
    await waitFor(() => expect(result.current.data).toBeTruthy());
    expect(result.current.data.type).toBe('reading');
  });

  it('surfaces an error', async () => {
    mocks.getActivity.mockRejectedValue(new Error('denied'));
    const { result } = renderHook(() => useActivity('a1'), { wrapper });
    await waitFor(() => expect(result.current.error?.message).toMatch(/denied/));
  });
});

describe('useCompleteActivity', () => {
  it('passes the activity id and payload', async () => {
    mocks.completeActivity.mockResolvedValue({ ok: true, progress: { percent: 25 } });
    const { result } = renderHook(() => useCompleteActivity(), { wrapper });
    result.current.mutate({ activityId: 'a1', payload: { score: 2 } });
    await waitFor(() => expect(mocks.completeActivity).toHaveBeenCalledWith('a1', { score: 2 }));
  });

  it('surfaces a locked-module refusal', async () => {
    mocks.completeActivity.mockRejectedValue(new Error('Finish the previous module first'));
    const { result } = renderHook(() => useCompleteActivity(), { wrapper });
    result.current.mutate({ activityId: 'a1' });
    await waitFor(() => expect(result.current.error?.message).toMatch(/previous module/));
  });

  // Completing an activity can unlock the next module, so a stale outline
  // would keep showing a padlock the server has already opened.
  it('invalidates enrollments and course outlines on success', async () => {
    mocks.completeActivity.mockResolvedValue({ ok: true, progress: { percent: 100 } });
    const spy = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useCompleteActivity(), { wrapper });
    result.current.mutate({ activityId: 'a1' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const keys = spy.mock.calls.map((c) => JSON.stringify(c[0].queryKey));
    expect(keys).toContain(JSON.stringify(['enrollments', 'mine']));
    expect(keys).toContain(JSON.stringify(['courses', 'outline']));
  });
});
