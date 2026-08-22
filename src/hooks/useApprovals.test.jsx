import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mocks = vi.hoisted(() => ({
  pendingEnrollments: vi.fn(),
  decideEnrollment: vi.fn(),
}));
vi.mock('../api/enrollments', () => ({
  pendingEnrollments: mocks.pendingEnrollments,
  decideEnrollment: mocks.decideEnrollment,
}));

const { usePendingEnrollments, useDecideEnrollment } = await import('./useApprovals');

function wrapper({ children }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => vi.clearAllMocks());

describe('usePendingEnrollments', () => {
  it('returns the queue', async () => {
    mocks.pendingEnrollments.mockResolvedValue([
      { id: 'e1', traineeName: 'Amira', courseTitle: 'H&S', status: 'pending' },
    ]);
    const { result } = renderHook(() => usePendingEnrollments(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data[0].traineeName).toBe('Amira');
  });

  it('returns an empty queue without error', async () => {
    mocks.pendingEnrollments.mockResolvedValue([]);
    const { result } = renderHook(() => usePendingEnrollments(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toEqual([]);
  });
});

describe('useDecideEnrollment', () => {
  it('passes the decision through', async () => {
    mocks.decideEnrollment.mockResolvedValue({ ok: true });
    const { result } = renderHook(() => useDecideEnrollment(), { wrapper });
    result.current.mutate({ enrollmentId: 'e1', decision: 'approve' });
    await waitFor(() => expect(mocks.decideEnrollment).toHaveBeenCalledWith('e1', 'approve'));
  });

  it('passes a denial through', async () => {
    mocks.decideEnrollment.mockResolvedValue({ ok: true });
    const { result } = renderHook(() => useDecideEnrollment(), { wrapper });
    result.current.mutate({ enrollmentId: 'e1', decision: 'deny' });
    await waitFor(() => expect(mocks.decideEnrollment).toHaveBeenCalledWith('e1', 'deny'));
  });

  it('surfaces a rejection from the server', async () => {
    mocks.decideEnrollment.mockRejectedValue(new Error('Not your course'));
    const { result } = renderHook(() => useDecideEnrollment(), { wrapper });
    result.current.mutate({ enrollmentId: 'e1', decision: 'approve' });
    await waitFor(() => expect(result.current.error?.message).toMatch(/Not your course/));
  });
});
