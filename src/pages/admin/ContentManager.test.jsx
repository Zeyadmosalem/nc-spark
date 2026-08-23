import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';

const mocks = vi.hoisted(() => ({
  useCourses: vi.fn(), useUsers: vi.fn(), useTeachingRequests: vi.fn(),
  useCourseContentCounts: vi.fn(),
  create: vi.fn(), update: vi.fn(), remove: vi.fn(), publish: vi.fn(), decide: vi.fn(),
  state: { publish: { isPending: false, error: null }, create: { isPending: false, error: null } },
}));

const asMutation = (mutate, extra = {}) => ({
  mutate, mutateAsync: vi.fn().mockResolvedValue({}), isPending: false, error: null, ...extra,
});

vi.mock('../../hooks/useCourses', () => ({
  useCourses: mocks.useCourses,
  useCreateCourse: () => asMutation(mocks.create, mocks.state.create),
  useUpdateCourse: () => asMutation(mocks.update),
  useDeleteCourse: () => asMutation(mocks.remove),
  usePublishCourse: () => asMutation(mocks.publish, mocks.state.publish),
}));
vi.mock('../../hooks/useAdmin', () => ({
  useUsers: mocks.useUsers,
  useTeachingRequests: mocks.useTeachingRequests,
  useCourseContentCounts: mocks.useCourseContentCounts,
  useDecideTeachingRequest: () => asMutation(mocks.decide),
}));

const ContentManager = (await import('./ContentManager')).default;

const query = (data, over) => ({ data, isLoading: false, error: null, ...over });
const course = (over) => ({
  id: 'c1', title: 'Fire Safety', subtitle: 'Basics', description: '',
  status: 'draft', icon: 'F', color: '#dc3545', trainerId: null, ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.useCourses.mockReturnValue(query([]));
  mocks.useUsers.mockReturnValue(query([]));
  mocks.useTeachingRequests.mockReturnValue(query([]));
  mocks.useCourseContentCounts.mockReturnValue(query({ c1: { modules: 2, activities: 7 } }));
  mocks.state.publish = { isPending: false, error: null };
  mocks.state.create = { isPending: false, error: null };
});

describe('the course list', () => {
  it('shows the real status, not a guess', () => {
    mocks.useCourses.mockReturnValue(query([
      course({ id: 'c1', title: 'Fire Safety', status: 'draft' }),
      course({ id: 'c2', title: 'Manual Handling', status: 'published' }),
    ]));
    render(<MemoryRouter><ContentManager /></MemoryRouter>);
    expect(within(screen.getByText('Fire Safety').closest('.card')).getByText('Draft'))
      .toBeInTheDocument();
    expect(within(screen.getByText('Manual Handling').closest('.card')).getByText('Published'))
      .toBeInTheDocument();
  });

  it('resolves the trainer name from the directory', () => {
    mocks.useUsers.mockReturnValue(query([{ id: 't1', name: 'Grace Hopper', role: 'trainer' }]));
    mocks.useCourses.mockReturnValue(query([course({ trainerId: 't1' })]));
    render(<MemoryRouter><ContentManager /></MemoryRouter>);
    expect(screen.getByText('Trainer: Grace Hopper')).toBeInTheDocument();
  });

  /**
   * courses.trainer_id is excluded from the UPDATE grant, so an admin-created
   * course has no owner until a teaching request is approved. Nothing else in
   * the product says so, and an unowned course is one no trainer can touch.
   */
  it('says plainly when a course has no trainer', () => {
    mocks.useCourses.mockReturnValue(query([course({ trainerId: null })]));
    render(<MemoryRouter><ContentManager /></MemoryRouter>);
    expect(screen.getByText(/No trainer assigned/)).toBeInTheDocument();
  });

  it('toggles publish state through the Edge Function', async () => {
    mocks.useCourses.mockReturnValue(query([course({ status: 'draft' })]));
    const { rerender } = render(<MemoryRouter><ContentManager /></MemoryRouter>);
    await userEvent.click(screen.getByRole('button', { name: 'Publish' }));
    expect(mocks.publish).toHaveBeenCalledWith({ courseId: 'c1', publish: true });

    mocks.useCourses.mockReturnValue(query([course({ status: 'published' })]));
    rerender(<MemoryRouter><ContentManager /></MemoryRouter>);
    await userEvent.click(screen.getByRole('button', { name: 'Unpublish' }));
    expect(mocks.publish).toHaveBeenLastCalledWith({ courseId: 'c1', publish: false });
  });

  /**
   * publish-course returns 422 for a course with no activities. That refusal is
   * the whole reason the check exists, and it has to reach the admin or the
   * button just looks broken.
   */
  it('renders the empty-course refusal', () => {
    mocks.useCourses.mockReturnValue(query([course()]));
    mocks.state.publish = {
      isPending: false,
      error: new Error('A course needs at least one activity before it can be published'),
    };
    render(<MemoryRouter><ContentManager /></MemoryRouter>);
    expect(screen.getByRole('alert'))
      .toHaveTextContent('A course needs at least one activity');
  });

  // Deleting cascades to modules, activities and every enrolment on the course.
  it('does not delete on the first click', async () => {
    mocks.useCourses.mockReturnValue(query([course()]));
    render(<MemoryRouter><ContentManager /></MemoryRouter>);
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(mocks.remove).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Delete for good' }));
    expect(mocks.remove).toHaveBeenCalledWith({ id: 'c1' });
  });
});

describe('teaching requests', () => {
  it('approves through the Edge Function', async () => {
    mocks.useTeachingRequests.mockReturnValue(query([{
      id: 'r1', trainerName: 'Grace', trainerAvatar: 'G', courseTitle: 'Fire Safety',
    }]));
    render(<MemoryRouter><ContentManager /></MemoryRouter>);
    expect(screen.getByText(/wants to teach/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Approve' }));
    expect(mocks.decide).toHaveBeenCalledWith({ requestId: 'r1', decision: 'approve' });
  });

  it('hides the section entirely when nobody has asked', () => {
    render(<MemoryRouter><ContentManager /></MemoryRouter>);
    expect(screen.queryByText(/Trainers asking to teach/)).not.toBeInTheDocument();
  });
});

describe('creating a course', () => {
  it('will not submit without a title', async () => {
    render(<MemoryRouter><ContentManager /></MemoryRouter>);
    await userEvent.click(screen.getByRole('button', { name: '+ New course' }));
    expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Title'), 'Fire Safety');
    expect(screen.getByRole('button', { name: 'Create' })).toBeEnabled();
  });

  it('offers an empty state that leads somewhere', async () => {
    render(<MemoryRouter><ContentManager /></MemoryRouter>);
    await userEvent.click(screen.getByRole('button', { name: 'Create the first course' }));
    expect(screen.getByRole('dialog', { name: 'New course' })).toBeInTheDocument();
  });
});

describe('what this page deliberately does not offer', () => {
  /**
   * The prototype had Activities, Quizzes and Learning Paths tabs, all writing
   * to in-memory context with no server counterpart. Authoring is backlog B6;
   * dead tabs beside working ones are worse than absent ones.
   */
  it('has no authoring tabs it cannot back', () => {
    mocks.useCourses.mockReturnValue(query([course()]));
    render(<MemoryRouter><ContentManager /></MemoryRouter>);
    expect(screen.queryByRole('button', { name: /Learning Paths/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Quizzes$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Activities$/i })).not.toBeInTheDocument();
  });

  it('shows a load failure rather than an empty curriculum', () => {
    mocks.useCourses.mockReturnValue(query(undefined, { error: new Error('nope') }));
    render(<MemoryRouter><ContentManager /></MemoryRouter>);
    expect(screen.getByRole('alert')).toHaveTextContent(/Could not load the curriculum/);
  });
});

/**
 * Nothing in the app can create a module or an activity yet — src/api has read
 * paths only, and authoring is backlog B6. So an admin can create a course and
 * then find Publish refuses it, with the reason buried in a 422 they have to
 * provoke. These make the refusal visible before it happens.
 */
describe('content an admin cannot yet add', () => {
  it('shows how much content a course has', () => {
    mocks.useCourses.mockReturnValue(query([course()]));
    render(<MemoryRouter><ContentManager /></MemoryRouter>);
    expect(screen.getByText(/2 modules . 7 activities/)).toBeInTheDocument();
  });

  it('disables Publish and says why when a course is empty', () => {
    mocks.useCourses.mockReturnValue(query([course({ status: 'draft' })]));
    mocks.useCourseContentCounts.mockReturnValue(query({ c1: { modules: 0, activities: 0 } }));
    render(<MemoryRouter><ContentManager /></MemoryRouter>);
    expect(screen.getByRole('button', { name: 'Publish' })).toBeDisabled();
    expect(screen.getByText(/needs at least one activity before it can be published/))
      .toBeInTheDocument();
  });

  it('still allows Unpublish on an empty course that is somehow published', () => {
    mocks.useCourses.mockReturnValue(query([course({ status: 'published' })]));
    mocks.useCourseContentCounts.mockReturnValue(query({ c1: { modules: 0, activities: 0 } }));
    render(<MemoryRouter><ContentManager /></MemoryRouter>);
    expect(screen.getByRole('button', { name: 'Unpublish' })).toBeEnabled();
  });

  // The counts query can fail or still be loading; that must not disable a
  // button that would otherwise work.
  it('leaves Publish enabled when the counts have not arrived', () => {
    mocks.useCourses.mockReturnValue(query([course({ status: 'draft' })]));
    mocks.useCourseContentCounts.mockReturnValue(query(undefined));
    render(<MemoryRouter><ContentManager /></MemoryRouter>);
    expect(screen.getByRole('button', { name: 'Publish' })).toBeEnabled();
  });
});

describe('the route into the builder', () => {
  it('links each course to its content, and says so louder when empty', () => {
    mocks.useCourses.mockReturnValue(query([course()]));
    mocks.useCourseContentCounts.mockReturnValue(query({ c1: { modules: 0, activities: 0 } }));
    render(<MemoryRouter><ContentManager /></MemoryRouter>);
    const link = screen.getByRole('link', { name: 'Add content' });
    expect(link).toHaveAttribute('href', '/admin/content/c1');
  });

  it('calls it Content once the course has some', () => {
    mocks.useCourses.mockReturnValue(query([course()]));
    render(<MemoryRouter><ContentManager /></MemoryRouter>);
    expect(screen.getByRole('link', { name: 'Content' }))
      .toHaveAttribute('href', '/admin/content/c1');
  });
});
