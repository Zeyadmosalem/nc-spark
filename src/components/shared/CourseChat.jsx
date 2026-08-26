import { useEffect, useRef, useState } from 'react';
import { useSession } from '../../hooks/useSession';
import { useCourseMessages, useSendCourseMessage } from '../../hooks/useMessages';
import QueryError from './QueryError';
import Button from '../ui/Button';

export default function CourseChat({ courseId }) {
  const { profile } = useSession();
  const { data: messages = [], isLoading, error } = useCourseMessages(courseId);
  const send = useSendCourseMessage();
  const [draft, setDraft] = useState('');
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
  }, [messages.length]);

  function submit(event) {
    event.preventDefault();
    const body = draft.trim();
    if (!body) return;
    send.mutate({ courseId, body }, { onSuccess: () => setDraft('') });
  }

  return (
    <section className="card no-hover stack-md" aria-label="Course chat">
      <div>
        <h2 className="card-title" style={{ marginBottom: '0.25rem' }}>Course chat</h2>
        <p className="muted-2" style={{ margin: 0 }}>
          Talk with the people learning and teaching this course.
        </p>
      </div>
      {error && <QueryError error={error} what="this course chat" />}
      <div style={{ display: 'grid', gap: '0.75rem', maxHeight: '24rem', overflowY: 'auto' }}>
        {isLoading ? <p className="muted-2">Loading messages…</p> : messages.length === 0 ? (
          <p className="muted-2">No messages yet. Start the conversation.</p>
        ) : messages.map((message) => {
          const own = message.userId === profile?.id;
          return (
            <div key={message.id} style={{ display: 'flex', justifyContent: own ? 'flex-end' : 'flex-start' }}>
              <div className={`chat-bubble ${own ? 'me' : 'other'}`} style={{ maxWidth: '80%', padding: '0.75rem 0.9rem' }}>
                <div style={{ fontSize: '0.72rem', opacity: 0.8, marginBottom: '0.25rem', fontWeight: 700 }}>
                  {own ? 'You' : message.senderName}
                </div>
                <div>{message.body}</div>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      <form onSubmit={submit} style={{ display: 'grid', gap: '0.75rem' }}>
        <label className="sr-only" htmlFor={`course-chat-${courseId}`}>Type your message</label>
        <textarea
          id={`course-chat-${courseId}`} className="input-field" rows={3}
          value={draft} onChange={(event) => setDraft(event.target.value)}
          placeholder="Type your message…"
        />
        <div className="cluster">
          <Button type="submit" variant="primary" pending={send.isPending} disabled={!draft.trim()}>
            Send
          </Button>
        </div>
      </form>
    </section>
  );
}