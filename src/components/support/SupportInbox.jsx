import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useSupportThreads } from '../../hooks/useSupport';
import QueryError from '../shared/QueryError';
import PageSkeleton from '../ui/Skeleton';
import PageHeader from '../ui/PageHeader';
import EmptyState from '../ui/EmptyState';
import Button from '../ui/Button';
import Icon from '../ui/Icon';
import { stagger, SPRING_SOFT, EASE_OUT } from '../../lib/motion';
import ThreadRow from './ThreadRow';
import NewRequestForm from './NewRequestForm';
import Thread from './Thread';

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


const FILTERS = {
  all: { label: 'All', match: () => true },
  unread: { label: 'Unread', match: (t) => t.unreadCount > 0 },
  open: { label: 'Open', match: (t) => t.status === 'open' },
  closed: { label: 'Closed', match: (t) => t.status === 'closed' },
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

/* ----------------------------------------------------------- new request */

/* ----------------------------------------------------------- one thread */

