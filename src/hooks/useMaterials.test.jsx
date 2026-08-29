import { describe, it, expect, vi, beforeEach } from 'vitest';
import { waitFor } from '@testing-library/react';
import { renderQuery } from '../test/queryHarness';

// All three writes change one course's list and nothing else, so the
// invalidation is scoped to that course rather than to every material in the
// app. courseId rides in the variables for exactly that reason, and these are
// what stop it quietly widening to a blanket refresh.

const mocks = vi.hoisted(() => ({
  listCourseMaterials: vi.fn(), addMaterialFile: vi.fn(),
  addMaterialLink: vi.fn(), removeMaterial: vi.fn(),
}));
vi.mock('../api/materials', () => mocks);

const {
  useCourseMaterials, useAddMaterialFile, useAddMaterialLink,
  useRemoveMaterial, materialKeys,
} = await import('./useMaterials');

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listCourseMaterials.mockResolvedValue([{ id: 'm1' }]);
  mocks.addMaterialFile.mockResolvedValue({});
  mocks.addMaterialLink.mockResolvedValue({});
  mocks.removeMaterial.mockResolvedValue({});
});

describe('reading', () => {
  it('lists the materials on a course', async () => {
    const { result } = renderQuery(() => useCourseMaterials('c1'));
    await waitFor(() => expect(result.current.data).toHaveLength(1));
    expect(mocks.listCourseMaterials).toHaveBeenCalledWith('c1');
  });

  it('does not fire before the course id arrives', () => {
    renderQuery(() => useCourseMaterials(undefined));
    expect(mocks.listCourseMaterials).not.toHaveBeenCalled();
  });
});

describe('writing', () => {
  const scoped = (client) => vi.spyOn(client, 'invalidateQueries');

  it('refreshes only the course a file was added to', async () => {
    const { result, client } = renderQuery(() => useAddMaterialFile());
    const spy = scoped(client);

    result.current.mutate({ courseId: 'c1', file: {}, name: 'Handbook' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(spy).toHaveBeenCalledWith({ queryKey: materialKeys.forCourse('c1') });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('refreshes only the course a link was added to', async () => {
    const { result, client } = renderQuery(() => useAddMaterialLink());
    const spy = scoped(client);

    result.current.mutate({ courseId: 'c2', name: 'Policy', url: 'https://x.example' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(spy).toHaveBeenCalledWith({ queryKey: materialKeys.forCourse('c2') });
  });

  it('refreshes the course a material was removed from', async () => {
    const { result, client } = renderQuery(() => useRemoveMaterial());
    const spy = scoped(client);

    result.current.mutate({ id: 'm1', storagePath: 'c3/x.pdf', courseId: 'c3' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(spy).toHaveBeenCalledWith({ queryKey: materialKeys.forCourse('c3') });
  });

  it('passes the api only what it asked for', async () => {
    const { result } = renderQuery(() => useAddMaterialLink());
    result.current.mutate({ courseId: 'c1', name: 'N', url: 'https://x.example', extra: 1 });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mocks.addMaterialLink).toHaveBeenCalledWith({
      courseId: 'c1', name: 'N', url: 'https://x.example',
    });
  });
});
