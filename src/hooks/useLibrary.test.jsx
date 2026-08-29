import { describe, it, expect, vi, beforeEach } from 'vitest';
import { waitFor } from '@testing-library/react';
import { renderQuery } from '../test/queryHarness';

const mocks = vi.hoisted(() => ({ myLibrary: vi.fn() }));
vi.mock('../api/library', () => mocks);

const { useMyLibrary, libraryKeys } = await import('./useLibrary');

beforeEach(() => {
  vi.clearAllMocks();
  mocks.myLibrary.mockResolvedValue([{ id: 'c1' }]);
});

describe('useMyLibrary', () => {
  it('reads the reader own library', async () => {
    const { result } = renderQuery(() => useMyLibrary());
    await waitFor(() => expect(result.current.data).toHaveLength(1));
  });

  it('uses a key anything invalidating the library can name', () => {
    expect(libraryKeys.all).toEqual(['library']);
  });

  it('surfaces a failure rather than an empty library', async () => {
    mocks.myLibrary.mockRejectedValue(new Error('refused'));
    const { result } = renderQuery(() => useMyLibrary());
    await waitFor(() => expect(result.current.error?.message).toBe('refused'));
    expect(result.current.data).toBeUndefined();
  });
});
