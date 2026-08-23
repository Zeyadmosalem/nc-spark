import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mocks = vi.hoisted(() => ({
  createModule: vi.fn(), updateModule: vi.fn(), deleteModule: vi.fn(),
  createActivity: vi.fn(), updateActivity: vi.fn(), deleteActivity: vi.fn(),
  getCourseForEditing: vi.fn(),
}));
vi.mock('../api/authoring', () => mocks);

const {
  useCreateModule, useUpdateModule, useDeleteModule,
  useCreateActivity, useUpdateActivity, useDeleteActivity, useCourseForEditing,
} = await import('./useAuthoring');

let client;
function wrapper({ children }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  for (const fn of Object.values(mocks)) fn.mockResolvedValue({ id: 'x' });
});

describe('what reaches the api', () => {
  /**
   * TanStack calls mutationFn as fn(variables, context). Each of these unpacks
   * a single object, so the exact argument list is asserted rather than only
   * the first argument.
   */
  it('useCreateModule passes the fields, not the whole variables object', async () => {
    const { result } = renderHook(() => useCreateModule(), { wrapper });
    result.current.mutate({ courseId: 'c1', title: 'M1', position: 1 });
    await waitFor(() => expect(mocks.createModule).toHaveBeenCalledWith({
      courseId: 'c1', title: 'M1', position: 1, unlockAfterModuleId: undefined,
    }));
    expect(mocks.createModule.mock.calls[0]).toHaveLength(1);
  });

  it('useUpdateModule splits the id from the patch', async () => {
    const { result } = renderHook(() => useUpdateModule(), { wrapper });
    result.current.mutate({ id: 'm1', courseId: 'c1', title: 'Renamed' });
    await waitFor(() => expect(mocks.updateModule).toHaveBeenCalledWith('m1', {
      title: 'Renamed', unlockAfterModuleId: undefined,
    }));
  });

  it('useDeleteModule passes the id alone', async () => {
    const { result } = renderHook(() => useDeleteModule(), { wrapper });
    result.current.mutate({ id: 'm1', courseId: 'c1' });
    await waitFor(() => expect(mocks.deleteModule).toHaveBeenCalledWith('m1'));
    expect(mocks.deleteModule.mock.calls[0]).toHaveLength(1);
  });

  it('useCreateActivity carries the content through', async () => {
    const { result } = renderHook(() => useCreateActivity(), { wrapper });
    result.current.mutate({
      courseId: 'c1', moduleId: 'm1', type: 'reading', title: 'Read',
      position: 1, xp: 15, content: { body: 'hello' },
    });
    await waitFor(() => expect(mocks.createActivity).toHaveBeenCalledWith({
      moduleId: 'm1', type: 'reading', title: 'Read', position: 1, xp: 15,
      content: { body: 'hello' },
    }));
  });

  it('useUpdateActivity splits the id from the patch', async () => {
    const { result } = renderHook(() => useUpdateActivity(), { wrapper });
    result.current.mutate({ id: 'a1', courseId: 'c1', xp: 0 });
    await waitFor(() => expect(mocks.updateActivity).toHaveBeenCalledWith('a1', {
      title: undefined, xp: 0, content: undefined,
    }));
  });

  it('useDeleteActivity passes the id alone', async () => {
    const { result } = renderHook(() => useDeleteActivity(), { wrapper });
    result.current.mutate({ id: 'a1', courseId: 'c1' });
    await waitFor(() => expect(mocks.deleteActivity).toHaveBeenCalledWith('a1'));
  });
});

describe('what goes stale', () => {
  /**
   * Adding the first activity to a course is what makes publish-course stop
   * refusing it. If the content counts are not refetched, the Curriculum page
   * goes on showing a disabled Publish button for a course that is now ready.
   */
  it('refreshes the outline and the content counts', async () => {
    const spy = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useCreateActivity(), { wrapper });
    result.current.mutate({ courseId: 'c1', moduleId: 'm1', type: 'reading', title: 'R', position: 1 });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const keys = spy.mock.calls.map((c) => JSON.stringify(c[0].queryKey));
    expect(keys).toContain(JSON.stringify(['authoring', 'course', 'c1']));
    expect(keys).toContain(JSON.stringify(['courses', 'outline', 'c1']));
    expect(keys).toContain(JSON.stringify(['admin', 'content-counts']));
  });

  it('skips the outline when no course was named, rather than invalidating everything', async () => {
    const spy = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useDeleteActivity(), { wrapper });
    result.current.mutate({ id: 'a1' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const keys = spy.mock.calls.map((c) => JSON.stringify(c[0].queryKey));
    expect(keys.some((k) => k.includes('outline'))).toBe(false);
    expect(keys).toContain(JSON.stringify(['admin', 'content-counts']));
  });
});

describe('useCourseForEditing', () => {
  it('does not fetch without a course id', () => {
    renderHook(() => useCourseForEditing(undefined), { wrapper });
    expect(mocks.getCourseForEditing).not.toHaveBeenCalled();
  });

  it('returns the course', async () => {
    mocks.getCourseForEditing.mockResolvedValue({ id: 'c1', title: 'Fire Safety', modules: [] });
    const { result } = renderHook(() => useCourseForEditing('c1'), { wrapper });
    await waitFor(() => expect(result.current.data?.title).toBe('Fire Safety'));
  });
});
