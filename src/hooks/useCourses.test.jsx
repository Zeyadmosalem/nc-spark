import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mocks = vi.hoisted(() => ({
  listCourses: vi.fn(),
  getCourseOutline: vi.fn(),
  myEnrollments: vi.fn(),
  applyForCourse: vi.fn(),
  createCourse: vi.fn(), updateCourse: vi.fn(),
  deleteCourse: vi.fn(), publishCourse: vi.fn(),
}));
vi.mock('../api/courses', () => ({
  listCourses: mocks.listCourses, getCourseOutline: mocks.getCourseOutline,
  createCourse: mocks.createCourse, updateCourse: mocks.updateCourse,
  deleteCourse: mocks.deleteCourse, publishCourse: mocks.publishCourse,
}));
vi.mock('../api/enrollments', () => ({
  myEnrollments: mocks.myEnrollments, applyForCourse: mocks.applyForCourse,
}));

const {
  useCourses, useMyEnrollments, useApplyForCourse, useCourseOutline,
  useCreateCourse, useUpdateCourse, useDeleteCourse, usePublishCourse,
} = await import('./useCourses');

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

describe('curriculum writes', () => {
  /**
   * TanStack calls mutationFn as fn(variables, context). An api function taking
   * positional arguments would be handed a QueryClient as its second one and
   * would post it. Each of these asserts the exact argument list, not just the
   * first argument.
   */
  it('useCreateCourse passes only the fields', async () => {
    mocks.createCourse.mockResolvedValue({ id: 'c9' });
    const { result } = renderHook(() => useCreateCourse(), { wrapper });
    result.current.mutate({ title: 'Fire Safety', icon: '🔥' });
    await waitFor(() => expect(mocks.createCourse)
      .toHaveBeenCalledWith({ title: 'Fire Safety', icon: '🔥' }));
    expect(mocks.createCourse.mock.calls[0]).toHaveLength(1);
  });

  it('useUpdateCourse splits the id from the patch', async () => {
    mocks.updateCourse.mockResolvedValue({ id: 'c1' });
    const { result } = renderHook(() => useUpdateCourse(), { wrapper });
    result.current.mutate({ id: 'c1', title: 'Renamed' });
    await waitFor(() => expect(mocks.updateCourse)
      .toHaveBeenCalledWith('c1', { title: 'Renamed' }));
    expect(mocks.updateCourse.mock.calls[0]).toHaveLength(2);
  });

  it('useDeleteCourse passes the id alone', async () => {
    mocks.deleteCourse.mockResolvedValue(undefined);
    const { result } = renderHook(() => useDeleteCourse(), { wrapper });
    result.current.mutate({ id: 'c1' });
    await waitFor(() => expect(mocks.deleteCourse).toHaveBeenCalledWith('c1'));
    expect(mocks.deleteCourse.mock.calls[0]).toHaveLength(1);
  });

  it('usePublishCourse sends the boolean', async () => {
    mocks.publishCourse.mockResolvedValue({ ok: true });
    const { result } = renderHook(() => usePublishCourse(), { wrapper });
    result.current.mutate({ courseId: 'c1', publish: true });
    await waitFor(() => expect(mocks.publishCourse).toHaveBeenCalledWith('c1', true));
    expect(mocks.publishCourse.mock.calls[0]).toHaveLength(2);
  });

  // publish-course refuses an empty course with 422. The Curriculum page has to
  // be able to show that, so the hook must not swallow it.
  it('surfaces the empty-course refusal', async () => {
    mocks.publishCourse.mockRejectedValue(
      new Error('A course needs at least one activity before it can be published'));
    const { result } = renderHook(() => usePublishCourse(), { wrapper });
    result.current.mutate({ courseId: 'c1', publish: true });
    await waitFor(() => expect(result.current.error?.message).toMatch(/at least one activity/));
  });
});
