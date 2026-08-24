import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSession } from '../../hooks/useSession';
import { useMyEnrollments, useCourses } from '../../hooks/useCourses';
import {
  useSupportThreads, useSupportMessages, useCreateSupportRequest,
  useReplyToSupport, useSetSupportStatus,
} from '../../hooks/useSupport';
import QueryError from '../shared/QueryError';
import PageSkeleton from '../ui/Skeleton';
import PageHeader from '../ui/PageHeader';
import EmptyState from '../ui/EmptyState';
import Button from '../ui/Button';
import Icon from '../ui/Icon';
import Alert from '../ui/Alert';
import StatusPill from '../ui/StatusPill';
import { useToast } from '../ui/toast-context';
import { stagger, item, collapse, SPRING_SOFT } from '../../lib/motion';

/**
 * Support, for both sides of it.
 *
 * The trainee page and the staff inbox are the same screen: a list of threads,
 * one of them open, and a box to add to it. The only differences are whether
 * you may start one and what the empty state should say, so they are props
 * rather than two components that would drift.
 *
 * What a trainer sees is decided by RLS, not here: a request tagged with a
 * course reaches whoever teaches it, one without goes to administrators. This
 * component renders whatever supportThreads() returns.
 */

const ROLE_LABEL = {
  trainee: 'Trainee', trainer: 'Trainer', supervisor: 'Supervisor', admin: 'Administrator',
};

const when = (iso) => {
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return '';
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};

export default function SupportThreads({
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

  if (threads.isLoading) return <PageSkeleton label="Loading support" stats={0} rows={3} />;
  if (threads.error) {
    return (
      <div className="page-body">
        <QueryError error={threads.error} what="your support requests" />
      </div>
    );
  }

  const all = threads.data ?? [];
  const open = all.filter((t) => t.status === 'open');
  const waiting = open.filter((t) => t.awaitingStaff);

  return (
    <div className="page-body">
      <PageHeader
        eyebrow={eyebrow}
        icon="support"
        title={title}
        subtitle={subtitle ?? (all.length === 0
          ? undefined
          : `${open.length} open, ${waiting.length} waiting on a reply.`)}
        actions={canCreate && !composing && (
          <Button variant="primary" icon="add" onClick={() => setComposing(true)}>
            Ask for help
          </Button>
        )}
      />

      <AnimatePresence initial={false}>
        {composing && (
          <motion.div variants={collapse} initial="hidden" animate="visible" exit="exit">
            <NewRequestForm
              onDone={(id) => { setComposing(false); if (id) setOpenId(id); }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {all.length === 0 ? (
        <EmptyState
          icon="support"
          title={emptyTitle}
          action={canCreate && !composing
            ? <Button variant="primary" icon="add" onClick={() => setComposing(true)}>Ask for help</Button>
            : undefined}
        >
          {emptyBody}
        </EmptyState>
      ) : (
        <motion.div className="stack" variants={stagger(0.035)} initial="hidden" animate="visible">
          {all.map((thread) => (
            <ThreadCard
              key={thread.id}
              thread={thread}
              open={openId === thread.id}
              onToggle={() => setOpenId((id) => (id === thread.id ? null : thread.id))}
            />
          ))}
        </motion.div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ new request */

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
    create.mutate(
      { subject, body, courseId: courseId || null },
      {
        onSuccess: (thread) => {
          notify('Sent. You will see the reply here.');
          onDone(thread?.id);
        },
      },
    );
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

      {/*
        Optional, and it decides who reads this. A request naming a course
        reaches the person who teaches it; one without goes to an
        administrator. Said on the screen, because from the outside there is
        no way to tell that the dropdown changes the audience.
      */}
      <div className="field">
        <label className="input-label" htmlFor="support-course">
          Which course? (optional)
        </label>
        <select
          id="support-course" className="input-field"
          value={courseId} onChange={(e) => setCourseId(e.target.value)}
          aria-describedby="support-course-hint"
        >
          <option value="">Not about a course — send to an administrator</option>
          {mine.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
        </select>
        <p id="support-course-hint" className="input-hint">
          Picking a course sends this to the trainer who runs it. Leave it blank
          and it goes to an administrator instead.
        </p>
      </div>

      <div className="field">
        <label className="input-label" htmlFor="support-body">What is happening?</label>
        <textarea
          id="support-body" className="input-field" rows={5} maxLength={4000}
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

/* ---------------------------------------------------------------- threads */

function ThreadCard({ thread, open, onToggle }) {
  const { profile } = useSession();
  const mine = thread.authorId === profile?.id;
  const closed = thread.status === 'closed';

  return (
    <motion.div layout variants={item} className="card no-hover support-thread">
      <button
        type="button"
        className="support-thread-head"
        aria-expanded={open}
        onClick={onToggle}
      >
        <span className="avatar avatar-sm" aria-hidden="true">
          {thread.authorAvatar || thread.authorName.charAt(0)}
        </span>

        <span className="data-row-main">
          <span className="data-row-title">{thread.subject}</span>
          <span className="data-row-meta">
            {mine ? 'You' : thread.authorName}
            {thread.courseTitle ? ` · ${thread.courseTitle}` : ' · General'}
            {` · ${when(thread.lastMessageAt)}`}
          </span>
        </span>

        {/*
          Only meaningful while the thread is open. A closed one waiting on a
          reply is not waiting on anything.
        */}
        {!closed && thread.awaitingStaff && !mine && (
          <span className="badge-pill pill-warning">
            <Icon name="waiting" size={11} />
            Needs a reply
          </span>
        )}
        {!closed && !thread.awaitingStaff && mine && thread.hasReply && (
          <span className="badge-pill pill-positive">
            <Icon name="done" size={11} />
            Answered
          </span>
        )}
        {closed && <StatusPill status="closed" tone="neutral" label="Closed" />}

        <span className="text-xs muted tabular">{thread.messageCount}</span>
        <Icon name="expand" size={16} className={`support-caret${open ? ' is-open' : ''}`} />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div variants={collapse} initial="hidden" animate="visible" exit="exit">
            <Thread thread={thread} mine={mine} />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function Thread({ thread, mine }) {
  const { profile } = useSession();
  const { notify } = useToast();
  const messages = useSupportMessages(thread.id);
  const reply = useReplyToSupport();
  const setStatus = useSetSupportStatus();
  const [body, setBody] = useState('');
  const endRef = useRef(null);

  const closed = thread.status === 'closed';

  // Keeps the newest message in view when one arrives, so a long thread does
  // not leave the reply you just sent above the fold.
  useEffect(() => {
    // Optional call, not just optional chaining on the ref: scrollIntoView is
    // not implemented in every environment this renders in, and a missing
    // convenience must not take the conversation down with it.
    endRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [messages.data?.length]);

  function send(e) {
    e.preventDefault();
    if (!body.trim()) return;
    reply.mutate({ requestId: thread.id, body }, { onSuccess: () => setBody('') });
  }

  return (
    <div className="support-thread-body">
      {messages.isLoading && <p className="text-sm muted">Loading the conversation…</p>}
      {messages.error && <QueryError error={messages.error} what="this conversation" />}

      <div className="support-messages">
        {(messages.data ?? []).map((m) => {
          const own = m.authorId === profile?.id;
          return (
            <motion.div
              key={m.id}
              className={`support-message${own ? ' is-own' : ''}`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
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
                product where one user's words reach another's screen, so it is
                the one place raw HTML injection would matter most.
              */}
              <p className="support-message-body">{m.body}</p>
            </motion.div>
          );
        })}
        <div ref={endRef} />
      </div>

      {closed ? (
        <div className="support-closed">
          <p className="text-sm muted" style={{ margin: 0 }}>
            This thread is closed. Reopen it to add anything else — a reply on a
            closed thread is refused, so it would not reach anyone.
          </p>
          <Button
            variant="secondary" size="sm" icon="retry"
            pending={setStatus.isPending}
            onClick={() => setStatus.mutate(
              { requestId: thread.id, status: 'open' },
              { onSuccess: () => notify('Reopened.') },
            )}
          >
            Reopen
          </Button>
        </div>
      ) : (
        <form onSubmit={send} className="support-reply">
          <label className="sr-only" htmlFor={`reply-${thread.id}`}>
            Reply to {thread.subject}
          </label>
          <textarea
            id={`reply-${thread.id}`}
            className="input-field"
            rows={3}
            maxLength={4000}
            placeholder={mine ? 'Add anything else…' : 'Write a reply…'}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <div className="cluster">
            <Button
              type="submit" variant="primary" size="sm" icon="forward"
              pending={reply.isPending} disabled={!body.trim()}
            >
              Send
            </Button>
            <Button
              variant="ghost" size="sm" icon="done"
              pending={setStatus.isPending}
              onClick={() => setStatus.mutate(
                { requestId: thread.id, status: 'closed' },
                { onSuccess: () => notify('Closed.') },
              )}
            >
              {mine ? 'This is sorted' : 'Mark resolved'}
            </Button>
          </div>
          <Alert error={reply.error ?? setStatus.error} />
        </form>
      )}
    </div>
  );
}
