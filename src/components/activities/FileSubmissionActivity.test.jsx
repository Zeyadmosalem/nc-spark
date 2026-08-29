import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// The one activity that writes to Storage. What matters here is that the
// completion carries the path the file actually landed at — a trainer marking
// this work has nothing else to open — and that a failed upload says so
// instead of looking like a success.

const mocks = vi.hoisted(() => ({ uploadSubmission: vi.fn() }));
vi.mock('../../api/storage', () => ({ uploadSubmission: mocks.uploadSubmission }));

const FileSubmissionActivity = (await import('./FileSubmissionActivity')).default;

const ACTIVITY = {
  courseId: 'course-1',
  traineeId: 'trainee-1',
  description: 'Upload your risk assessment.',
};

const aFile = (name = 'assessment.pdf') =>
  new File(['hello'], name, { type: 'application/pdf' });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.uploadSubmission.mockResolvedValue({ path: 'course-1/trainee-1/assessment.pdf' });
});

/** The input is the only thing a test can drive; the drop zone wraps it. */
const fileInput = (container) => container.querySelector('input[type="file"]');

describe('choosing a file', () => {
  it('shows the prompt before anything is chosen', () => {
    render(<FileSubmissionActivity activity={ACTIVITY} />);
    expect(screen.getByText(/choose a file, or drop one here/i)).toBeInTheDocument();
    // The description belongs to ActivityWrapper, which prints it under the
    // title. Rendering it here too put the same sentence on screen twice.
    expect(screen.queryByText(/upload your risk assessment/i)).not.toBeInTheDocument();
  });

  it('names the chosen file and offers to upload it', async () => {
    const user = userEvent.setup();
    const { container } = render(<FileSubmissionActivity activity={ACTIVITY} />);

    await user.upload(fileInput(container), aFile());

    expect(screen.getByText('assessment.pdf')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /upload file/i })).toBeInTheDocument();
  });

  it('offers no upload button until a file is chosen', () => {
    render(<FileSubmissionActivity activity={ACTIVITY} />);
    expect(screen.queryByRole('button', { name: /upload file/i })).not.toBeInTheDocument();
  });
});

describe('uploading', () => {
  /**
   * The whole point of the activity. onComplete carries the storage path, and
   * a trainer marking this submission has nothing else to open — a completion
   * without it is a record that something was handed in and no way to read it.
   */
  it('reports the storage path the file landed at', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    const { container } = render(
      <FileSubmissionActivity activity={ACTIVITY} onComplete={onComplete} />);

    await user.upload(fileInput(container), aFile());
    await user.click(screen.getByRole('button', { name: /upload file/i }));

    await waitFor(() => expect(onComplete).toHaveBeenCalled());
    expect(onComplete.mock.calls.at(-1)[0]).toEqual({
      storagePath: 'course-1/trainee-1/assessment.pdf',
      filename: 'assessment.pdf',
    });
  });

  it('uploads for the right trainee on the right course', async () => {
    const user = userEvent.setup();
    const { container } = render(<FileSubmissionActivity activity={ACTIVITY} />);

    await user.upload(fileInput(container), aFile());
    await user.click(screen.getByRole('button', { name: /upload file/i }));

    await waitFor(() => expect(mocks.uploadSubmission).toHaveBeenCalled());
    expect(mocks.uploadSubmission.mock.calls.at(-1)[0]).toMatchObject({
      courseId: 'course-1', traineeId: 'trainee-1',
    });
  });

  it('confirms the submission afterwards', async () => {
    const user = userEvent.setup();
    const { container } = render(<FileSubmissionActivity activity={ACTIVITY} />);

    await user.upload(fileInput(container), aFile());
    await user.click(screen.getByRole('button', { name: /upload file/i }));

    await waitFor(() =>
      expect(screen.getByText(/assignment submitted/i)).toBeInTheDocument());
  });
});

describe('when the upload fails', () => {
  /**
   * A failed upload that looks like a success is the worst outcome here: the
   * trainee believes the work is handed in and the trainer never receives it.
   */
  it('says so, and does not report a completion', async () => {
    mocks.uploadSubmission.mockRejectedValue(new Error('Storage is unreachable'));
    const user = userEvent.setup();
    const onComplete = vi.fn();
    const { container } = render(
      <FileSubmissionActivity activity={ACTIVITY} onComplete={onComplete} />);

    await user.upload(fileInput(container), aFile());
    await user.click(screen.getByRole('button', { name: /upload file/i }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Storage is unreachable'));
    expect(onComplete).not.toHaveBeenCalled();
    expect(screen.queryByText(/assignment submitted/i)).not.toBeInTheDocument();
  });

  it('lets them try again', async () => {
    mocks.uploadSubmission.mockRejectedValueOnce(new Error('Network blip'));
    const user = userEvent.setup();
    const { container } = render(<FileSubmissionActivity activity={ACTIVITY} />);

    await user.upload(fileInput(container), aFile());
    await user.click(screen.getByRole('button', { name: /upload file/i }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /upload file/i }));
    await waitFor(() =>
      expect(screen.getByText(/assignment submitted/i)).toBeInTheDocument());
  });
});

describe('reaching it without a mouse', () => {
  /**
   * The drop zone was a plain <div> with an onClick, wrapping a file input
   * hidden with display:none. Neither is focusable, so there was no keyboard
   * route to the file picker at all: a trainee using a keyboard or a screen
   * reader could not hand in an assignment.
   */
  it('exposes a focusable control that opens the file picker', async () => {
    const user = userEvent.setup();
    render(<FileSubmissionActivity activity={ACTIVITY} />);

    const chooser = screen.getByLabelText(/choose a file/i);
    expect(chooser).toHaveAttribute('type', 'file');

    // Reachable by tabbing, which display:none made impossible.
    await user.tab();
    await waitFor(() => expect(chooser).toHaveFocus());
  });
});

describe('without an activity', () => {
  it('says so rather than crashing', () => {
    render(<FileSubmissionActivity />);
    expect(screen.getByText('No activity provided.')).toBeInTheDocument();
  });
});
