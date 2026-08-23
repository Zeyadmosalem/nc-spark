import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const mocks = vi.hoisted(() => ({
  useSession: vi.fn(), useCourses: vi.fn(), useCourseContentCounts: vi.fn(),
  useMyTeachingRequests: vi.fn(), publish: vi.fn(), ask: vi.fn(),
  state: { ask: { isPending: false, error: null } },
}));

const asMutation = (spy, extra = {}) => ({
  mutate: spy, isPending: false, error: null, ...extra,
});

vi.mock('../../hooks/useSession', () => ({ useSession: mocks.useSession }));
vi.mock('../../hooks/useCourses', () => ({
  useCourses: mocks.useCourses,
  useCourseContentCounts: mocks.useCourseContentCounts,
  usePublishCourse: () => asMutation(mocks.publish),
}));
vi.mock('../../hooks/useTeaching', () => ({
  useMyTeachingRequests: mocks.useMyTeachingRequests,
  useRequestToTeach: () => asMutation(mocks.ask, mocks.state.ask),
}));

const TrainerCourses = (await import('./TrainerCourses')).default;

const query = (data, over) => ({ data, isLoading: false, error: null, ...over });
const show = () => render(<MemoryRouter><TrainerCourses /></MemoryRouter>);

const course = (over) => ({
  id: 'c1', title: 'Fire Safety', subtitle: 'Basics', status: 'draft',
  icon: 'F', color: '#f00', trainerId: 'me', ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.useSession.mockReturnValue({ profile: { id: 'me', role: 'trainer' } });
  mocks.useCourses.mockReturnValue(query([]));
  mocks.useCourseContentCounts.mockReturnValue(query({ c1: { modules: 1, activities: 3 } }));
  mocks.useMyTeachingRequests.mockReturnValue(query([]));
  mocks.state.ask = { isPending: false, error: null };
});

describe('my courses', () => {
  it('shows only courses assigned to me', () => {
    mocks.useCourses.mockReturnValue(query([
      course({ id: 'c1', title: 'Mine', trainerId: 'me' }),
      course({ id: 'c2', title: 'Someone else', trainerId: 'other' }),
    ]));
    show();
    expect(screen.getByText('Mine')).toBeInTheDocument();
    expect(screen.queryByText('Someone else')).not.toBeInTheDocument();
  });

  it('links to the shared builder under the trainer route', () => {
    mocks.useCourses.mockReturnValue(query([course()]));
    show();
    expect(screen.getByRole('link', { name: 'Content' }))
      .toHaveAttribute('href', '/trainer/courses/c1');
  });

  /**
   * The same rule the admin console enforces, for the same reason:
   * publish-course refuses a course with no activities, and a disabled button
   * that says why beats a 422 the trainer has to provoke.
   */
  it('will not offer Publish on an empty course', () => {
    mocks.useCourses.mockReturnValue(query([course()]));
    mocks.useCourseContentCounts.mockReturnValue(query({ c1: { modules: 0, activities: 0 } }));
    show();
    expect(screen.getByRole('button', { name: 'Publish' })).toBeDisabled();
    expect(screen.getByText(/add one before this can be published/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Add content' })).toBeInTheDocument();
  });

  it('publishes and unpublishes', async () => {
    mocks.useCourses.mockReturnValue(query([course({ status: 'draft' })]));
    const { rerender } = show();
    await userEvent.click(screen.getByRole('button', { name: 'Publish' }));
    expect(mocks.publish).toHaveBeenCalledWith({ courseId: 'c1', publish: true });

    mocks.useCourses.mockReturnValue(query([course({ status: 'published' })]));
    rerender(<MemoryRouter><TrainerCourses /></MemoryRouter>);
    await userEvent.click(screen.getByRole('button', { name: 'Unpublish' }));
    expect(mocks.publish).toHaveBeenLastCalledWith({ courseId: 'c1', publish: false });
  });

  it('explains an empty roster rather than showing a bare page', () => {
    show();
    expect(screen.getByText(/No courses are assigned to you yet/)).toBeInTheDocument();
  });
});

describe('asking to teach', () => {
  /**
   * A trainer cannot create a course or assign themselves one — trainer_id is
   * excluded from the UPDATE grant. Asking is the only route, and an admin
   * decides. This is the other half of the queue on the admin Curriculum page.
   */
  it('offers unassigned courses', async () => {
    mocks.useCourses.mockReturnValue(query([
      course({ id: 'c2', title: 'Orphan', trainerId: null }),
    ]));
    show();
    await userEvent.click(screen.getByRole('button', { name: 'Ask to teach this' }));
    expect(mocks.ask).toHaveBeenCalledWith({ courseId: 'c2' });
  });

  it('does not offer a course that already has a trainer', () => {
    mocks.useCourses.mockReturnValue(query([course({ trainerId: 'other' })]));
    show();
    expect(screen.queryByText(/looking for a trainer/)).not.toBeInTheDocument();
  });

  /**
   * teaching_requests_one_open is a partial unique index over pending rows, so
   * a second ask is a duplicate-key error. Saying it is already pending beats
   * letting the click fail.
   */
  it('shows a pending ask instead of letting it be repeated', () => {
    mocks.useCourses.mockReturnValue(query([
      course({ id: 'c2', title: 'Orphan', trainerId: null }),
    ]));
    mocks.useMyTeachingRequests.mockReturnValue(query([
      { id: 'r1', courseId: 'c2', status: 'pending' },
    ]));
    show();
    expect(screen.getByText('⏳ Waiting on an admin')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ask to teach this' })).not.toBeInTheDocument();
  });

  // A denied request is settled, so the trainer may ask again.
  it('lets a denied request be asked again', () => {
    mocks.useCourses.mockReturnValue(query([
      course({ id: 'c2', title: 'Orphan', trainerId: null }),
    ]));
    mocks.useMyTeachingRequests.mockReturnValue(query([
      { id: 'r1', courseId: 'c2', status: 'denied' },
    ]));
    show();
    expect(screen.getByRole('button', { name: 'Ask to teach this' })).toBeInTheDocument();
  });

  it('surfaces a refused ask', () => {
    mocks.useCourses.mockReturnValue(query([
      course({ id: 'c2', title: 'Orphan', trainerId: null }),
    ]));
    mocks.state.ask = { isPending: false, error: new Error('duplicate key value') };
    show();
    const row = screen.getByText('Orphan').closest('.card');
    expect(within(row).getByRole('alert')).toHaveTextContent(/duplicate key/);
  });
});

describe('failures', () => {
  it('shows an error rather than an empty course list', () => {
    mocks.useCourses.mockReturnValue(query(undefined, { error: new Error('nope') }));
    show();
    expect(screen.getByRole('alert')).toHaveTextContent(/Could not load your courses/);
  });
});
