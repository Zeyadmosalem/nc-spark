import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const mocks = vi.hoisted(() => ({
  useCourseForEditing: vi.fn(),
  createModule: vi.fn(), updateModule: vi.fn(), deleteModule: vi.fn(),
  createActivity: vi.fn(), updateActivity: vi.fn(), deleteActivity: vi.fn(),
  state: { createActivity: { isPending: false, error: null } },
}));

const asMutation = (spy, extra = {}) => ({
  mutate: spy,
  // The same spy. A component uses mutateAsync when it needs to close a form
  // after the write lands and mutate when it does not; a test asserting what
  // reached the server should not have to know which.
  mutateAsync: (...args) => { spy(...args); return Promise.resolve({}); },
  isPending: false,
  error: null,
  ...extra,
});

vi.mock('../../hooks/useAuthoring', () => ({
  useCourseForEditing: mocks.useCourseForEditing,
  useCreateModule: () => asMutation(mocks.createModule),
  useUpdateModule: () => asMutation(mocks.updateModule),
  useDeleteModule: () => asMutation(mocks.deleteModule),
  useCreateActivity: () => asMutation(mocks.createActivity, mocks.state.createActivity),
  useUpdateActivity: () => asMutation(mocks.updateActivity),
  useDeleteActivity: () => asMutation(mocks.deleteActivity),
}));

const CourseBuilder = (await import('./CourseBuilder')).default;

const query = (data, over) => ({ data, isLoading: false, error: null, ...over });

const show = () => render(
  <MemoryRouter initialEntries={['/admin/content/c1']}>
    <Routes><Route path="/admin/content/:courseId" element={<CourseBuilder />} /></Routes>
  </MemoryRouter>,
);

const activity = (over) => ({
  id: 'a1', moduleId: 'm1', type: 'reading', title: 'Read this',
  position: 1, xp: 10, content: { body: 'text' }, ...over,
});
const mod = (over) => ({
  id: 'm1', courseId: 'c1', title: 'Module one', position: 1,
  unlockAfterModuleId: null, activities: [], ...over,
});
const courseWith = (modules) => query({
  id: 'c1', title: 'Fire Safety', status: 'draft', modules,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.useCourseForEditing.mockReturnValue(courseWith([]));
  mocks.state.createActivity = { isPending: false, error: null };
});

describe('the shape of the course', () => {
  it('counts modules and activities', () => {
    mocks.useCourseForEditing.mockReturnValue(courseWith([
      mod({ id: 'm1', activities: [activity(), activity({ id: 'a2', position: 2 })] }),
      mod({ id: 'm2', position: 2, title: 'Module two' }),
    ]));
    show();
    expect(screen.getByText(/2 modules, 2 activities/)).toBeInTheDocument();
  });

  /**
   * publish-course refuses a course with no activities. Saying so here, where
   * the fix is, beats saying it on the Publish button two screens away.
   */
  it('says a draft with no activities cannot be published', () => {
    show();
    expect(screen.getByText(/add at least one activity before this can be published/))
      .toBeInTheDocument();
  });

  it('drops the warning once there is content', () => {
    mocks.useCourseForEditing.mockReturnValue(courseWith([mod({ activities: [activity()] })]));
    show();
    expect(screen.queryByText(/before this can be published/)).not.toBeInTheDocument();
  });

  it('explains an empty course rather than showing a bare page', () => {
    show();
    expect(screen.getByText(/A course is a list of modules/)).toBeInTheDocument();
  });
});

describe('adding a module', () => {
  /**
   * `unique (course_id, position)`. Counting modules reuses a number after a
   * middle module is deleted — three modules at positions 1, 2, 4 would
   * produce another 4 and fail on the constraint.
   */
  it('takes the next position from the highest, not from the count', async () => {
    mocks.useCourseForEditing.mockReturnValue(courseWith([
      mod({ id: 'm1', position: 1 }),
      mod({ id: 'm2', position: 4, title: 'Module four' }),
    ]));
    show();
    await userEvent.type(screen.getByLabelText('New module'), 'Third');
    await userEvent.click(screen.getByRole('button', { name: 'Add module' }));
    expect(mocks.createModule).toHaveBeenCalledWith({
      courseId: 'c1', title: 'Third', position: 5,
    });
  });

  it('starts at position 1 on an empty course', async () => {
    show();
    await userEvent.type(screen.getByLabelText('New module'), 'First');
    await userEvent.click(screen.getByRole('button', { name: 'Add module' }));
    expect(mocks.createModule).toHaveBeenCalledWith({
      courseId: 'c1', title: 'First', position: 1,
    });
  });

  it('will not submit a blank title', () => {
    show();
    expect(screen.getByRole('button', { name: 'Add module' })).toBeDisabled();
  });
});

describe('the unlock gate', () => {
  /**
   * A module gated on a later module, or on itself, can never open. Only
   * earlier ones are offered, which makes that unrepresentable rather than
   * merely discouraged.
   */
  it('offers only modules that come before this one', () => {
    mocks.useCourseForEditing.mockReturnValue(courseWith([
      mod({ id: 'm1', position: 1, title: 'One' }),
      mod({ id: 'm2', position: 2, title: 'Two' }),
      mod({ id: 'm3', position: 3, title: 'Three' }),
    ]));
    show();
    const gate = screen.getByLabelText('Opens after', { selector: '#gate-m2' });
    const options = within(gate).getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual(['Nothing — always open', '1. One']);
  });

  it('has nothing to offer the first module', () => {
    mocks.useCourseForEditing.mockReturnValue(courseWith([mod()]));
    show();
    expect(screen.getByLabelText('Opens after', { selector: '#gate-m1' })).toBeDisabled();
  });

  it('clears the gate with null, not an empty string', async () => {
    mocks.useCourseForEditing.mockReturnValue(courseWith([
      mod({ id: 'm1', position: 1, title: 'One' }),
      mod({ id: 'm2', position: 2, title: 'Two', unlockAfterModuleId: 'm1' }),
    ]));
    show();
    await userEvent.selectOptions(
      screen.getByLabelText('Opens after', { selector: '#gate-m2' }), '');
    expect(mocks.updateModule).toHaveBeenCalledWith({
      id: 'm2', courseId: 'c1', unlockAfterModuleId: null,
    });
  });
});

describe('renaming a module', () => {
  it('offers Save only once the title actually changed', async () => {
    mocks.useCourseForEditing.mockReturnValue(courseWith([mod()]));
    show();
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Title of module 1'), '!');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(mocks.updateModule).toHaveBeenCalledWith({
      id: 'm1', courseId: 'c1', title: 'Module one!',
    });
  });
});

describe('deleting a module', () => {
  it('does not delete on the first click', async () => {
    mocks.useCourseForEditing.mockReturnValue(courseWith([mod()]));
    show();
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(mocks.deleteModule).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Delete module' }));
    expect(mocks.deleteModule).toHaveBeenCalledWith({ id: 'm1', courseId: 'c1' });
  });

  // The cascade reaches activity_completions, so it destroys trainee progress.
  it('spells out the cascade when the module has activities', async () => {
    mocks.useCourseForEditing.mockReturnValue(courseWith([
      mod({ activities: [activity(), activity({ id: 'a2', position: 2 })] }),
    ]));
    show();
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.getByText(/deletes 2 activities and every trainee's progress/))
      .toBeInTheDocument();
  });
});

describe('adding an activity', () => {
  // Same reasoning as modules: position is unique per module, so a gap left by
  // a deletion must not be reused.
  it('numbers it after the last one in that module', async () => {
    mocks.useCourseForEditing.mockReturnValue(courseWith([
      mod({ activities: [activity({ position: 1 }), activity({ id: 'a2', position: 3 })] }),
    ]));
    show();
    await userEvent.click(screen.getByRole('button', { name: '+ Add activity' }));
    await userEvent.type(screen.getByLabelText('Title'), 'New reading');
    await userEvent.click(screen.getByRole('button', { name: 'Add activity' }));
    expect(mocks.createActivity).toHaveBeenCalledWith({
      courseId: 'c1', moduleId: 'm1', type: 'reading', title: 'New reading',
      position: 4, xp: 10, content: { body: '' },
    });
  });

  /**
   * activities_content_shape keys off the type: a reading needs `body`, a
   * video needs `videoId`. Leaving the previous type's content in place makes
   * the insert fail on the constraint.
   */
  it('swaps the content fields when the type changes', async () => {
    mocks.useCourseForEditing.mockReturnValue(courseWith([mod()]));
    show();
    await userEvent.click(screen.getByRole('button', { name: '+ Add activity' }));

    expect(screen.getByLabelText('Text')).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Type'), 'video');
    expect(screen.queryByLabelText('Text')).not.toBeInTheDocument();
    expect(screen.getByLabelText('YouTube video ID')).toBeInTheDocument();
  });

  it('says what a submission activity needs, which is nothing', async () => {
    mocks.useCourseForEditing.mockReturnValue(courseWith([mod()]));
    show();
    await userEvent.click(screen.getByRole('button', { name: '+ Add activity' }));
    await userEvent.selectOptions(screen.getByLabelText('Type'), 'submission');
    expect(screen.getByText(/Nothing else to set up/)).toBeInTheDocument();
  });

  it('is honest that a quiz slot is not a quiz', async () => {
    mocks.useCourseForEditing.mockReturnValue(courseWith([mod()]));
    show();
    await userEvent.click(screen.getByRole('button', { name: '+ Add activity' }));
    await userEvent.selectOptions(screen.getByLabelText('Type'), 'quiz');
    expect(screen.getByText(/questions themselves are still/)).toBeInTheDocument();
  });

  /**
   * Only four of seven types are offered. The three that are missing store
   * structured content and each needs its own editor; saying so beats leaving
   * a picker that silently cannot make them.
   */
  it('offers only the types it can actually author, and says why', async () => {
    mocks.useCourseForEditing.mockReturnValue(courseWith([mod()]));
    show();
    await userEvent.click(screen.getByRole('button', { name: '+ Add activity' }));
    const options = within(screen.getByLabelText('Type'))
      .getAllByRole('option').map((o) => o.textContent);
    expect(options.join(' ')).not.toMatch(/Flashcards|Matching|Scenario/i);
    expect(screen.getByText(/still seeded/)).toBeInTheDocument();
  });

  it('will not submit without a title', async () => {
    mocks.useCourseForEditing.mockReturnValue(courseWith([mod()]));
    show();
    await userEvent.click(screen.getByRole('button', { name: '+ Add activity' }));
    expect(screen.getByRole('button', { name: 'Add activity' })).toBeDisabled();
  });

  // Held as a string so clearing the field does not put NaN in the value.
  it('rejects a non-numeric or negative XP', async () => {
    mocks.useCourseForEditing.mockReturnValue(courseWith([mod()]));
    show();
    await userEvent.click(screen.getByRole('button', { name: '+ Add activity' }));
    await userEvent.type(screen.getByLabelText('Title'), 'Read');
    const xp = screen.getByLabelText('XP');
    await userEvent.clear(xp);
    expect(screen.getByRole('button', { name: 'Add activity' })).toBeDisabled();
    await userEvent.type(xp, '-5');
    expect(screen.getByRole('button', { name: 'Add activity' })).toBeDisabled();
    await userEvent.clear(xp);
    await userEvent.type(xp, '0');
    expect(screen.getByRole('button', { name: 'Add activity' })).toBeEnabled();
  });

  it('surfaces a rejected insert', async () => {
    mocks.useCourseForEditing.mockReturnValue(courseWith([mod()]));
    mocks.state.createActivity = {
      isPending: false,
      error: new Error('new row violates check constraint "activities_content_shape"'),
    };
    show();
    await userEvent.click(screen.getByRole('button', { name: '+ Add activity' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/activities_content_shape/);
  });
});

describe('editing an activity', () => {
  it('saves the title, xp and content together', async () => {
    mocks.useCourseForEditing.mockReturnValue(courseWith([mod({ activities: [activity()] })]));
    show();
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    await userEvent.type(screen.getByLabelText('Text'), ' more');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(mocks.updateActivity).toHaveBeenCalledWith({
      id: 'a1', courseId: 'c1', title: 'Read this', xp: 10,
      content: { body: 'text more' },
    });
  });

  it('removes one', async () => {
    mocks.useCourseForEditing.mockReturnValue(courseWith([mod({ activities: [activity()] })]));
    show();
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(mocks.deleteActivity).toHaveBeenCalledWith({ id: 'a1', courseId: 'c1' });
  });
});

describe('failures', () => {
  it('shows an error rather than an empty course', () => {
    mocks.useCourseForEditing.mockReturnValue(query(undefined, { error: new Error('nope') }));
    show();
    expect(screen.getByRole('alert')).toHaveTextContent(/Could not load this course/);
  });

  it('distinguishes a missing course from a failed one', () => {
    mocks.useCourseForEditing.mockReturnValue(query(null));
    show();
    expect(screen.getByText(/does not exist, or you cannot edit it/)).toBeInTheDocument();
  });
});
