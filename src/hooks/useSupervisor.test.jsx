import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mocks = vi.hoisted(() => ({
  myTrainers: vi.fn(), teamCourses: vi.fn(),
  teamEnrollments: vi.fn(), teamQuizAttempts: vi.fn(),
}));
vi.mock('../api/supervisor', () => mocks);

const {
  useMyTrainers, useTeamCourses, useTeamEnrollments, useTeamQuizAttempts, supervisorKeys,
} = await import('./useSupervisor');

let client;
function wrapper({ children }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

describe('useMyTrainers', () => {
  it('returns the roster', async () => {
    mocks.myTrainers.mockResolvedValue([{ id: 't1', name: 'Ada' }]);
    const { result } = renderHook(() => useMyTrainers(), { wrapper });
    await waitFor(() => expect(result.current.data?.[0]?.name).toBe('Ada'));
  });

  it('surfaces a refusal rather than an empty roster', async () => {
    mocks.myTrainers.mockRejectedValue(new Error('permission denied'));
    const { result } = renderHook(() => useMyTrainers(), { wrapper });
    await waitFor(() => expect(result.current.error?.message).toMatch(/permission denied/));
  });
});

describe('useTeamCourses', () => {
  /**
   * teamCourses filters by the ids handed to it. Firing before the roster
   * arrives would cache an empty team and tell a supervisor they manage
   * nobody, then correct itself a moment later.
   */
  it('waits for the trainer list', () => {
    renderHook(() => useTeamCourses(undefined), { wrapper });
    expect(mocks.teamCourses).not.toHaveBeenCalled();
  });

  it('does not fire for a supervisor with no trainers', () => {
    renderHook(() => useTeamCourses([]), { wrapper });
    expect(mocks.teamCourses).not.toHaveBeenCalled();
  });

  it('fetches once the roster is known', async () => {
    mocks.teamCourses.mockResolvedValue([{ id: 'c1', title: 'Fire Safety' }]);
    const { result } = renderHook(() => useTeamCourses(['t1']), { wrapper });
    await waitFor(() => expect(result.current.data?.[0]?.title).toBe('Fire Safety'));
    expect(mocks.teamCourses).toHaveBeenCalledWith(['t1']);
  });

  it('treats a reordered roster as the same query', () => {
    expect(supervisorKeys.courses(['b', 'a']))
      .toEqual(supervisorKeys.courses(['a', 'b']));
  });

  it('does not mutate the array it was given', () => {
    const ids = ['b', 'a'];
    supervisorKeys.courses(ids);
    expect(ids).toEqual(['b', 'a']);
  });
});

describe('the aggregate queries', () => {
  it('useTeamEnrollments returns rows', async () => {
    mocks.teamEnrollments.mockResolvedValue([{ id: 'e1', percent: 40 }]);
    const { result } = renderHook(() => useTeamEnrollments(), { wrapper });
    await waitFor(() => expect(result.current.data).toHaveLength(1));
  });

  it('useTeamQuizAttempts returns rows', async () => {
    mocks.teamQuizAttempts.mockResolvedValue([{ id: 'a1', quizTitle: 'Check' }]);
    const { result } = renderHook(() => useTeamQuizAttempts(), { wrapper });
    await waitFor(() => expect(result.current.data?.[0]?.quizTitle).toBe('Check'));
  });
});
