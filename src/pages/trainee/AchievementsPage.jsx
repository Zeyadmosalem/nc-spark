import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { useMyEnrollments, useCourses } from '../../hooks/useCourses';
import { useMyQuizResults, useCompletedActivityCount } from '../../hooks/useProgress';
import QueryError from '../../components/shared/QueryError';
import PageSkeleton from '../../components/ui/Skeleton';
import PageHeader from '../../components/ui/PageHeader';
import { fadeUp } from '../../lib/motion';
import StatCard from '../../components/ui/StatCard';
import StatusPill from '../../components/ui/StatusPill';
import Icon from '../../components/ui/Icon';

/**
 * What the trainee has actually achieved.
 *
 * The prototype version of this page led with "#3 of 12 trainees", an XP total
 * and a streak, all of it from dummyData. For a real trainee that is a
 * fabricated ranking against fabricated peers — the single most misleading
 * screen in the product.
 *
 * XP, badges, levels and the leaderboard are backlog B7: nothing awards them,
 * so there is nothing honest to render. What IS real, and has been unread
 * since M3 and M4, is completions and quiz results. That is what this shows.
 */

const onDate = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};

export default function AchievementsPage() {
  const enrollments = useMyEnrollments();
  const courses = useCourses();
  const results = useMyQuizResults();
  const completions = useCompletedActivityCount(
    enrollments.data?.map((e) => e.id));

  if (enrollments.isLoading || courses.isLoading || results.isLoading) {
    return <PageSkeleton label="Loading your record" />;
  }

  const failure = enrollments.error ?? courses.error ?? results.error;
  if (failure) {
    return (
      <div className="page-body">
        <QueryError error={failure} what="your record" />
      </div>
    );
  }

  const byId = new Map((courses.data ?? []).map((c) => [c.id, c]));
  const all = enrollments.data ?? [];
  const finished = all.filter((e) => e.status === 'completed');
  const attempts = results.data ?? [];
  const passed = attempts.filter((a) => a.passed === true);

  // Only over attempts that carry a score. Averaging in a null as zero makes a
  // trainee waiting on a paragraph look like they failed.
  const scored = attempts.filter((a) => typeof a.score === 'number');
  const average = scored.length
    ? Math.round(scored.reduce((sum, a) => sum + a.score, 0) / scored.length)
    : null;

  return (
    <motion.div
      className="page-body"
      initial="hidden"
      animate="visible"
    >
      <PageHeader
        eyebrow="Your record"
        icon="achievements"
        title="Achievements"
        subtitle="Everything you have finished so far."
      />

      <motion.div variants={fadeUp} custom={1} className="stat-grid stat-grid-4">
        <StatCard label="Courses completed" value={finished.length} icon="complete" color="#1a7f37" />
        <StatCard
          label="Activities completed"
          value={completions.isLoading ? '—' : (completions.data ?? 0)}
          icon="done"
          color="var(--brand-primary)"
        />
        <StatCard label="Quizzes passed" value={passed.length} icon="quiz" color="var(--brand-accent)" />
        <StatCard
          label="Average score"
          value={average === null ? '—' : `${average}%`}
          icon="trend"
          color="var(--brand-accent)"
        />
      </motion.div>

      <motion.div variants={fadeUp} custom={2} className="card no-hover">
        <h2 className="card-title"><Icon name="complete" size={16} />Courses you have finished</h2>
        {finished.length === 0 ? (
          <p className="text-sm muted-2 m-0">
            Nothing finished yet.{' '}
            <Link className="brand" to="/trainee/courses">
              Pick up where you left off
            </Link>.
          </p>
        ) : (
          <div className="stack-xs">
            {finished.map((e) => {
              const course = byId.get(e.courseId);
              return (
                <div key={e.id} className="student-row" style={{ cursor: 'default' }}>
                  <div style={{ fontSize: '1.3rem' }}>{course?.icon ?? '📘'}</div>
                  <div className="student-row-info">
                    <div className="student-row-name">{course?.title ?? 'A course'}</div>
                    {e.completedAt && (
                      <div className="student-row-meta">Finished {onDate(e.completedAt)}</div>
                    )}
                  </div>
                  <span style={{
                    background: 'rgba(40,167,69,0.15)', color: '#28a745', fontSize: '0.7rem',
                    fontWeight: 700, padding: '0.2rem 0.55rem', borderRadius: 999,
                    textTransform: 'uppercase', letterSpacing: '0.04em',
                  }}>
                    Complete
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </motion.div>

      <motion.div variants={fadeUp} custom={3} className="card no-hover">
        <h2 className="card-title"><Icon name="quiz" size={16} />Quiz history</h2>
        {attempts.length === 0 ? (
          <p className="text-sm muted-2 m-0">
            You have not finished a quiz yet.
          </p>
        ) : (
          <div className="stack-xs">
            {attempts.map((a) => (
              <div key={a.id} className="student-row" style={{ cursor: 'default' }}>
                <div className="student-row-info">
                  <div className="student-row-name">{a.quizTitle}</div>
                  <div className="student-row-meta">
                    {a.courseTitle}
                    {a.submittedAt ? ` · ${onDate(a.submittedAt)}` : ''}
                    {a.attemptNo > 1 ? ` · attempt ${a.attemptNo}` : ''}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                  {/* A dash, not a zero. An unmarked paragraph has no score
                      yet, and showing 0% reads as a fail. */}
                  <span style={{ fontWeight: 700, color: 'var(--heading)' }}>
                    {typeof a.score === 'number' ? `${a.score}%` : '—'}
                  </span>
                  <StatusPill status={a.status} />
                </div>
              </div>
            ))}
          </div>
        )}
      </motion.div>

      {/* Said out loud rather than left as a blank space, so nobody wonders
          where the badges went. */}
      <motion.div variants={fadeUp} custom={4} className="card no-hover">
        <p style={{ color: 'var(--text-3)', margin: 0, fontSize: '0.85rem' }}>
          Badges, XP and the leaderboard are not switched on yet. When they are,
          they will count the work above — nothing you have already done will be lost.
        </p>
      </motion.div>
    </motion.div>
  );
}
