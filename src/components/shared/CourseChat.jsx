import { useEffect, useMemo, useRef, useState } from 'react';
import { MAX_MESSAGE_LENGTH, MESSAGE_PAGE_SIZE } from '../../api/messages';
import { useSession } from '../../hooks/useSession';
import {
  useCourseMessages, useSendCourseMessage, useOlderCourseMessages,
} from '../../hooks/useMessages';
import QueryError from './QueryError';
import Button from '../ui/Button';

/**
 * One course conversation.
 *
 * This is the only chat in the product. A second, near-identical copy lived
 * inline in CoursePage for the trainee's tab, and the two had already drifted:
 * only one scrolled to the newest message, and a fix to either was a fix to
 * one of them. The wording that genuinely differed between the two call sites
 * is the `subtitle` prop; everything else was the same component twice.
 */
export default function CourseChat({
  courseId,
  subtitle = 'Talk with the people learning and teaching this course.',
  // The staff page already carries "Course chat" as its own heading, and the
  // card repeating it read as a mistake. A tab that supplies its own title
  // passes null.
  heading = 'Course chat',
}) {
  const { profile } = useSession();
  const { data: latest = [], isLoading, error } = useCourseMessages(courseId);
  const send = useSendCourseMessage();
  const older = useOlderCourseMessages(courseId);

  const [earlier, setEarlier] = useState([]);
  const [exhausted, setExhausted] = useState(false);
  const [draft, setDraft] = useState('');
  const endRef = useRef(null);

  const messages = useMemo(() => [...earlier, ...latest], [earlier, latest]);

  // Only ever scroll for the newest end. Prepending history must not yank the
  // reader away from the message they just went back to find.
  useEffect(() => {
    endRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
  }, [latest.length]);

  // A short first page means the whole conversation is already on screen, so
  // there is nothing behind it to offer.
  const mayHaveMore = latest.length >= MESSAGE_PAGE_SIZE && !exhausted;

  async function loadOlder() {
    const oldest = messages[0];
    if (!oldest) return;
    const page = await older.mutateAsync(oldest.createdAt);
    if ((page ?? []).length < MESSAGE_PAGE_SIZE) setExhausted(true);
    setEarlier((prev) => [...(page ?? []), ...prev]);
  }

  function submit(event) {
    event.preventDefault();
    const body = draft.trim();
    if (!body) return;
    send.mutate({ courseId, body }, { onSuccess: () => setDraft('') });
  }

  return (
    <section className="card no-hover stack-md" aria-label="Course chat">
      {heading !== null && (
        <div>
          <h2 className="card-title" style={{ marginBottom: '0.25rem' }}>{heading}</h2>
          <p className="muted-2 u-m0">{subtitle}</p>
        </div>
      )}

      {error && <QueryError error={error} what="this course chat" />}

      <div className="chat-log">
        {mayHaveMore && (
          <div className="cluster u-center">
            <Button
              type="button"
              variant="ghost"
              onClick={loadOlder}
              pending={older.isPending}
            >
              Load older messages
            </Button>
          </div>
        )}

        {isLoading ? (
          <p className="muted-2">Loading messages…</p>
        ) : messages.length === 0 && !error ? (
          <p className="muted-2">No messages yet. Start the conversation.</p>
        ) : messages.map((message) => {
          const own = message.userId === profile?.id;
          return (
            <div
              key={message.id}
              className="chat-msg"
              style={{ display: 'flex', justifyContent: own ? 'flex-end' : 'flex-start' }}
            >
              <div className={`chat-bubble ${own ? 'me' : 'other'}`}>
                <div className="chat-author">{own ? 'You' : message.senderName}</div>
                <div>{message.body}</div>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      <form onSubmit={submit} className="u-grid u-gap-3">
        <label className="sr-only" htmlFor={`course-chat-${courseId}`}>Type your message</label>
        <textarea
          id={`course-chat-${courseId}`}
          className="input-field"
          rows={3}
          maxLength={MAX_MESSAGE_LENGTH}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
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
