import { motion } from 'framer-motion';
import QueryError from '../../components/shared/QueryError';
import PageSkeleton from '../../components/ui/Skeleton';
import StatusPill from '../../components/ui/StatusPill';
import EmptyState from '../../components/ui/EmptyState';
import {
  useMyTrainers, useTeamCourses, useTeamEnrollments, useTeamQuizAttempts,
} from '../../hooks/useSupervisor';

/**
 * Course-by-course progress across the supervised trainers.
 *
 * Cohort figures only, for the reason set out in src/api/supervisor.js: a
 * supervisor cannot resolve a trainee id to a name, and these screens do not
 * ask for one.
 *
 * Reading the quiz title here is what backlog B5 was about — quiz_attempts_select
 * matched supervisors from M4 and quizzes_select did not, so this page would
 * have rendered every attempt as "Unknown quiz". Migration 20260825000100
 * fixed it.
 */

const mean = (nums) =>
  (nums.length ? Math.round(nums.reduce((a, b) => a + b, 0) / nums.length) : null);

function Figure({ label, value }) {
  return (
    <div style={{ textAlign: 'center', minWidth: 84 }}>
      <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: '1.15rem' }}>
        {value}
      </div>
      <div style={{ fontSize: '0.7rem', color: 'var(--text-3)' }}>{label}</div>
    </div>
  );
}

export default function SupervisorCourses() {
  const trainers = useMyTrainers();
  const courses = useTeamCourses(trainers.data?.map((t) => t.id));
  const enrollments = useTeamEnrollments();
  const attempts = useTeamQuizAttempts();

  if (trainers.isLoading || courses.isLoading) {
    return <PageSkeleton label="Loading team courses" stats={0} rows={4} />;
  }

  const failure = trainers.error ?? courses.error;
  if (failure) {
    return (
      <div className="page-body">
        <QueryError error={failure} what="your team courses" />
      </div>
    );
  }

  const team = trainers.data ?? [];
  const list = courses.data ?? [];
  const nameOf = new Map(team.map((t) => [t.id, t.name]));

  const enrolledBy = new Map();
  for (const e of enrollments.data ?? []) {
    if (e.status !== 'active' && e.status !== 'completed') continue;
    if (!enrolledBy.has(e.courseId)) enrolledBy.set(e.courseId, []);
    enrolledBy.get(e.courseId).push(e);
  }

  const attemptsBy = new Map();
  for (const a of attempts.data ?? []) {
    if (!a.courseId) continue;
    if (!attemptsBy.has(a.courseId)) attemptsBy.set(a.courseId, []);
    attemptsBy.get(a.courseId).push(a);
  }

  return (
    <div className="page-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div>
        <p className="eyebrow">Oversight</p>
        <h1 className="section-heading" style={{ marginBottom: '0.35rem' }}>Team Courses</h1>
        <p className="section-sub">How each cohort is doing.</p>
      </div>

      {list.length === 0 ? (
        <EmptyState icon="📚" title="Nothing to show">
          {team.length === 0
            ? 'No trainers are assigned to you yet.'
            : 'Your trainers have no courses yet.'}
        </EmptyState>
      ) : (
        <div style={{ display: 'grid', gap: '1rem' }}>
          {list.map((course) => {
            const cohort = enrolledBy.get(course.id) ?? [];
            const progress = mean(cohort.map((e) => e.percent));
            const done = cohort.filter((e) => e.status === 'completed').length;

            const tries = attemptsBy.get(course.id) ?? [];
            const decided = tries.filter((a) => a.passed !== null);
            const passRate = decided.length
              ? Math.round((decided.filter((a) => a.passed).length / decided.length) * 100)
              : null;
            const waiting = tries.filter((a) => a.status === 'pending_review').length;

            return (
              <motion.div
                key={course.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="card no-hover"
              >
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '1rem',
                  justifyContent: 'space-between', flexWrap: 'wrap',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', minWidth: 0 }}>
                    <div style={{
                      width: 44, height: 44, borderRadius: 'var(--r-lg)', flexShrink: 0,
                      display: 'grid', placeItems: 'center', fontSize: '1.3rem',
                      background: `${course.color ?? '#00a3e0'}22`,
                    }}>
                      {course.icon ?? '📘'}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <h2 style={{ fontSize: '1.05rem', fontWeight: 600, margin: 0 }}>
                        {course.title}
                      </h2>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-3)' }}>
                        {nameOf.get(course.trainerId) ?? 'Unassigned'}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '1.25rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <Figure label="enrolled" value={cohort.length} />
                    <Figure label="completed" value={done} />
                    <Figure label="avg progress" value={progress === null ? '—' : `${progress}%`} />
                    <Figure label="pass rate" value={passRate === null ? '—' : `${passRate}%`} />
                    <StatusPill status={course.status} />
                  </div>
                </div>

                {cohort.length > 0 && (
                  <div style={{ marginTop: '1rem' }}>
                    <div className="progress-track">
                      <div className="progress-fill" style={{ width: `${progress ?? 0}%` }} />
                    </div>
                  </div>
                )}

                {waiting > 0 && (
                  <p style={{ margin: '0.75rem 0 0', fontSize: '0.82rem', color: 'var(--brand-accent)' }}>
                    {waiting} attempt{waiting === 1 ? '' : 's'} waiting on marking
                  </p>
                )}
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
