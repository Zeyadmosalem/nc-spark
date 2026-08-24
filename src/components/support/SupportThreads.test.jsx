import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const mocks = vi.hoisted(() => ({
  threads: vi.fn(), messages: vi.fn(),
  create: vi.fn(), reply: vi.fn(), setStatus: vi.fn(),
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
}));
vi.mock('../../hooks/useSession', () => ({ useSession: () => mocks.session }));
vi.mock('../../hooks/useCourses', () => ({
  useMyEnrollments: mocks.enrollments,
  useCourses: mocks.courses,
}));
vi.mock('../ui/toast-context', () => ({ useToast: () => ({ notify: vi.fn() }) }));

const SupportThreads = (await import('./SupportThreads')).default;

const query = (data, over) => ({ data, isLoading: false, error: null, ...over });
const varsOf = (spy) => spy.mock.calls.at(-1)?.[0];

const thread = (over = {}) => ({
  id: 't1', authorId: 'me', authorName: 'Alice Ahmed', authorAvatar: 'AA',
  authorRole: 'trainee', courseId: 'c1', courseTitle: 'Fire Safety',
  subject: 'Module 2 will not open', status: 'open',
  createdAt: '2026-02-01T10:00:00Z', updatedAt: '2026-02-01T10:00:00Z',
  messageCount: 1, lastMessageAt: '2026-02-01T10:00:00Z',
  awaitingStaff: true, hasReply: false, ...over,
});

const show = (props) => render(
  <MemoryRouter><SupportThreads {...props} /></MemoryRouter>);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.state = { create: {}, reply: {} };
  mocks.session = { profile: { id: 'me', name: 'Alice Ahmed', role: 'trainee' } };
  mocks.threads.mockReturnValue(query([]));
  mocks.messages.mockReturnValue(query([]));
  mocks.enrollments.mockReturnValue(query([{ id: 'e1', courseId: 'c1', status: 'active' }]));
  mocks.courses.mockReturnValue(query([{ id: 'c1', title: 'Fire Safety' }]));
});

describe('filing a request', () => {
  it('offers no compose form to somebody who cannot create one', () => {
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

  /**
   * The dropdown decides who reads the request, and from the outside there is
   * nothing to suggest that. Leaving it blank has to be a real choice, not a
   * default nobody understood.
   */
  it('says that the course picker chooses the audience', async () => {
    show({ canCreate: true });
    await userEvent.click(screen.getAllByRole('button', { name: /Ask for help/ })[0]);
    const hint = screen.getByLabelText(/Which course/).getAttribute('aria-describedby');
    expect(document.getElementById(hint)).toHaveTextContent(/sends this to the trainer who runs it/);
    expect(document.getElementById(hint)).toHaveTextContent(/goes to an administrator instead/);
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
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
  });

  /** Only courses the author is actually on — you cannot ask about a stranger's. */
  it('offers only the courses the author is enrolled on', async () => {
    mocks.courses.mockReturnValue(query([
      { id: 'c1', title: 'Fire Safety' },
      { id: 'c2', title: 'Not mine' },
    ]));
    show({ canCreate: true });
    await userEvent.click(screen.getAllByRole('button', { name: /Ask for help/ })[0]);
    const options = within(screen.getByLabelText(/Which course/))
      .getAllByRole('option').map((o) => o.textContent);
    expect(options.join(' ')).toContain('Fire Safety');
    expect(options.join(' ')).not.toContain('Not mine');
  });
});

describe('the list', () => {
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
    expect(screen.getByText('Closed')).toBeInTheDocument();
    expect(screen.queryByText('Needs a reply')).not.toBeInTheDocument();
  });

  it('says a request with no course is general', () => {
    mocks.threads.mockReturnValue(query([thread({ courseId: null, courseTitle: null })]));
    show();
    expect(screen.getByText(/General/)).toBeInTheDocument();
  });

  it('starts collapsed and announces that it expands', () => {
    mocks.threads.mockReturnValue(query([thread()]));
    show();
    const head = screen.getByRole('button', { name: /Module 2 will not open/ });
    expect(head).toHaveAttribute('aria-expanded', 'false');
  });
});

describe('a thread', () => {
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
    await userEvent.click(screen.getByRole('button', { name: /Module 2 will not open/ }));
  };

  it('shows both sides, and names who answered', async () => {
    await open();
    expect(screen.getByText('It is still locked.')).toBeInTheDocument();
    expect(screen.getByText('Finish the quiz first.')).toBeInTheDocument();
    // The defect this guards: a trainee cannot read the trainer's profile row,
    // so the reply used to be attributed to "Unknown".
    expect(screen.getByText('Tara Trainer')).toBeInTheDocument();
    expect(screen.getByText('Trainer')).toBeInTheDocument();
  });

  it('marks the reader\'s own messages', async () => {
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
});

describe('a closed thread', () => {
  /**
   * The policy refuses a message on a closed thread, so hiding the box is not
   * a UI preference — a reply typed here would be rejected, and saying why
   * beats letting somebody write one and lose it.
   */
  it('offers no reply box, and says why', async () => {
    mocks.threads.mockReturnValue(query([thread({ status: 'closed' })]));
    mocks.messages.mockReturnValue(query([]));
    show();
    await userEvent.click(screen.getByRole('button', { name: /Module 2 will not open/ }));

    expect(screen.queryByLabelText(/Reply to/)).not.toBeInTheDocument();
    expect(screen.getByText(/would not reach anyone/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Reopen/ })).toBeInTheDocument();
  });

  it('reopens it', async () => {
    mocks.threads.mockReturnValue(query([thread({ status: 'closed' })]));
    show();
    await userEvent.click(screen.getByRole('button', { name: /Module 2 will not open/ }));
    await userEvent.click(screen.getByRole('button', { name: /Reopen/ }));
    expect(varsOf(mocks.setStatus)).toEqual({ requestId: 't1', status: 'open' });
  });
});

describe('when there is nothing', () => {
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
});
