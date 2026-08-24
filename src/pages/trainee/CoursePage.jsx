import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useCourseOutline, useMyEnrollments } from '../../hooks/useCourses';
import { useMyCompletions } from '../../hooks/useProgress';
import { moduleLockState } from '../../api/progress';
import QueryError from '../../components/shared/QueryError';
import PageSkeleton from '../../components/ui/Skeleton';
import CourseMaterials from '../../components/shared/CourseMaterials';

const TYPE_ICONS = {
  video: '🎬', reading: '📖', flashcards: '🃏',
  matching: '🔗', scenario: '🧭', submission: '📤', quiz: '📝',
};

export default function CoursePage() {
  const { courseId } = useParams();
  const navigate = useNavigate();

  const { data: course, isLoading, error } = useCourseOutline(courseId);
  const {
    data: enrollments, isLoading: loadingEnrollments, error: enrollmentsError,
  } = useMyEnrollments();

  const [activeTab, setActiveTab] = useState('path');

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

  if (!course) return <div className="page-body"><p>Course not found.</p></div>;

  const enrollment = (enrollments ?? []).find((e) => e.courseId === courseId);
  const isEnrolled = enrollment?.status === 'active' || enrollment?.status === 'completed';
  const isPending = enrollment?.status === 'pending';

  if (!isEnrolled) {
    return (
      <div className="page-body">
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/trainee/courses')}>
            ← Back to Courses
          </button>
        </div>
        <div className="card no-hover" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔒</div>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '0.5rem', fontFamily: 'var(--font-heading)' }}>
            {isPending ? 'Enrollment Pending' : 'Course Locked'}
          </h2>
          <p style={{ color: 'var(--text-2)', maxWidth: '40ch', margin: '0 auto 1.5rem' }}>
            {isPending
              ? 'Your request to join this course has been sent to the trainer. You will gain access once they approve it.'
              : 'You are not enrolled in this course. Please visit the Course Catalog to apply.'}
          </p>
          {!isPending && (
            <button className="btn btn-primary" onClick={() => navigate('/trainee/catalog')}>
              Go to Course Catalog
            </button>
          )}
        </div>
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
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/trainee/courses')}>
          ← Back to Courses
        </button>
      </div>

      <motion.div
        initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
        style={{
          borderRadius: 'var(--r-xl)', padding: '2rem', color: '#fff',
          position: 'relative', overflow: 'hidden',
          background: `linear-gradient(145deg, rgba(0,0,0,0.82), rgba(15,15,25,0.88)), linear-gradient(135deg, ${accent}88, ${accent}44)`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1.5rem', flexWrap: 'wrap' }}>
          <div style={{ fontSize: '3rem', background: `${accent}33`, padding: '1rem', borderRadius: 'var(--r-xl)', border: `1px solid ${accent}44` }}>
            {course.icon || '📘'}
          </div>
          <div style={{ flex: 1, minWidth: 300 }}>
            <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.4rem' }}>
              Course Hub
            </p>
            <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: 'clamp(1.5rem, 4vw, 2rem)', color: '#fff', marginBottom: '0.5rem' }}>
              {course.title}
            </h1>
            <p style={{ fontSize: '0.88rem', color: 'rgba(255,255,255,0.75)', maxWidth: '60ch' }}>
              {course.description}
            </p>
          </div>
          <div style={{ textAlign: 'right', minWidth: 150 }}>
            <div style={{ fontFamily: 'var(--font-heading)', fontSize: '3rem', fontWeight: 700, color: '#fff', lineHeight: 1 }}>
              {percent}%
            </div>
            <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.6)' }}>Your Progress</div>
            <div className="progress-track" style={{ marginTop: '0.5rem', background: 'rgba(255,255,255,0.15)', width: '100%', maxWidth: 120, marginLeft: 'auto' }}>
              <div className="progress-fill" style={{ width: `${percent}%` }} />
            </div>
          </div>
        </div>
      </motion.div>

      <div className="tab-navigation">
        <button className={`tab-item ${activeTab === 'path' ? 'active' : ''}`} onClick={() => setActiveTab('path')}>
          📚 Learning Path
        </button>
        <button className={`tab-item ${activeTab === 'materials' ? 'active' : ''}`} onClick={() => setActiveTab('materials')}>
          📎 Materials
        </button>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
          style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}
        >
          {activeTab === 'path' && (
            modules.length === 0 ? (
              <div className="card no-hover" style={{ textAlign: 'center', padding: '3rem' }}>
                <p style={{ color: 'var(--text-2)' }}>This course has no content yet.</p>
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
                        <span style={{ fontSize: '0.78rem', color: 'var(--text-3)' }}>
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
                      <p style={{ color: 'var(--text-3)', fontSize: '0.85rem' }}>No activities yet.</p>
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
                              <span style={{ fontSize: '1.25rem' }} aria-hidden="true">
                                {TYPE_ICONS[a.type] ?? '📘'}
                              </span>
                              <span style={{ flex: 1 }}>{a.title}</span>
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

        </motion.div>
      </AnimatePresence>
    </div>
  );
}
