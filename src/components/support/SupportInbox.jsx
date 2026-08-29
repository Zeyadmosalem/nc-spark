import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useSession } from '../../hooks/useSession';
import { useMyEnrollments, useCourses } from '../../hooks/useCourses';
import {
  useSupportThreads, useSupportMessages, useCreateSupportRequest,
  useReplyToSupport, useSetSupportStatus, useMarkSupportRead,
} from '../../hooks/useSupport';
import QueryError from '../shared/QueryError';
import PageSkeleton from '../ui/Skeleton';
import PageHeader from '../ui/PageHeader';
import EmptyState from '../ui/EmptyState';
import Button from '../ui/Button';
import Icon from '../ui/Icon';
import Alert from '../ui/Alert';
import { useToast } from '../ui/toast-context';
import { item, stagger, SPRING_SOFT, EASE_OUT } from '../../lib/motion';
import { formatDate } from '../../lib/format';

/**
 * Support, as an inbox.
 *
 * The first version was a list of cards that expanded in place. That works for
 * three threads and stops working at thirty: every open thread pushed the rest
 * off the screen, and there was no way to see what was waiting without
 * scrolling the lot.
 *
 * Two panes on a wide screen, one at a time on a narrow one — the same
 * structure every mail client uses, for the same reason. The narrow case is
 * not a fallback: on a phone the list and the conversation are separate
 * screens with a back button, which is what a phone wants anyway.
 *
 * Both sides of support are this component. What a trainer sees is decided by
 * RLS, not here.
 */

const ROLE_LABEL = {
  trainee: 'Trainee', trainer: 'Trainer', supervisor: 'Supervisor', admin: 'Administrator',
};

const FILTERS = {
  all: { label: 'All', match: () => true },
  unread: { label: 'Unread', match: (t) => t.unreadCount > 0 },
  open: { label: 'Open', match: (t) => t.status === 'open' },
  closed: { label: 'Closed', match: (t) => t.status === 'closed' },
};

const when = (iso) => {
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return '';
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return formatDate(iso, { year: false });
};

export default function SupportInbox({
  canCreate = false,
  eyebrow = 'Support',
  title = 'Support',
  subtitle,
  emptyTitle = 'Nothing here',
  emptyBody = 'No support requests yet.',
}) {
  const threads = useSupportThreads();
  const [openId, setOpenId] = useState(null);
  const [composing, setComposing] = useState(false);
  const [filter, setFilter] = useState('all');

  const all = useMemo(() => threads.data ?? [], [threads.data]);
  const shown = all.filter(FILTERS[filter].match);

  if (threads.isLoading) return <PageSkeleton label="Loading support" stats={0} rows={4} />;
  if (threads.error) {
    return (
      <div className="page-body">
        <QueryError error={threads.error} what="your support requests" />
      </div>
    );
  }

  const unread = all.filter((t) => t.unreadCount > 0).length;
  // Derived, not stored. A thread that disappears — closed, deleted, filtered
  // away — leaves `openId` pointing at nothing, and this resolves to null on
  // the next render without an effect having to notice and clear it.
  const selected = all.find((t) => t.id === openId) ?? null;

  return (
    <div className="page-body">
      <PageHeader
        eyebrow={eyebrow}
        icon="support"
        title={title}
        subtitle={subtitle ?? (all.length === 0
          ? undefined
          : `${all.filter((t) => t.status === 'open').length} open`
            + (unread ? `, ${unread} with something new` : ''))}
        actions={canCreate && !composing && (
          <Button variant="primary" icon="add" onClick={() => { setComposing(true); setOpenId(null); }}>
            Ask for help
          </Button>
        )}
      />

      {all.length === 0 && !composing ? (
        <EmptyState
          icon="support"
          title={emptyTitle}
          action={canCreate
            ? <Button variant="primary" icon="add" onClick={() => setComposing(true)}>Ask for help</Button>
            : undefined}
        >
          {emptyBody}
        </EmptyState>
      ) : (
        <div className={`inbox${(selected || composing) ? ' has-detail' : ''}`}>
          <div className="inbox-list">
            <div className="segmented" role="group" aria-label="Filter threads">
              {Object.entries(FILTERS).map(([value, { label }]) => {
                const count = all.filter(FILTERS[value].match).length;
                const active = filter === value;
                return (
                  <button
                    key={value} type="button" className="segment"
                    aria-pressed={active} onClick={() => setFilter(value)}
                  >
                    {active && (
                      <motion.span layoutId="inbox-filter" className="segment-indicator"
                                   transition={SPRING_SOFT} />
                    )}
                    <span className="segment-content">
                      {label}
                      {' '}
                      <span className="segment-count">{count}</span>
                    </span>
                  </button>
                );
              })}
            </div>

            {shown.length === 0 ? (
              <p className="text-sm muted" style={{ padding: '1rem 0.25rem' }}>
                Nothing {FILTERS[filter].label.toLowerCase()}.
              </p>
            ) : (
              <motion.ul className="inbox-threads" variants={stagger(0.03)}
                         initial="hidden" animate="visible">
                {shown.map((thread) => (
                  <ThreadRow
                    key={thread.id}
                    thread={thread}
                    selected={thread.id === openId}
                    onOpen={() => { setOpenId(thread.id); setComposing(false); }}
                  />
                ))}
              </motion.ul>
            )}
          </div>

          {/*
            No AnimatePresence. `mode="wait"` holds the outgoing pane for the
            length of its exit, so clicking from one thread to the next took
            two animations — about 400ms of the reader watching nothing. An
            inbox is clicked through quickly; the replacement should be
            immediate, and the entrance alone is enough to show it changed.
          */}
          <div className="inbox-detail">
            <>
              {composing ? (
                <motion.div
                  key="compose"
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }} transition={{ duration: 0.2, ease: EASE_OUT }}
                >
                  <NewRequestForm
                    onDone={(id) => { setComposing(false); if (id) setOpenId(id); }}
                  />
                </motion.div>
              ) : selected ? (
                <motion.div
                  key={selected.id}
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }} transition={{ duration: 0.2, ease: EASE_OUT }}
                >
                  <Thread thread={selected} onBack={() => setOpenId(null)} />
                </motion.div>
              ) : (
                <motion.div key="none" className="inbox-placeholder"
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <Icon name="inbox" size={26} />
                  <p className="text-sm muted">Pick a conversation to read it.</p>
                </motion.div>
              )}
            </>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------- list */

function ThreadRow({ thread, selected, onOpen }) {
  const { profile } = useSession();
  const mine = thread.authorId === profile?.id;
  const closed = thread.status === 'closed';

  return (
    <motion.li variants={item}>
      <button
        type="button"
        className={`inbox-thread${selected ? ' is-selected' : ''}${thread.unreadCount ? ' is-unread' : ''}`}
        aria-current={selected ? 'true' : undefined}
        onClick={onOpen}
      >
        <span className="avatar avatar-sm" aria-hidden="true">
          {thread.authorAvatar || thread.authorName.charAt(0)}
        </span>
        <span className="inbox-thread-main">
          <span className="inbox-thread-top">
            <span className="inbox-thread-subject">{thread.subject}</span>
            <span className="inbox-thread-time">{when(thread.lastMessageAt)}</span>
          </span>
          <span className="inbox-thread-meta">
            {mine ? 'You' : thread.authorName}
            {thread.courseTitle ? ` · ${thread.courseTitle}` : ' · General'}
          </span>
          <span className="inbox-thread-tags">
            {closed && <span className="badge-pill pill-neutral">Closed</span>}
            {!closed && thread.awaitingStaff && !mine && (
              <span className="badge-pill pill-warning">Needs a reply</span>
            )}
            {!closed && !thread.awaitingStaff && mine && thread.hasReply && (
              <span className="badge-pill pill-positive">Answered</span>
            )}
            {thread.unreadCount > 0 && (
              <span className="badge-dot" aria-hidden="true">{thread.unreadCount}</span>
            )}
            {/* The dot is decorative; this is what a screen reader gets. */}
            {thread.unreadCount > 0 && (
              <span className="sr-only">{thread.unreadCount} unread</span>
            )}
          </span>
        </span>
      </button>
    </motion.li>
  );
}

/* ----------------------------------------------------------- new request */

function NewRequestForm({ onDone }) {
  const { notify } = useToast();
  const create = useCreateSupportRequest();
  const enrollments = useMyEnrollments();
  const courses = useCourses();

  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [courseId, setCourseId] = useState('');

  const byId = new Map((courses.data ?? []).map((c) => [c.id, c]));
  const mine = (enrollments.data ?? [])
    .filter((e) => e.status === 'active' || e.status === 'completed')
    .map((e) => byId.get(e.courseId))
    .filter(Boolean);

  const problem = !subject.trim()
    ? 'Give it a subject, so whoever picks it up knows what it is about.'
    : !body.trim()
      ? 'Describe what is happening.'
      : null;

  function submit(e) {
    e.preventDefault();
    if (problem) return;
    create.mutate({ subject, body, courseId: courseId || null }, {
      onSuccess: (thread) => {
        notify('Sent. The reply arrives here.');
        onDone(thread?.id);
      },
    });
  }

  return (
    <form onSubmit={submit} className="card no-hover stack-md">
      <h2 className="card-title"><Icon name="support" size={16} />Ask for help</h2>

      <div className="field">
        <label className="input-label" htmlFor="support-subject">Subject</label>
        <input
          id="support-subject" className="input-field" maxLength={200} autoFocus
          placeholder="Module 2 will not open"
          value={subject} onChange={(e) => setSubject(e.target.value)}
        />
      </div>

      {/* A course is context for the administrator, not a routing choice. */}
      <div className="field">
        <label className="input-label" htmlFor="support-course">Which course? (optional)</label>
        <select
          id="support-course" className="input-field" value={courseId}
          onChange={(e) => setCourseId(e.target.value)}
          aria-describedby="support-course-hint"
        >
          <option value="">Not about a course — send to an administrator</option>
          {mine.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
        </select>
        <p id="support-course-hint" className="input-hint">
          This adds course context for an administrator. All support requests
          are answered by the admin team.
        </p>
      </div>

      <div className="field">
        <label className="input-label" htmlFor="support-body">What is happening?</label>
        <textarea
          id="support-body" className="input-field" rows={6} maxLength={4000}
          placeholder="I finished everything in module 1 but the next one is still locked."
          value={body} onChange={(e) => setBody(e.target.value)}
        />
      </div>

      {problem && <p className="input-hint input-hint-warn">{problem}</p>}
      <Alert error={create.error} />

      <div className="cluster">
        <Button type="submit" variant="primary" pending={create.isPending} disabled={Boolean(problem)}>
          Send
        </Button>
        <Button variant="ghost" onClick={() => onDone(null)}>Cancel</Button>
      </div>
    </form>
  );
}

/* ----------------------------------------------------------- one thread */

function Thread({ thread, onBack }) {
  const { profile } = useSession();
  const { notify } = useToast();
  const messages = useSupportMessages(thread.id);
  const reply = useReplyToSupport();
  const setStatus = useSetSupportStatus();
  const markRead = useMarkSupportRead();
  const [body, setBody] = useState('');
  const endRef = useRef(null);

  const closed = thread.status === 'closed';
  const mine = thread.authorId === profile?.id;

  // Opening a thread is what "read" means. Only when there is something to
  // clear, so switching between read threads does not write a row each time.
  const { mutate: mark } = markRead;
  const unread = thread.unreadCount;
  useEffect(() => {
    if (unread > 0) mark({ requestId: thread.id });
  }, [thread.id, unread, mark]);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [messages.data?.length]);

  function send(e) {
    e.preventDefault();
    if (!body.trim()) return;
    reply.mutate({ requestId: thread.id, body }, { onSuccess: () => setBody('') });
  }

  return (
    <section className="card no-hover thread-pane" aria-label={thread.subject}>
      <header className="thread-head">
        {/* Only reachable on a narrow screen, where the list is a separate
            view. On a wide one the list is still there beside this. */}
        <button type="button" className="btn btn-ghost btn-sm btn-icon thread-back"
                onClick={onBack} aria-label="Back to the list">
          <Icon name="back" size={16} />
        </button>
        <div className="grow">
          <h2 className="thread-subject">{thread.subject}</h2>
          <p className="thread-meta">
            {thread.courseTitle ?? 'General'}
            {' · '}
            {mine ? 'You asked' : `${thread.authorName} asked`}
          </p>
        </div>
        {closed && <span className="badge-pill pill-neutral push-end">Closed</span>}
      </header>

      {messages.isLoading && <p className="text-sm muted">Loading the conversation…</p>}
      {messages.error && <QueryError error={messages.error} what="this conversation" />}

      <div className="support-messages">
        {(messages.data ?? []).map((m) => {
          const own = m.authorId === profile?.id;
          return (
            <motion.div
              key={m.id}
              className={`support-message${own ? ' is-own' : ''}`}
              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
              transition={SPRING_SOFT}
            >
              <div className="support-message-meta">
                <strong>{own ? 'You' : m.authorName}</strong>
                {!own && m.authorRole && (
                  <span className="chip">{ROLE_LABEL[m.authorRole] ?? m.authorRole}</span>
                )}
                <span className="muted">{when(m.createdAt)}</span>
              </div>
              {/*
                Rendered as text, never as markup. This is the one place in the
                product where one user's words reach another's screen.
              */}
              <p className="support-message-body">{m.body}</p>
            </motion.div>
          );
        })}
        <div ref={endRef} />
      </div>

      {closed ? (
        <div className="support-closed">
          <p className="text-sm muted m-0">
            Closed. Reopen it to add anything else — a reply on a closed thread
            is refused, so it would not reach anyone.
          </p>
          <Button variant="secondary" size="sm" icon="retry" pending={setStatus.isPending}
                  onClick={() => setStatus.mutate(
                    { requestId: thread.id, status: 'open' },
                    { onSuccess: () => notify('Reopened.') })}>
            Reopen
          </Button>
        </div>
      ) : (
        <form onSubmit={send} className="support-reply">
          <label className="sr-only" htmlFor={`reply-${thread.id}`}>
            Reply to {thread.subject}
          </label>
          <textarea
            id={`reply-${thread.id}`} className="input-field" rows={3} maxLength={4000}
            placeholder={mine ? 'Add anything else…' : 'Write a reply…'}
            value={body} onChange={(e) => setBody(e.target.value)}
          />
          <div className="cluster">
            <Button type="submit" variant="primary" size="sm" icon="forward"
                    pending={reply.isPending} disabled={!body.trim()}>
              Send
            </Button>
            <Button variant="ghost" size="sm" icon="done" pending={setStatus.isPending}
                    onClick={() => setStatus.mutate(
                      { requestId: thread.id, status: 'closed' },
                      { onSuccess: () => notify('Closed.') })}>
              {mine ? 'This is sorted' : 'Mark resolved'}
            </Button>
          </div>
          <Alert error={reply.error ?? setStatus.error} />
        </form>
      )}
    </section>
  );
}
