import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mocks = vi.hoisted(() => ({
  listCourses: vi.fn(),
  getCourseOutline: vi.fn(),
  myEnrollments: vi.fn(),
  applyForCourse: vi.fn(),
}));
vi.mock('../api/courses', () => ({
  listCourses: mocks.listCourses, getCourseOutline: mocks.getCourseOutline,
}));
vi.mock('../api/enrollments', () => ({
  myEnrollments: mocks.myEnrollments, applyForCourse: mocks.applyForCourse,
}));

const { useCourses, useMyEnrollments, useApplyForCourse, useCourseOutline } =
  await import('./useCourses');

function wrapper({ children }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => vi.clearAllMocks());

describe('useCourses', () => {
  it('returns courses once loaded', async () => {
    mocks.listCourses.mockResolvedValue([{ id: 'c1', title: 'H&S' }]);
    const { result } = renderHook(() => useCourses(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toHaveLength(1);
  });

  it('surfaces an error', async () => {
    mocks.listCourses.mockRejectedValue(new Error('nope'));
    const { result } = renderHook(() => useCourses(), { wrapper });
    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.error.message).toMatch(/nope/);
  });
});

describe('useCourseOutline', () => {
  it('does not fetch without an id', () => {
    renderHook(() => useCourseOutline(undefined), { wrapper });
    expect(mocks.getCourseOutline).not.toHaveBeenCalled();
  });

  it('fetches when given an id', async () => {
    mocks.getCourseOutline.mockResolvedValue({ id: 'c1', modules: [] });
    const { result } = renderHook(() => useCourseOutline('c1'), { wrapper });
    await waitFor(() => expect(result.current.data).toBeTruthy());
    expect(mocks.getCourseOutline).toHaveBeenCalledWith('c1');
  });
});

describe('useMyEnrollments', () => {
  it('returns enrollments once loaded', async () => {
    mocks.myEnrollments.mockResolvedValue([{ id: 'e1', courseId: 'c1', status: 'active', percent: 40 }]);
    const { result } = renderHook(() => useMyEnrollments(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data[0].percent).toBe(40);
  });
});

describe('useApplyForCourse', () => {
  it('calls the api with the course id', async () => {
    mocks.applyForCourse.mockResolvedValue({ id: 'e1', status: 'pending' });
    const { result } = renderHook(() => useApplyForCourse(), { wrapper });
    result.current.mutate('c1');
    await waitFor(() => expect(mocks.applyForCourse).toHaveBeenCalledWith('c1'));
  });

  it('surfaces a rejection', async () => {
    mocks.applyForCourse.mockRejectedValue(new Error('already applied'));
    const { result } = renderHook(() => useApplyForCourse(), { wrapper });
    result.current.mutate('c1');
    await waitFor(() => expect(result.current.error?.message).toMatch(/already applied/));
  });
});
