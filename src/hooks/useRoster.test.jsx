import { describe, it, expect, vi, beforeEach } from 'vitest';
import { waitFor } from '@testing-library/react';
import { renderQuery } from '../test/queryHarness';

const mocks = vi.hoisted(() => ({ courseRoster: vi.fn() }));
vi.mock('../api/roster', () => mocks);

const { useCourseRoster, rosterKeys } = await import('./useRoster');

beforeEach(() => {
  vi.clearAllMocks();
  mocks.courseRoster.mockResolvedValue([{ id: 'p1' }]);
});

describe('useCourseRoster', () => {
  it('reads who is on a course', async () => {
    const { result } = renderQuery(() => useCourseRoster('c1'));
    await waitFor(() => expect(result.current.data).toHaveLength(1));
    expect(mocks.courseRoster).toHaveBeenCalledWith('c1');
  });

  /** A roster query without a course id asks the server for everybody. */
  it('does not fire before the course id arrives', () => {
    renderQuery(() => useCourseRoster(undefined));
    expect(mocks.courseRoster).not.toHaveBeenCalled();
  });

  it('keys by course', () => {
    expect(rosterKeys.course('c1')).toEqual(['roster', 'c1']);
  });
});
