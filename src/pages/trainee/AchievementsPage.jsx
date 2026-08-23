import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { useMyEnrollments, useCourses } from '../../hooks/useCourses';
import { useMyQuizResults, useCompletedActivityCount } from '../../hooks/useProgress';
import QueryError from '../../components/shared/QueryError';

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

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: (i = 0) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.07, duration: 0.4, ease: [0.4, 0, 0.2, 1] },
  }),
};

const VERDICT = {
  passed:         { label: 'Passed',          bg: 'rgba(40,167,69,0.15)',  fg: '#28a745' },
  failed:         { label: 'Not passed',      bg: 'rgba(220,53,69,0.15)',  fg: '#dc3545' },
  expired:        { label: 'Ran out of time', bg: 'rgba(220,53,69,0.15)',  fg: '#dc3545' },
  pending_review: { label: 'Awaiting marking', bg: 'rgba(232,179,77,0.18)', fg: '#b8860b' },
};

function Verdict({ status }) {
  const v = VERDICT[status];
  if (!v) return null;
  return (
    <span style={{
      background: v.bg, color: v.fg, fontSize: '0.7rem', fontWeight: 700,
      padding: '0.2rem 0.55rem', borderRadius: 999, textTransform: 'uppercase',
      letterSpacing: '0.04em', whiteSpace: 'nowrap',
    }}>
      {v.label}
    </span>
  );
}

function Stat({ label, value, icon, color }) {
  return (
    <div className="stat-card">
      <div style={{ fontSize: '1.4rem', marginBottom: '0.5rem' }}>{icon}</div>
      <div className="stat-card-value" style={{ color }}>{value}</div>
      <div className="stat-card-label">{label}</div>
    </div>
  );
}

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
    return <div className="page-body" role="status">Loading your record…</div>;
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
      style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}
      initial="hidden"
      animate="visible"
    >
      <motion.div variants={fadeUp} custom={0}>
        <p className="eyebrow">Your record</p>
        <h1 className="section-heading" style={{ marginBottom: '0.35rem' }}>Achievements</h1>
        <p className="section-sub">Everything you have finished so far.</p>
      </motion.div>

      <motion.div variants={fadeUp} custom={1} className="stat-grid stat-grid-4">
        <Stat label="Courses completed" value={finished.length} icon="🎓" color="#28a745" />
        <Stat
          label="Activities completed"
          value={completions.isLoading ? '—' : (completions.data ?? 0)}
          icon="✅"
          color="var(--brand-primary)"
        />
        <Stat label="Quizzes passed" value={passed.length} icon="📝" color="var(--brand-secondary)" />
        <Stat
          label="Average score"
          value={average === null ? '—' : `${average}%`}
          icon="📊"
          color="var(--brand-accent)"
        />
      </motion.div>

      <motion.div variants={fadeUp} custom={2} className="card no-hover">
        <div className="card-title">🎓 Courses completed</div>
        {finished.length === 0 ? (
          <p style={{ color: 'var(--text-2)', margin: 0, fontSize: '0.9rem' }}>
            Nothing finished yet.{' '}
            <Link to="/trainee/courses" style={{ color: 'var(--brand-primary)' }}>
              Pick up where you left off
            </Link>.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
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
        <div className="card-title">📝 Quiz history</div>
        {attempts.length === 0 ? (
          <p style={{ color: 'var(--text-2)', margin: 0, fontSize: '0.9rem' }}>
            You have not finished a quiz yet.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
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
                  <Verdict status={a.status} />
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
