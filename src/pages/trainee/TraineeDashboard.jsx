import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { useSession } from '../../hooks/useSession';
import { useCourses, useMyEnrollments } from '../../hooks/useCourses';
import ProgressRing from '../../components/gamification/ProgressRing';
import TraineeNotices from '../../components/shared/TraineeNotices';
import QueryError from '../../components/shared/QueryError';
import PageSkeleton from '../../components/ui/Skeleton';
import StatCard from '../../components/ui/StatCard';
import EmptyState from '../../components/ui/EmptyState';

/**
 * The first screen a trainee sees, on real enrolment progress.
 *
 * `percent` comes from the enrollment_progress view, which counts actual
 * activity completions. Every number on this page used to be invented by
 * dummyData, including the progress rings.
 *
 * Deliberately absent: the XP hero, the leaderboard, the badge grid and the
 * learning-path map. Nothing awards XP yet (backlog B7) and learning paths
 * have no server-side counterpart, so wired to real data all four render zeros
 * or nothing. A dashboard reporting a confident 0 XP and an empty leaderboard
 * tells a trainee they are behind; the honest version does not claim to
 * measure what the product does not yet measure. They return with B7.
 */

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i = 0) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.07, duration: 0.45, ease: [0.4, 0, 0.2, 1] },
  }),
};

export default function TraineeDashboard() {
  const { profile } = useSession();
  const enrollments = useMyEnrollments();
  const courses = useCourses();

  // Both queries draw a single card: the enrollment carries progress, the
  // course carries its name. Rendering on one of them shows nameless cards.
  if (enrollments.isLoading || courses.isLoading) {
    return <PageSkeleton label="Loading your dashboard" />;
  }

  const failure = enrollments.error ?? courses.error;
  if (failure) {
    return (
      <div className="page-body">
        <QueryError error={failure} what="your dashboard" />
      </div>
    );
  }

  const byId = new Map((courses.data ?? []).map((c) => [c.id, c]));
  const all = enrollments.data ?? [];
  const active = all.filter((e) => e.status === 'active');
  const completed = all.filter((e) => e.status === 'completed');
  const waiting = all.filter((e) => e.status === 'pending');

  const started = [...active, ...completed];
  const overall = started.length
    ? Math.round(started.reduce((sum, e) => sum + (e.percent ?? 0), 0) / started.length)
    : 0;

  // The course to resume: the one furthest along that is not finished. Picking
  // the least-progressed would send a trainee back to whatever they abandoned.
  const resume = active
    .filter((e) => (e.percent ?? 0) < 100)
    .sort((a, b) => (b.percent ?? 0) - (a.percent ?? 0))[0];
  const resumeCourse = resume && byId.get(resume.courseId);

  const firstName = (profile?.name ?? '').split(' ')[0];

  return (
    <motion.div
      className="page-body"
      style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}
      initial="hidden"
      animate="visible"
    >
      {/* Anything a trainer did while the trainee was away. Renders nothing
          when there is nothing to say, so it costs no space on a quiet day. */}
      <TraineeNotices />

      <motion.div
        variants={fadeUp}
        custom={0}
        className="xp-hero"
        style={{ background: 'linear-gradient(145deg, rgba(0,0,0,0.92), rgba(10,10,18,0.95)), radial-gradient(500px 300px at 10% 10%, rgba(0,163,224,0.2), transparent), radial-gradient(500px 400px at 95% 5%, rgba(107,44,141,0.25), transparent)' }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexWrap: 'wrap', gap: '1rem',
        }}>
          <div>
            <p style={{
              fontSize: '0.78rem', color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase',
              letterSpacing: '0.08em', marginBottom: '0.5rem',
            }}>
              Your training
            </p>
            <h1 style={{
              fontFamily: 'var(--font-heading)', fontSize: 'clamp(1.5rem, 4vw, 2.1rem)',
              color: '#fff', lineHeight: 1.1, marginBottom: '0.5rem',
            }}>
              {firstName ? `Welcome back, ${firstName}` : 'Welcome back'}
            </h1>
            <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.9rem', margin: 0 }}>
              {started.length === 0
                ? 'You have not started a course yet.'
                : `${overall}% through ${started.length} course${started.length === 1 ? '' : 's'}.`}
            </p>
          </div>
          {resumeCourse && (
            <Link
              to={`/trainee/courses/${resumeCourse.id}`}
              className="btn btn-primary"
              style={{ textDecoration: 'none' }}
            >
              Continue {resumeCourse.title} →
            </Link>
          )}
        </div>
      </motion.div>

      <motion.div variants={fadeUp} custom={1} className="stat-grid stat-grid-4">
        <StatCard label="Overall progress" value={`${overall}%`} icon="📈" color="var(--brand-primary)" />
        <StatCard label="In progress" value={active.length} icon="📚" color="var(--brand-secondary)" />
        <StatCard label="Completed" value={completed.length} icon="✅" color="#28a745" />
        <StatCard
          label="Awaiting approval"
          value={waiting.length}
          icon="⏳"
          color={waiting.length > 0 ? 'var(--brand-accent)' : 'var(--text-3)'}
        />
      </motion.div>

      <motion.div variants={fadeUp} custom={2} className="card no-hover">
        <div className="card-title">📚 My courses</div>
        {started.length === 0 && waiting.length === 0 ? (
          <EmptyState
            icon="🎓"
            title="Nothing on your plate yet"
            action={(
              <Link to="/trainee/catalog" className="btn btn-primary"
                    style={{ textDecoration: 'none' }}>
                Browse the catalog
              </Link>
            )}
          >
            You are not enrolled in any course yet. Find one in the catalog and
            apply — a trainer approves you, then you can start.
          </EmptyState>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {started.map((e) => {
              const course = byId.get(e.courseId);
              if (!course) return null;
              return (
                <Link
                  key={e.id}
                  to={`/trainee/courses/${course.id}`}
                  className="student-row"
                  style={{ textDecoration: 'none', color: 'inherit' }}
                >
                  <div style={{
                    fontSize: '1.5rem', width: '2.5rem', height: '2.5rem', flexShrink: 0,
                    background: `${course.color ?? '#00a3e0'}22`, borderRadius: 'var(--r-lg)',
                    display: 'grid', placeItems: 'center',
                  }}>
                    {course.icon ?? '📘'}
                  </div>
                  <div className="student-row-info">
                    <div className="student-row-name">{course.title}</div>
                    <div className="student-row-meta">
                      {e.status === 'completed' ? 'Completed' : course.subtitle}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <ProgressRing radius={24} stroke={4} progress={e.percent ?? 0} />
                    <span style={{ fontSize: '0.9rem', color: 'var(--text-3)' }}>→</span>
                  </div>
                </Link>
              );
            })}

            {/* A pending application is not a course yet: no progress, nowhere
                to click. Showing it stops a trainee re-applying. */}
            {waiting.map((e) => {
              const course = byId.get(e.courseId);
              if (!course) return null;
              return (
                <div key={e.id} className="student-row" style={{ cursor: 'default', opacity: 0.75 }}>
                  <div style={{
                    fontSize: '1.5rem', width: '2.5rem', height: '2.5rem', flexShrink: 0,
                    background: 'var(--surface-alt)', borderRadius: 'var(--r-lg)',
                    display: 'grid', placeItems: 'center',
                  }}>
                    {course.icon ?? '📘'}
                  </div>
                  <div className="student-row-info">
                    <div className="student-row-name">{course.title}</div>
                    <div className="student-row-meta">Waiting for a trainer to approve you</div>
                  </div>
                  <span className="chip">⏳ Pending</span>
                </div>
              );
            })}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
