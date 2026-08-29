import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useSession } from '../../hooks/useSession';
import { useSupportMessages, useReplyToSupport, useSetSupportStatus, useMarkSupportRead } from '../../hooks/useSupport';
import QueryError from '../shared/QueryError';
import Button from '../ui/Button';
import Icon from '../ui/Icon';
import Alert from '../ui/Alert';
import { useToast } from '../ui/toast-context';
import { SPRING_SOFT } from '../../lib/motion';
import { ROLE_LABEL, when } from './supportLabels';
export default function Thread({ thread, onBack }) {
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
