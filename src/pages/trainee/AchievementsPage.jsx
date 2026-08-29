import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { useMyEnrollments, useCourses } from '../../hooks/useCourses';
import { useMyQuizResults, useCompletedActivityCount } from '../../hooks/useProgress';
import { useMyXp, useMyXpEvents } from '../../hooks/useXp';
import { levelOf, pointsByDay, pointsByKind } from '../../api/xp';
import TrendChart from '../../components/charts/TrendChart';
import BarChart from '../../components/charts/BarChart';
import { KIND_COLOR } from '../../components/charts/chartTokens';
import { useBadgeCatalog, useMyBadges } from '../../hooks/useBadges';
import BadgeShelf from '../../components/gamification/BadgeShelf';
import QueryError from '../../components/shared/QueryError';
import PageSkeleton from '../../components/ui/Skeleton';
import PageHeader from '../../components/ui/PageHeader';
import { fadeUp } from '../../lib/motion';
import StatCard from '../../components/ui/StatCard';
import StatusPill from '../../components/ui/StatusPill';
import Icon from '../../components/ui/Icon';
import { formatDate } from '../../lib/format';

/**
 * What the trainee has actually achieved.
 *
 * The prototype version of this page led with "#3 of 12 trainees", an XP total
 * and a streak, all of it from dummyData. For a real trainee that is a
 * fabricated ranking against fabricated peers — the single most misleading
 * screen in the product.
 *
 * XP was display-only for four milestones: trainee_stats and activities.xp
 * both existed, every activity page advertised "+10 XP", and nothing anywhere
 * awarded a point — so this page deliberately showed completions and quiz
 * results instead of inventing a score.
 *
 * The triggers in 20260829000200_xp.sql now pay for finishing an activity,
 * passing a quiz and taking part in a course conversation, so the number is
 * real and this page can lead with it.
 */

export default function AchievementsPage() {
  const enrollments = useMyEnrollments();
  const courses = useCourses();
  const results = useMyQuizResults();
  const completions = useCompletedActivityCount(
    enrollments.data?.map((e) => e.id));
  const stats = useMyXp();
  const events = useMyXpEvents(200);
  const catalog = useBadgeCatalog();
  const badges = useMyBadges();

  if (enrollments.isLoading || courses.isLoading || results.isLoading || stats.isLoading) {
    return <PageSkeleton label="Loading your record" />;
  }

  const failure = enrollments.error ?? courses.error ?? results.error ?? stats.error;
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

  const xp = stats.data ?? { xp: 0, streak: 0 };
  const level = levelOf(xp.xp);
  const history = pointsByDay(events.data ?? [], 30);
  const sources = pointsByKind(events.data ?? []);
  const earnedRecently = history.some((d) => d.points > 0);
  const earnedCount = badges.data?.size ?? 0;

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

      {/* Two groups rather than seven tiles in one grid, which wrapped 5 and
          2 and read as an accident. Standing first, then the record. */}
      <motion.div variants={fadeUp} custom={1} className="stat-grid stat-grid-3">
        <StatCard label="Total XP" value={xp.xp} icon="achievements" color="var(--brand-primary)" />
        <StatCard
          label="Level"
          value={level.level}
          sub={`${level.toNext} XP to level ${level.level + 1}`}
          icon="trend"
          color="var(--brand-accent)"
        />
        <StatCard
          label="Day streak"
          value={xp.streak}
          sub={xp.streak > 0 ? 'Keep it going' : 'Finish something today'}
          icon="spark"
          color="var(--warn)"
        />
      </motion.div>

      <motion.div variants={fadeUp} custom={2} className="stat-grid stat-grid-4">
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

      {earnedRecently && (
        <motion.div variants={fadeUp} custom={2} className="card no-hover">
          <h2 className="card-title"><Icon name="trend" size={16} />XP over the last 30 days</h2>
          <TrendChart
            data={history}
            label="XP earned"
            formatValue={(n) => `${n} XP`}
          />
        </motion.div>
      )}

      {sources.length > 0 && (
        <motion.div variants={fadeUp} custom={3} className="card no-hover">
          <h2 className="card-title"><Icon name="achievements" size={16} />Where your XP came from</h2>
          <BarChart
            rows={sources.map((slice) => ({
              id: slice.kind, label: slice.label, value: slice.points,
            }))}
            formatValue={(n) => `${n} XP`}
            colorFor={(row) => KIND_COLOR[row.id]}
          />
        </motion.div>
      )}

      <motion.div variants={fadeUp} custom={4} className="card no-hover">
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
                      <div className="student-row-meta">Finished {formatDate(e.completedAt)}</div>
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
                    {a.submittedAt ? ` · ${formatDate(a.submittedAt)}` : ''}
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

      <motion.div variants={fadeUp} custom={5} className="card no-hover">
        <h2 className="card-title">
          <Icon name="achievements" size={16} />
          Badges
          <span className="section-count">
            {earnedCount} of {catalog.data?.length ?? 0}
          </span>
        </h2>
        {catalog.isLoading ? (
          <p className="muted-2">Loading badges…</p>
        ) : (
          <BadgeShelf catalog={catalog.data} earned={badges.data} />
        )}
      </motion.div>
    </motion.div>
  );
}
