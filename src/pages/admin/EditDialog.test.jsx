import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// A thin wrapper, with one decision in it: the dialog owns its own mutation so
// the pending state belongs to the course being edited rather than to a shared
// one. The other thing worth pinning is that a refused save keeps the dialog
// open — closing it would throw away what the user typed and show a toast
// saying it had been saved.

const mocks = vi.hoisted(() => ({
  useUpdateCourse: vi.fn(), notify: vi.fn(), dialog: vi.fn(),
}));
vi.mock('../../hooks/useCourses', () => ({ useUpdateCourse: mocks.useUpdateCourse }));
vi.mock('../../components/ui/toast-context', () => ({ useToast: () => ({ notify: mocks.notify }) }));
vi.mock('./CourseDialog', () => ({
  default: (props) => {
    mocks.dialog(props);
    return (
      <form onSubmit={props.onSubmit}>
        <h2>{props.title}</h2>
        {props.error ? <p role="alert">{props.error.message}</p> : null}
        <button type="submit" disabled={props.submitting}>{props.submitLabel}</button>
        <button type="button" onClick={props.onCancel}>Cancel</button>
      </form>
    );
  },
}));

const EditDialog = (await import('./EditDialog')).default;

const COURSE = { id: 'c1', title: 'Fire Safety' };
const FORM = { title: 'Fire Safety', description: 'Updated' };

const mutation = (over = {}) => ({
  mutateAsync: vi.fn().mockResolvedValue({}), isPending: false, error: null, ...over,
});

let update;
beforeEach(() => {
  vi.clearAllMocks();
  update = mutation();
  mocks.useUpdateCourse.mockReturnValue(update);
});

const show = (onClose = vi.fn()) => {
  render(<EditDialog course={COURSE} form={FORM} setForm={vi.fn()} onClose={onClose} />);
  return onClose;
};

describe('the dialog', () => {
  it('names the course being edited', () => {
    show();
    expect(screen.getByText('Edit Fire Safety')).toBeInTheDocument();
  });

  it('labels the action as saving rather than creating', () => {
    show();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument();
  });

  it('closes on cancel without saving', async () => {
    const user = userEvent.setup();
    const onClose = show();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalled();
    expect(update.mutateAsync).not.toHaveBeenCalled();
  });
});

describe('saving', () => {
  it('sends the course id with the edited fields', async () => {
    const user = userEvent.setup();
    show();

    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(update.mutateAsync).toHaveBeenCalledWith({ id: 'c1', ...FORM });
  });

  it('confirms and closes once it lands', async () => {
    const user = userEvent.setup();
    const onClose = show();

    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(mocks.notify).toHaveBeenCalledWith('Course details saved.');
    expect(onClose).toHaveBeenCalled();
  });

  /**
   * A refusal must not close the dialog. Closing it would discard what the
   * user typed, and the toast would claim it had been saved.
   */
  it('keeps the dialog open when the save is refused', async () => {
    update.mutateAsync.mockRejectedValue(new Error('A course needs a title'));
    const user = userEvent.setup();
    const onClose = show();

    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(onClose).not.toHaveBeenCalled();
    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it('shows the reason the save was refused', () => {
    mocks.useUpdateCourse.mockReturnValue(mutation({ error: new Error('A course needs a title') }));
    show();
    expect(screen.getByRole('alert')).toHaveTextContent('A course needs a title');
  });

  /** Its own mutation, so a save on one course does not grey out another. */
  it('disables the button only while its own save is in flight', () => {
    mocks.useUpdateCourse.mockReturnValue(mutation({ isPending: true }));
    show();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  });
});
