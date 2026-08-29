import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// This component had no test of its own, and a near-identical second copy of
// it lived inline in CoursePage — which had already drifted (only one of the
// two scrolled to the newest message). The copy is gone; this is what keeps
// the survivor honest.

const mocks = vi.hoisted(() => ({
  useCourseMessages: vi.fn(),
  send: vi.fn(),
  loadOlder: vi.fn(),
  profile: { id: 'me' },
}));

vi.mock('../../hooks/useMessages', () => ({
  useCourseMessages: mocks.useCourseMessages,
  useSendCourseMessage: () => ({
    mutate: mocks.send, isPending: false, error: null,
  }),
  useOlderCourseMessages: () => ({
    mutateAsync: mocks.loadOlder, isPending: false, error: null,
  }),
}));
vi.mock('../../hooks/useSession', () => ({
  useSession: () => ({ profile: mocks.profile }),
}));

const CourseChat = (await import('./CourseChat')).default;
const { MESSAGE_PAGE_SIZE, MAX_MESSAGE_LENGTH } = await import('../../api/messages');

const query = (data, over) => ({ data, isLoading: false, error: null, ...over });

const msg = (id, userId, body, minutesAgo = 0) => ({
  id,
  userId,
  body,
  senderName: userId === 'me' ? 'Me Myself' : 'Tara Trainer',
  senderRole: userId === 'me' ? 'trainee' : 'trainer',
  createdAt: new Date(Date.now() - minutesAgo * 60000).toISOString(),
});

const fullPage = () =>
  Array.from({ length: MESSAGE_PAGE_SIZE }, (_, i) =>
    msg(`m${i}`, 'other', `message ${i}`, MESSAGE_PAGE_SIZE - i));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.useCourseMessages.mockReturnValue(query([]));
});

describe('reading the conversation', () => {
  it('invites the first message when the thread is empty', () => {
    render(<CourseChat courseId="c1" />);
    expect(screen.getByText(/no messages yet/i)).toBeInTheDocument();
  });

  it('shows each message with who wrote it', () => {
    mocks.useCourseMessages.mockReturnValue(query([
      msg('m1', 'other', 'When is the deadline?'),
      msg('m2', 'me', 'Friday.'),
    ]));
    render(<CourseChat courseId="c1" />);

    expect(screen.getByText('When is the deadline?')).toBeInTheDocument();
    expect(screen.getByText('Tara Trainer')).toBeInTheDocument();
    // Your own messages say "You" rather than repeating your name back at you.
    expect(screen.getByText('You')).toBeInTheDocument();
  });

  it('surfaces a failed read instead of showing an empty thread', () => {
    mocks.useCourseMessages.mockReturnValue(
      query([], { error: new Error('nope') }));
    render(<CourseChat courseId="c1" />);
    // A blank thread and a failed read must not look the same.
    expect(screen.getByRole('heading', { name: /course chat/i })).toBeInTheDocument();
    expect(screen.queryByText(/no messages yet/i)).not.toBeInTheDocument();
  });

  /** Both call sites described the tab differently; the wording is a prop. */
  it('takes its subtitle from the caller', () => {
    render(<CourseChat courseId="c1" subtitle="Ask about this course." />);
    expect(screen.getByText('Ask about this course.')).toBeInTheDocument();
  });
});

describe('sending', () => {
  it('sends the typed message and clears the box', async () => {
    const user = userEvent.setup();
    render(<CourseChat courseId="c1" />);

    const box = screen.getByLabelText(/type your message/i);
    await user.type(box, 'Hello everyone');
    await user.click(screen.getByRole('button', { name: /send/i }));

    expect(mocks.send).toHaveBeenCalled();
    expect(mocks.send.mock.calls.at(-1)[0])
      .toMatchObject({ courseId: 'c1', body: 'Hello everyone' });
  });

  it('will not send whitespace', async () => {
    const user = userEvent.setup();
    render(<CourseChat courseId="c1" />);

    await user.type(screen.getByLabelText(/type your message/i), '   ');
    expect(screen.getByRole('button', { name: /send/i })).toBeDisabled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  /** The column caps the body; the input must not let one past it. */
  it('caps the box at the length the column accepts', () => {
    render(<CourseChat courseId="c1" />);
    expect(screen.getByLabelText(/type your message/i))
      .toHaveAttribute('maxlength', String(MAX_MESSAGE_LENGTH));
  });
});

describe('older messages', () => {
  /**
   * The read returns one page. Offering "load older" when a short page came
   * back would promise history that does not exist.
   */
  it('offers nothing more when the thread fits in one page', () => {
    mocks.useCourseMessages.mockReturnValue(query([msg('m1', 'other', 'Hi')]));
    render(<CourseChat courseId="c1" />);
    expect(screen.queryByRole('button', { name: /older/i })).not.toBeInTheDocument();
  });

  it('offers older messages when a full page came back', () => {
    mocks.useCourseMessages.mockReturnValue(query(fullPage()));
    render(<CourseChat courseId="c1" />);
    expect(screen.getByRole('button', { name: /older/i })).toBeInTheDocument();
  });

  it('asks for the page behind the oldest message on screen', async () => {
    const user = userEvent.setup();
    const page = fullPage();
    mocks.useCourseMessages.mockReturnValue(query(page));
    mocks.loadOlder.mockResolvedValue([msg('old1', 'other', 'the first thing said', 999)]);

    render(<CourseChat courseId="c1" />);
    await user.click(screen.getByRole('button', { name: /older/i }));

    expect(mocks.loadOlder).toHaveBeenCalledWith(page[0].createdAt);
    await waitFor(() =>
      expect(screen.getByText('the first thing said')).toBeInTheDocument());
  });

  /** A short page means the beginning has been reached. */
  it('stops offering once the history runs out', async () => {
    const user = userEvent.setup();
    mocks.useCourseMessages.mockReturnValue(query(fullPage()));
    mocks.loadOlder.mockResolvedValue([msg('old1', 'other', 'earliest', 999)]);

    render(<CourseChat courseId="c1" />);
    await user.click(screen.getByRole('button', { name: /older/i }));

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /older/i })).not.toBeInTheDocument());
  });
});
