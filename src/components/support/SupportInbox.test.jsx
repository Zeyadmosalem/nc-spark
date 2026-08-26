import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const mocks = vi.hoisted(() => ({
  threads: vi.fn(), messages: vi.fn(),
  create: vi.fn(), reply: vi.fn(), setStatus: vi.fn(), markRead: vi.fn(),
  enrollments: vi.fn(), courses: vi.fn(),
  session: { profile: { id: 'me', name: 'Alice Ahmed', role: 'trainee' } },
  state: { create: {}, reply: {} },
}));

const asMutation = (spy, extra = {}) => ({
  mutate: spy, isPending: false, error: null, ...extra,
});

vi.mock('../../hooks/useSupport', () => ({
  useSupportThreads: mocks.threads,
  useSupportMessages: mocks.messages,
  useCreateSupportRequest: () => asMutation(mocks.create, mocks.state.create),
  useReplyToSupport: () => asMutation(mocks.reply, mocks.state.reply),
  useSetSupportStatus: () => asMutation(mocks.setStatus),
  useMarkSupportRead: () => asMutation(mocks.markRead),
}));
vi.mock('../../hooks/useSession', () => ({ useSession: () => mocks.session }));
vi.mock('../../hooks/useCourses', () => ({
  useMyEnrollments: mocks.enrollments, useCourses: mocks.courses,
}));
vi.mock('../ui/toast-context', () => ({ useToast: () => ({ notify: vi.fn() }) }));

const SupportInbox = (await import('./SupportInbox')).default;

const query = (data, over) => ({ data, isLoading: false, error: null, ...over });
const varsOf = (spy) => spy.mock.calls.at(-1)?.[0];

const thread = (over = {}) => ({
  id: 't1', authorId: 'me', authorName: 'Alice Ahmed', authorAvatar: 'AA',
  authorRole: 'trainee', courseId: 'c1', courseTitle: 'Fire Safety',
  subject: 'Module 2 will not open', status: 'open',
  createdAt: '2026-02-01T10:00:00Z', updatedAt: '2026-02-01T10:00:00Z',
  messageCount: 1, lastMessageAt: '2026-02-01T10:00:00Z',
  awaitingStaff: true, hasReply: false, unreadCount: 0, ...over,
});

const show = (props) => render(
  <MemoryRouter><SupportInbox {...props} /></MemoryRouter>);

const openThread = async (name = /Module 2 will not open/) =>
  userEvent.click(screen.getByRole('button', { name }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.state = { create: {}, reply: {} };
  mocks.session = { profile: { id: 'me', name: 'Alice Ahmed', role: 'trainee' } };
  mocks.threads.mockReturnValue(query([]));
  mocks.messages.mockReturnValue(query([]));
  mocks.enrollments.mockReturnValue(query([{ id: 'e1', courseId: 'c1', status: 'active' }]));
  mocks.courses.mockReturnValue(query([{ id: 'c1', title: 'Fire Safety' }]));
});

describe('the inbox', () => {
  it('shows nothing selected until a thread is picked', () => {
    mocks.threads.mockReturnValue(query([thread()]));
    show();
    expect(screen.getByText('Pick a conversation to read it.')).toBeInTheDocument();
  });

  it('opens a thread and reads it', async () => {
    mocks.threads.mockReturnValue(query([thread()]));
    mocks.messages.mockReturnValue(query([{
      id: 'm1', authorId: 'me', authorName: 'Alice Ahmed', authorRole: 'trainee',
      body: 'It is still locked.', createdAt: '2026-02-01T10:00:00Z',
    }]));
    show();
    await openThread();
    expect(screen.getByText('It is still locked.')).toBeInTheDocument();
    expect(screen.queryByText('Pick a conversation to read it.')).not.toBeInTheDocument();
  });

  /** A count in a column of thirty is easy to miss; weight is not. */
  it('marks an unread thread in the list', () => {
    mocks.threads.mockReturnValue(query([thread({ unreadCount: 2 })]));
    show();
    const row = screen.getByRole('button', { name: /Module 2 will not open/ });
    expect(row.className).toContain('is-unread');
    expect(within(row).getByText('2 unread')).toBeInTheDocument();
  });

  it('marks it read on opening, and only when there is something to clear', async () => {
    mocks.threads.mockReturnValue(query([thread({ unreadCount: 2 })]));
    show();
    await openThread();
    expect(varsOf(mocks.markRead)).toEqual({ requestId: 't1' });
  });

  it('does not write a read marker for a thread with nothing new', async () => {
    mocks.threads.mockReturnValue(query([thread({ unreadCount: 0 })]));
    show();
    await openThread();
    expect(mocks.markRead).not.toHaveBeenCalled();
  });

  /**
   * openId is state but `selected` is derived from the current list, so a
   * thread that vanishes cannot leave the detail pane showing something the
   * list no longer has.
   */
  it('shows nothing when the open thread leaves the list', async () => {
    mocks.threads.mockReturnValue(query([thread()]));
    const { rerender } = show();
    await openThread();
    expect(screen.getByRole('heading', { name: 'Module 2 will not open' })).toBeInTheDocument();

    mocks.threads.mockReturnValue(query([]));
    rerender(<MemoryRouter><SupportInbox /></MemoryRouter>);
    expect(screen.queryByRole('heading', { name: 'Module 2 will not open' })).not.toBeInTheDocument();
  });
});

describe('filtering', () => {
  const three = () => query([
    thread({ id: 't1', subject: 'Unread one', unreadCount: 1 }),
    thread({ id: 't2', subject: 'Open one' }),
    thread({ id: 't3', subject: 'Closed one', status: 'closed' }),
  ]);

  it('counts each filter before it is chosen', () => {
    mocks.threads.mockReturnValue(three());
    show();
    expect(screen.getByRole('button', { name: 'All 3' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Unread 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Closed 1' })).toBeInTheDocument();
  });

  it('narrows to unread', async () => {
    mocks.threads.mockReturnValue(three());
    show();
    await userEvent.click(screen.getByRole('button', { name: 'Unread 1' }));
    expect(screen.getByText('Unread one')).toBeInTheDocument();
    expect(screen.queryByText('Open one')).not.toBeInTheDocument();
  });

  it('says so when a filter is empty', async () => {
    mocks.threads.mockReturnValue(query([thread()]));
    show();
    await userEvent.click(screen.getByRole('button', { name: /Closed/ }));
    expect(screen.getByText('Nothing closed.')).toBeInTheDocument();
  });
});

describe('status', () => {
  it('flags a thread waiting on the reader when they are staff', () => {
    mocks.session = { profile: { id: 'staff', name: 'Tara', role: 'trainer' } };
    mocks.threads.mockReturnValue(query([thread({ awaitingStaff: true })]));
    show();
    expect(screen.getByText('Needs a reply')).toBeInTheDocument();
  });

  /** The author is not the one who owes a reply, so they must not be nagged. */
  it('does not tell the author their own thread needs a reply', () => {
    mocks.threads.mockReturnValue(query([thread({ awaitingStaff: true })]));
    show();
    expect(screen.queryByText('Needs a reply')).not.toBeInTheDocument();
  });

  it('tells the author when it has been answered', () => {
    mocks.threads.mockReturnValue(query([
      thread({ awaitingStaff: false, hasReply: true, messageCount: 2 }),
    ]));
    show();
    expect(screen.getByText('Answered')).toBeInTheDocument();
  });

  /** A closed thread is not waiting on anybody, whatever the flag says. */
  it('shows a closed thread as closed rather than as waiting', () => {
    mocks.session = { profile: { id: 'staff', name: 'Tara', role: 'trainer' } };
    mocks.threads.mockReturnValue(query([thread({ status: 'closed', awaitingStaff: true })]));
    show();
    expect(screen.getAllByText('Closed').length).toBeGreaterThan(0);
    expect(screen.queryByText('Needs a reply')).not.toBeInTheDocument();
  });
});

describe('filing a request', () => {
  it('offers no compose form to somebody who cannot create one', () => {
    mocks.threads.mockReturnValue(query([thread()]));
    show();
    expect(screen.queryByRole('button', { name: /Ask for help/ })).not.toBeInTheDocument();
  });

  it('sends the subject, the body and the course', async () => {
    show({ canCreate: true });
    await userEvent.click(screen.getAllByRole('button', { name: /Ask for help/ })[0]);
    await userEvent.type(screen.getByLabelText('Subject'), 'Module 2 will not open');
    await userEvent.type(screen.getByLabelText('What is happening?'), 'It is still locked.');
    await userEvent.selectOptions(screen.getByLabelText(/Which course/), 'c1');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(varsOf(mocks.create)).toEqual({
      subject: 'Module 2 will not open',
      body: 'It is still locked.',
      courseId: 'c1',
    });
  });

  it('says that course context still goes to the administrator team', async () => {
    show({ canCreate: true });
    await userEvent.click(screen.getAllByRole('button', { name: /Ask for help/ })[0]);
    const hint = screen.getByLabelText(/Which course/).getAttribute('aria-describedby');
    expect(document.getElementById(hint)).toHaveTextContent(/course context for an administrator/);
    expect(document.getElementById(hint)).toHaveTextContent(/All support requests are answered by the admin team/);
  });

  it('sends null rather than an empty course id', async () => {
    show({ canCreate: true });
    await userEvent.click(screen.getAllByRole('button', { name: /Ask for help/ })[0]);
    await userEvent.type(screen.getByLabelText('Subject'), 'General');
    await userEvent.type(screen.getByLabelText('What is happening?'), 'Not about a course.');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(varsOf(mocks.create).courseId).toBeNull();
  });

  it('will not send without a subject or a body', async () => {
    show({ canCreate: true });
    await userEvent.click(screen.getAllByRole('button', { name: /Ask for help/ })[0]);
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    expect(screen.getByText(/Give it a subject/)).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Subject'), 'Only a subject');
    expect(screen.getByText('Describe what is happening.')).toBeInTheDocument();
  });

  /** Only courses the author is on — you cannot ask about a stranger's. */
  it('offers only the courses the author is enrolled on', async () => {
    mocks.courses.mockReturnValue(query([
      { id: 'c1', title: 'Fire Safety' }, { id: 'c2', title: 'Not mine' },
    ]));
    show({ canCreate: true });
    await userEvent.click(screen.getAllByRole('button', { name: /Ask for help/ })[0]);
    const options = within(screen.getByLabelText(/Which course/))
      .getAllByRole('option').map((o) => o.textContent).join(' ');
    expect(options).toContain('Fire Safety');
    expect(options).not.toContain('Not mine');
  });
});

describe('a conversation', () => {
  const open = async () => {
    mocks.threads.mockReturnValue(query([thread({ messageCount: 2, hasReply: true })]));
    mocks.messages.mockReturnValue(query([
      {
        id: 'm1', authorId: 'me', authorName: 'Alice Ahmed', authorRole: 'trainee',
        body: 'It is still locked.', createdAt: '2026-02-01T10:00:00Z',
      },
      {
        id: 'm2', authorId: 'staff', authorName: 'Tara Trainer', authorRole: 'trainer',
        body: 'Finish the quiz first.', createdAt: '2026-02-01T11:00:00Z',
      },
    ]));
    show();
    await openThread();
  };

  it('shows both sides, and names who answered', async () => {
    await open();
    expect(screen.getByText('It is still locked.')).toBeInTheDocument();
    expect(screen.getByText('Finish the quiz first.')).toBeInTheDocument();
    // A trainee cannot read the trainer's profiles row, so the name comes from
    // public_profiles. Without it every staff reply read as "Unknown".
    expect(screen.getByText('Tara Trainer')).toBeInTheDocument();
    expect(screen.getByText('Trainer')).toBeInTheDocument();
  });

  it("marks the reader's own messages", async () => {
    await open();
    expect(screen.getByText('You')).toBeInTheDocument();
  });

  it('sends a reply', async () => {
    await open();
    await userEvent.type(screen.getByLabelText(/Reply to/), 'I already did.');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(varsOf(mocks.reply)).toEqual({ requestId: 't1', body: 'I already did.' });
  });

  it('will not send an empty reply', async () => {
    await open();
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
  });

  it('closes the thread', async () => {
    await open();
    await userEvent.click(screen.getByRole('button', { name: /This is sorted/ }));
    expect(varsOf(mocks.setStatus)).toEqual({ requestId: 't1', status: 'closed' });
  });

  /**
   * The policy refuses a message on a closed thread, so hiding the box is not
   * a UI preference — a reply typed here would be rejected, and saying why
   * beats letting somebody write one and lose it.
   */
  it('offers no reply box on a closed thread, and says why', async () => {
    mocks.threads.mockReturnValue(query([thread({ status: 'closed' })]));
    show();
    await openThread();
    expect(screen.queryByLabelText(/Reply to/)).not.toBeInTheDocument();
    expect(screen.getByText(/would not reach anyone/)).toBeInTheDocument();
  });

  it('reopens a closed thread', async () => {
    mocks.threads.mockReturnValue(query([thread({ status: 'closed' })]));
    show();
    await openThread();
    await userEvent.click(screen.getByRole('button', { name: /Reopen/ }));
    expect(varsOf(mocks.setStatus)).toEqual({ requestId: 't1', status: 'open' });
  });

  /** The back control only matters on a narrow screen, where the list is hidden. */
  it('can go back to the list', async () => {
    await open();
    await userEvent.click(screen.getByRole('button', { name: 'Back to the list' }));
    expect(screen.getByText('Pick a conversation to read it.')).toBeInTheDocument();
  });
});

describe('when it cannot load', () => {
  it('uses the empty text it was given', () => {
    show({ emptyTitle: 'Nothing to answer', emptyBody: 'Nobody has asked.' });
    expect(screen.getByText('Nothing to answer')).toBeInTheDocument();
    expect(screen.getByText('Nobody has asked.')).toBeInTheDocument();
  });

  it('reports a failure rather than an empty inbox', () => {
    mocks.threads.mockReturnValue(query(undefined, { error: new Error('nope') }));
    show();
    expect(screen.getByRole('alert'))
      .toHaveTextContent(/Could not load your support requests/);
  });

  it('reports a conversation that will not load', async () => {
    mocks.threads.mockReturnValue(query([thread()]));
    mocks.messages.mockReturnValue(query(undefined, { error: new Error('No such request') }));
    show();
    await openThread();
    expect(screen.getByRole('alert')).toHaveTextContent(/Could not load this conversation/);
  });
});
