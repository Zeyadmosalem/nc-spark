import { Routes, Route, Navigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import RoleShell from '../../components/shared/RoleShell';
import QueryError from '../../components/shared/QueryError';
import {
  useMyTrainers, useTeamCourses, useTeamEnrollments, useTeamQuizAttempts,
} from '../../hooks/useSupervisor';
import SupervisorCourses from './SupervisorCourses';
import PageSkeleton from '../../components/ui/Skeleton';
import StatCard from '../../components/ui/StatCard';
import EmptyState from '../../components/ui/EmptyState';

/**
 * Supervisor oversight, on real data.
 *
 * Two routes, down from four. The prototype had a per-course page built around
 * course chat (M5, not built) and a "Review Content" screen approving content
 * through a workflow that has no server-side model at all — no table, no
 * status, no Edge Function. Neither could be wired to anything, and a nav
 * entry that leads to invented data is worse than one that is absent.
 *
 * Everything here is a cohort figure. A supervisor manages trainers, not
 * trainees: profiles_select_supervised matches only the linked trainers, so a
 * trainee's name is not readable and none of these screens ask for one. See
 * src/api/supervisor.js.
 */

const NAV = [
  { to: '/supervisor', end: true, icon: '🏠', label: 'Dashboard' },
  { to: '/supervisor/courses', icon: '📚', label: 'Team Courses' },
];

const fadeUp = {
  hidden: { opacity: 0, y: 18 },
  visible: (i = 0) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.07, duration: 0.4, ease: [0.4, 0, 0.2, 1] },
  }),
};

const mean = (nums) =>
  (nums.length ? Math.round(nums.reduce((a, b) => a + b, 0) / nums.length) : null);

export function Dashboard() {
  const trainers = useMyTrainers();
  const courses = useTeamCourses(trainers.data?.map((t) => t.id));
  const enrollments = useTeamEnrollments();
  const attempts = useTeamQuizAttempts();

  if (trainers.isLoading) {
    return <PageSkeleton label="Loading your team" />;
  }
  if (trainers.error) {
    return (
      <div className="page-body">
        <QueryError error={trainers.error} what="your team" />
      </div>
    );
  }

  const team = trainers.data ?? [];

  if (team.length === 0) {
    return (
      <div className="page-body">
        <p className="eyebrow">Oversight</p>
        <h1 className="section-heading">Your Team</h1>
        <EmptyState icon="👥" title="No team yet">
          No trainers are assigned to you yet. An administrator links trainers to
          a supervisor; until then there is nothing to oversee.
        </EmptyState>
      </div>
    );
  }

  const courseList = courses.data ?? [];
  const enrolled = enrollments.data ?? [];
  const active = enrolled.filter((e) => e.status === 'active' || e.status === 'completed');
  const averageProgress = mean(active.map((e) => e.percent));

  const finished = attempts.data ?? [];
  const decided = finished.filter((a) => a.passed !== null);
  const passRate = decided.length
    ? Math.round((decided.filter((a) => a.passed).length / decided.length) * 100)
    : null;
  const awaitingMarking = finished.filter((a) => a.status === 'pending_review').length;

  const coursesByTrainer = new Map();
  for (const c of courseList) {
    coursesByTrainer.set(c.trainerId, (coursesByTrainer.get(c.trainerId) ?? 0) + 1);
  }

  return (
    <motion.div
      className="page-body"
      style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}
      initial="hidden"
      animate="visible"
    >
      <motion.div variants={fadeUp} custom={0}>
        <p className="eyebrow">Oversight</p>
        <h1 className="section-heading" style={{ marginBottom: '0.35rem' }}>Your Team</h1>
        <p className="section-sub">
          {team.length} trainer{team.length === 1 ? '' : 's'}, {courseList.length} course
          {courseList.length === 1 ? '' : 's'}.
        </p>
      </motion.div>

      <motion.div variants={fadeUp} custom={1} className="stat-grid stat-grid-4">
        <StatCard label="Trainers" value={team.length} color="var(--brand-secondary)" />
        <StatCard
          label="Courses"
          value={courseList.length}
          sub={`${courseList.filter((c) => c.status === 'published').length} published`}
          color="var(--brand-primary)"
        />
        <StatCard
          label="Learners enrolled"
          value={active.length}
          sub={averageProgress === null ? 'no progress yet' : `${averageProgress}% average progress`}
          color="#28a745"
        />
        <StatCard
          label="Quiz pass rate"
          value={passRate === null ? '—' : `${passRate}%`}
          sub={`${decided.length} graded attempt${decided.length === 1 ? '' : 's'}`}
          color="var(--brand-accent)"
        />
      </motion.div>

      {awaitingMarking > 0 && (
        <motion.div variants={fadeUp} custom={2} className="card no-hover"
                    style={{ borderLeft: '4px solid #b8860b' }}>
          <p style={{ margin: 0, color: 'var(--text-2)', fontSize: '0.9rem' }}>
            <strong>{awaitingMarking}</strong> attempt{awaitingMarking === 1 ? ' is' : 's are'}{' '}
            waiting on a trainer to mark a written answer. Trainees cannot progress past a
            quiz until it is marked.
          </p>
        </motion.div>
      )}

      <motion.div variants={fadeUp} custom={3} className="card no-hover">
        <div className="card-title">Trainers you supervise</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          {team.map((t) => (
            <div key={t.id} className="student-row" style={{ cursor: 'default' }}>
              <div className="avatar" style={{ width: '2rem', height: '2rem', fontSize: '0.7rem', flexShrink: 0 }}>
                {t.avatar || (t.name ?? '?').charAt(0).toUpperCase()}
              </div>
              <div className="student-row-info">
                <div className="student-row-name">{t.name || 'Unnamed'}</div>
                <div className="student-row-meta">{t.email}</div>
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                {t.status !== 'active' && (
                  <span style={{
                    background: 'rgba(220,53,69,0.15)', color: '#dc3545', fontSize: '0.7rem',
                    fontWeight: 700, padding: '0.2rem 0.55rem', borderRadius: 999,
                    textTransform: 'uppercase', letterSpacing: '0.04em',
                  }}>
                    {t.status}
                  </span>
                )}
                <span style={{ fontSize: '0.85rem', color: 'var(--text-3)' }}>
                  {coursesByTrainer.get(t.id) ?? 0} course
                  {(coursesByTrainer.get(t.id) ?? 0) === 1 ? '' : 's'}
                </span>
              </div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: '1rem' }}>
          <Link to="/supervisor/courses" className="btn btn-ghost btn-sm"
                style={{ textDecoration: 'none' }}>
            See course-by-course progress →
          </Link>
        </div>
      </motion.div>

      {/* Individual trainees are absent by design, not by omission. */}
      <motion.div variants={fadeUp} custom={4} className="card no-hover">
        <p style={{ color: 'var(--text-3)', margin: 0, fontSize: '0.85rem' }}>
          These figures are cohort totals. Supervisors oversee trainers, so individual
          trainee names and results are not shown here — a trainer sees those for their
          own courses.
        </p>
      </motion.div>
    </motion.div>
  );
}

export default function SupervisorShell() {
  return (
    <RoleShell navItems={NAV} title="NC Spark Oversight">
      <Routes>
        <Route index element={<Dashboard />} />
        <Route path="courses" element={<SupervisorCourses />} />
        <Route path="*" element={<Navigate to="/supervisor" replace />} />
      </Routes>
    </RoleShell>
  );
}
