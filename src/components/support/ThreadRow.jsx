import { motion } from 'framer-motion';
import { useSession } from '../../hooks/useSession';
import { item } from '../../lib/motion';
import { when } from './supportLabels';
export default function ThreadRow({ thread, selected, onOpen }) {
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
