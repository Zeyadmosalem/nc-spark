import { useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useCourseOutline, useMyEnrollments } from '../../hooks/useCourses';
import { useMyCompletions } from '../../hooks/useProgress';
import { useSession } from '../../hooks/useSession';
import { useCourseMessages, useSendCourseMessage } from '../../hooks/useMessages';
import { moduleLockState } from '../../api/progress';
import QueryError from '../../components/shared/QueryError';
import PageSkeleton from '../../components/ui/Skeleton';
import PageHeader from '../../components/ui/PageHeader';
import CourseMaterials from '../../components/shared/CourseMaterials';
import EmptyState from '../../components/ui/EmptyState';
import Button from '../../components/ui/Button';
import Icon from '../../components/ui/Icon';
import { SPRING_SOFT, EASE_OUT } from '../../lib/motion';

export default function CoursePage() {
  const { courseId } = useParams();
  const { profile } = useSession();

  const { data: course, isLoading, error } = useCourseOutline(courseId);
  const {
    data: enrollments, isLoading: loadingEnrollments, error: enrollmentsError,
  } = useMyEnrollments();

  const [activeTab, setActiveTab] = useState('path');
  const [chatDraft, setChatDraft] = useState('');
  const endRef = useRef(null);

  const { data: chatMessages = [], isLoading: loadingMessages, error: chatError } = useCourseMessages(courseId);
  const sendMessage = useSendCourseMessage();

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
  }, [chatMessages.length]);

  function submitChat(event) {
    event.preventDefault();
    const body = chatDraft.trim();
    if (!body || !courseId) return;
    sendMessage.mutate({ courseId, body }, { onSuccess: () => setChatDraft('') });
  }

  // Above the early returns, like every other hook here: this page has
  // already crashed once with "Rendered fewer hooks than expected" because
  // router navigation between two course ids reuses the same fiber.
  const myEnrollment = (enrollments ?? []).find((e) => e.courseId === courseId);
  const completions = useMyCompletions(myEnrollment?.id);

  // Every hook must run before the early returns below. This page used to
  // crash with "Rendered fewer hooks than expected" because router navigation
  // between two course ids reuses the same fiber, so returning early for an
  // unenrolled course changed the hook count between renders.

  if (isLoading || loadingEnrollments) {
    return <PageSkeleton label="Loading course" stats={0} rows={4} />;
  }

  const failure = error ?? enrollmentsError;
  if (failure) {
    return <div className="page-body"><QueryError error={failure} what="this course" /></div>;
  }

  // Was a bare sentence in a div: no heading, no explanation, and nothing to
  // click. A trainee who followed a stale link had to use the browser's back
  // button to escape.
  if (!course) {
    return (
      <div className="page-body">
        <EmptyState
          icon="empty"
          title="That course is not here"
          action={<Button to="/trainee/courses" variant="primary" icon="back">Back to my courses</Button>}
        >
          It may have been withdrawn from the catalog, or the link may be out of
          date.
        </EmptyState>
      </div>
    );
  }

  const enrollment = (enrollments ?? []).find((e) => e.courseId === courseId);
  const isEnrolled = enrollment?.status === 'active' || enrollment?.status === 'completed';
  const isPending = enrollment?.status === 'pending';

  if (!isEnrolled) {
    return (
      <div className="page-body">
        <PageHeader
          eyebrow={course.title}
          icon="courses"
          title={isPending ? 'Waiting on a trainer' : 'You are not on this course'}
          subtitle={isPending
            ? 'Your application has been sent. A trainer decides who joins, and you will get in as soon as they do.'
            : 'Courses are applied for from the catalog. A trainer approves each application.'}
          backTo="/trainee/courses"
          backLabel="My courses"
        />
        <EmptyState
          icon={isPending ? 'waiting' : 'locked'}
          title={isPending ? 'Application pending' : 'Not enrolled'}
          action={isPending
            ? <Button to="/trainee/courses" variant="secondary" icon="back">Back to my courses</Button>
            : <Button to="/trainee/catalog" variant="primary" icon="catalog">Go to the catalog</Button>}
        >
          {isPending
            ? 'Nothing more is needed from you. There is no need to apply again — a second application is refused.'
            : 'Nothing in this course opens until you are enrolled.'}
        </EmptyState>
      </div>
    );
  }

  const accent = course.color || '#002F6C';
  const percent = enrollment.percent ?? 0;
  const modules = course.modules ?? [];

  // An empty set until the completions arrive, so a gated module reads as
  // locked for that moment. That is the safe direction to be wrong in: the
  // alternative flashes an open course and then shuts it.
  const done = completions.data ?? new Set();
  const locks = moduleLockState(modules, done);

  return (
    <div className="page-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', paddingBottom: '4rem' }}>
      <Link to="/trainee/courses" className="crumb">
        <Icon name="back" size={14} />
        My courses
      </Link>

      <motion.section
        className="hero"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: EASE_OUT }}
        style={{
          background: `radial-gradient(70rem 34rem at 88% -30%, ${accent}, transparent 62%),`
            + ` linear-gradient(125deg, color-mix(in srgb, ${accent} 78%, #000), color-mix(in srgb, ${accent} 35%, #000))`,
        }}
      >
        <div className="hero-inner">
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', minWidth: 0 }}>
            <span className="hero-badge" aria-hidden="true">{course.icon || '\u{1F4D8}'}</span>
            <div className="grow">
              <p className="hero-eyebrow">Course</p>
              <h1 className="hero-title">{course.title}</h1>
              {course.description && <p className="hero-sub">{course.description}</p>}
            </div>
          </div>

          <div className="hero-progress">
            <div className="hero-figure-value">{percent}%</div>
            <div className="hero-figure-label">
              {done.size} of {modules.reduce((n, m) => n + (m.activities?.length ?? 0), 0)} activities done
            </div>
            <div
              className="progress-track hero-progress-track"
              role="progressbar"
              aria-valuenow={percent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Your progress on this course"
            >
              <motion.div
                className="progress-fill"
                data-complete={percent >= 100 || undefined}
                initial={{ width: 0 }}
                animate={{ width: `${percent}%` }}
                transition={{ duration: 0.9, ease: EASE_OUT, delay: 0.2 }}
              />
            </div>
          </div>
        </div>
      </motion.section>

      <div className="tab-navigation" role="tablist">
        {[
          { id: 'path', label: 'Learning path', icon: 'curriculum' },
          { id: 'materials', label: 'Materials', icon: 'attachment' },
          { id: 'chat', label: 'Course chat', icon: 'support' },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`tab-item ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <Icon name={tab.icon} size={15} />
            {tab.label}
            {/* One shared element, so the underline slides between tabs. */}
            {activeTab === tab.id && (
              <motion.span layoutId="course-tab" className="tab-underline" transition={SPRING_SOFT} />
            )}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div className="stack-lg"
          key={activeTab}
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
        >
          {activeTab === 'path' && (
            modules.length === 0 ? (
              <div className="card no-hover" style={{ textAlign: 'center', padding: '3rem' }}>
                <p className="muted-2">This course has no content yet.</p>
              </div>
            ) : (
              modules.map((mod) => {
                const gate = locks.get(mod.id) ?? { unlocked: true, blockedBy: null };
                const activities = mod.activities ?? [];
                const finished = activities.filter((a) => done.has(a.id)).length;

                return (
                  <div key={mod.id} className="card no-hover"
                       style={gate.unlocked ? undefined : { opacity: 0.75 }}>
                    <div style={{
                      display: 'flex', alignItems: 'baseline', gap: '0.6rem',
                      justifyContent: 'space-between', flexWrap: 'wrap',
                    }}>
                      <div className="card-title" style={{ marginBottom: 0 }}>
                        <span aria-hidden="true">{gate.unlocked ? '' : '🔒 '}</span>
                        {mod.position}. {mod.title}
                      </div>
                      {activities.length > 0 && (
                        <span className="text-xs muted">
                          {finished === activities.length
                            ? 'Complete'
                            : `${finished} of ${activities.length} done`}
                        </span>
                      )}
                    </div>

                    {/*
                      complete-activity checks app.is_module_unlocked and
                      refuses a locked activity, and always will. Without this
                      the only way to discover a lock was to open an activity
                      and be turned away, with nothing to say what was in the
                      way or how much of it was left.
                    */}
                    {!gate.unlocked && (
                      <p style={{ color: 'var(--text-2)', fontSize: '0.85rem', margin: '0.5rem 0 0' }}>
                        {gate.blockedBy
                          ? `Finish ${gate.blockedBy.module.position}. ${gate.blockedBy.module.title} first — ${gate.blockedBy.remaining} activit${gate.blockedBy.remaining === 1 ? 'y' : 'ies'} to go.`
                          : 'This module opens once an earlier one is finished.'}
                      </p>
                    )}

                    {activities.length === 0 ? (
                      <p className="text-sm muted">No activities yet.</p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.75rem' }}>
                        {activities.map((a) => {
                          const isDone = done.has(a.id);
                          const shared = {
                            display: 'flex', alignItems: 'center', gap: '0.75rem',
                            padding: '0.75rem', borderRadius: 'var(--r-md)',
                            background: 'var(--surface-alt)', border: '1px solid var(--border)',
                          };
                          const body = (
                            <>
                              <span className="row-icon">
                                <Icon name={a.type} size={16} />
                              </span>
                              <span className="grow">{a.title}</span>
                              {/* Said in words as well as with a tick: a
                                  coloured pill is not a status to somebody
                                  using a screen reader. */}
                              {isDone && (
                                <span className="badge-pill"
                                      style={{ background: 'rgba(40,167,69,0.15)', color: '#28a745' }}>
                                  Done
                                </span>
                              )}
                            </>
                          );

                          // A locked activity is not a link. Offering one the
                          // server will refuse is an invitation to a dead end,
                          // and it stays in the tab order while it is there.
                          return gate.unlocked ? (
                            <Link
                              key={a.id}
                              to={`/trainee/activity/${a.id}`}
                              state={{ courseId }}
                              style={{ ...shared, textDecoration: 'none', color: 'inherit' }}
                            >
                              {body}
                            </Link>
                          ) : (
                            <div key={a.id} style={{ ...shared, color: 'var(--text-3)' }}>
                              {body}
                              <span className="sr-only">Locked</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })
            )
          )}

          {/* This tab was a hardcoded "nothing uploaded yet" that could never
              say anything else: course_materials, its RLS and the private
              bucket have existed since M3 with nothing reading them. */}
          {activeTab === 'materials' && <CourseMaterials courseId={courseId} />}

          {activeTab === 'chat' && (
            <div className="card no-hover" style={{ display: 'grid', gap: '1rem' }}>
              <div>
                <h2 className="card-title" style={{ marginBottom: '0.25rem' }}>Course chat</h2>
                <p className="muted-2" style={{ margin: 0 }}>
                  Ask a question about this course and keep the conversation on the same page.
                </p>
              </div>

              {chatError && <QueryError error={chatError} what="this course chat" />}

              <div style={{ display: 'grid', gap: '0.75rem', maxHeight: '24rem', overflowY: 'auto', paddingRight: '0.25rem' }}>
                {loadingMessages ? (
                  <p className="muted-2">Loading messages…</p>
                ) : chatMessages.length === 0 ? (
                  <div className="empty-state" style={{ padding: '1rem' }}>
                    <p className="muted-2">No messages yet. Start the conversation.</p>
                  </div>
                ) : (
                  chatMessages.map((message) => {
                    const own = message.userId === profile?.id;
                    return (
                      <div
                        key={message.id}
                        className="chat-msg"
                        style={{
                          display: 'flex',
                          justifyContent: own ? 'flex-end' : 'flex-start',
                          alignItems: 'flex-start',
                          gap: '0.5rem',
                        }}
                      >
                        <div
                          className={`chat-bubble ${own ? 'me' : 'other'}`}
                          style={{
                            maxWidth: '80%',
                            padding: '0.75rem 0.9rem',
                            lineHeight: 1.5,
                          }}
                        >
                          <div style={{ fontSize: '0.72rem', opacity: 0.8, marginBottom: '0.25rem', fontWeight: 700 }}>
                            {own ? 'You' : message.senderName}
                          </div>
                          <div>{message.body}</div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={endRef} />
              </div>

              <form onSubmit={submitChat} style={{ display: 'grid', gap: '0.75rem' }}>
                <label className="sr-only" htmlFor={`course-chat-${courseId}`}>
                  Type your message
                </label>
                <textarea
                  id={`course-chat-${courseId}`}
                  className="input-field"
                  rows={3}
                  value={chatDraft}
                  onChange={(event) => setChatDraft(event.target.value)}
                  placeholder="Type your message…"
                />
                <div className="cluster">
                  <Button type="submit" variant="primary" disabled={!chatDraft.trim() || sendMessage.isPending}>
                    {sendMessage.isPending ? 'Sending…' : 'Send'}
                  </Button>
                </div>
              </form>
            </div>
          )}

        </motion.div>
      </AnimatePresence>
    </div>
  );
}
