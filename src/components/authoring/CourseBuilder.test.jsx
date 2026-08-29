import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const mocks = vi.hoisted(() => ({
  useCourseForEditing: vi.fn(),
  createModule: vi.fn(), updateModule: vi.fn(), deleteModule: vi.fn(),
  createActivity: vi.fn(), updateActivity: vi.fn(), deleteActivity: vi.fn(),
  courseMessages: vi.fn(), sendCourseMessage: vi.fn(),
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

vi.mock('../../hooks/useMessages', () => ({
  useCourseMessages: () => query(mocks.courseMessages()),
  useSendCourseMessage: () => asMutation(mocks.sendCourseMessage),
  // CourseChat offers "load older" once a full page comes back. This file is
  // about modules and activities; CourseChat.test.jsx covers the paging.
  useOlderCourseMessages: () => asMutation(vi.fn()),
}));

// Materials have their own tests and their own queries; this file is about
// modules and activities.
vi.mock('../shared/CourseMaterials', () => ({
  default: ({ canManage }) => <div data-testid="materials" data-can-manage={String(canManage)} />,
}));

const CourseBuilder = (await import('./CourseBuilder')).default;

const query = (data, over) => ({ data, isLoading: false, error: null, ...over });
/**
 * The variables a mutation was called with. mutate now takes a second argument
 * — the per-call { onSuccess } that fires the confirmation toast — so a bare
 * toHaveBeenCalledWith fails on the argument count while saying nothing about
 * what reached the server.
 */
const varsOf = (spy) => spy.mock.calls.at(-1)?.[0];


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
  mocks.courseMessages.mockReturnValue([]);
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
    expect(varsOf(mocks.updateModule)).toEqual({
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
    expect(varsOf(mocks.updateModule)).toEqual({
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
    expect(varsOf(mocks.deleteModule)).toEqual({ id: 'm1', courseId: 'c1' });
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

  /**
   * A quiz hangs off an activity_id, so there is nothing to attach one to
   * until the activity has been saved. Saying where the questions are written
   * beats a form that cannot work yet.
   */
  it('points at where the questions are written', async () => {
    mocks.useCourseForEditing.mockReturnValue(courseWith([mod()]));
    show();
    await userEvent.click(screen.getByRole('button', { name: '+ Add activity' }));
    await userEvent.selectOptions(screen.getByLabelText('Type'), 'quiz');
    expect(screen.getByText(/Add the activity first, then open it/)).toBeInTheDocument();
  });

  /**
   * Every type the trainee side can render. flashcards, matching and scenario
   * were offered by neither the picker nor any other screen for a milestone,
   * so three of the six renderers had no way to be given content.
   */
  it('offers every type the trainee side can render', async () => {
    mocks.useCourseForEditing.mockReturnValue(courseWith([mod()]));
    show();
    await userEvent.click(screen.getByRole('button', { name: '+ Add activity' }));
    const options = within(screen.getByLabelText('Type'))
      .getAllByRole('option').map((o) => o.textContent).join(' ');
    for (const label of ['Reading', 'Video', 'File submission', 'Quiz',
                         'Flashcards', 'Matching', 'Scenario']) {
      expect(options).toContain(label);
    }
  });

  /** Picking a structured type has to produce its editor, not an empty gap. */
  it.each([
    ['flashcards', 'Front'],
    ['matching', 'Term'],
    ['scenario', 'What is happening'],
  ])('shows the %s editor when it is picked', async (type, field) => {
    mocks.useCourseForEditing.mockReturnValue(courseWith([mod()]));
    show();
    await userEvent.click(screen.getByRole('button', { name: '+ Add activity' }));
    await userEvent.selectOptions(screen.getByLabelText('Type'), type);
    expect(screen.getByLabelText(field)).toBeInTheDocument();
  });

  /**
   * The CHECK constraint accepts a card with no text on it, so nothing but
   * this stops an activity that renders as a blank flashcard.
   */
  it('will not add a structured activity that is still blank', async () => {
    mocks.useCourseForEditing.mockReturnValue(courseWith([mod()]));
    show();
    await userEvent.click(screen.getByRole('button', { name: '+ Add activity' }));
    await userEvent.selectOptions(screen.getByLabelText('Type'), 'flashcards');
    await userEvent.type(screen.getByLabelText('Title'), 'Key terms');

    const submit = screen.getByRole('button', { name: 'Add activity' });
    expect(submit).toBeDisabled();
    expect(screen.getByText('Card 1 needs both a front and a back.')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Front'), 'PPE');
    await userEvent.type(screen.getByLabelText('Back'), 'Personal Protective Equipment');
    expect(submit).toBeEnabled();
  });

  it('sends the authored cards with the new activity', async () => {
    mocks.useCourseForEditing.mockReturnValue(courseWith([mod()]));
    show();
    await userEvent.click(screen.getByRole('button', { name: '+ Add activity' }));
    await userEvent.selectOptions(screen.getByLabelText('Type'), 'flashcards');
    await userEvent.type(screen.getByLabelText('Title'), 'Key terms');
    await userEvent.type(screen.getByLabelText('Front'), 'PPE');
    await userEvent.type(screen.getByLabelText('Back'), 'Personal Protective Equipment');
    await userEvent.click(screen.getByRole('button', { name: 'Add activity' }));

    expect(mocks.createActivity.mock.calls.at(-1)[0]).toMatchObject({
      type: 'flashcards',
      title: 'Key terms',
      content: { cards: [{ front: 'PPE', back: 'Personal Protective Equipment' }] },
    });
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
    expect(varsOf(mocks.updateActivity)).toEqual({
      id: 'a1', courseId: 'c1', title: 'Read this', xp: 10,
      content: { body: 'text more' },
    });
  });

  it('removes one', async () => {
    mocks.useCourseForEditing.mockReturnValue(courseWith([mod({ activities: [activity()] })]));
    show();
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(varsOf(mocks.deleteActivity)).toEqual({ id: 'a1', courseId: 'c1' });
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

describe('materials', () => {
  /**
   * course_materials, its RLS and the private bucket have existed since M3
   * with nothing reading them. The same component the trainee sees is mounted
   * here with its controls on: course_materials_write already limits those to
   * an admin or the owning trainer.
   */
  it('offers the materials editor with management turned on', () => {
    mocks.useCourseForEditing.mockReturnValue(courseWith([mod()]));
    show();
    expect(screen.getByTestId('materials')).toHaveAttribute('data-can-manage', 'true');
  });
});
