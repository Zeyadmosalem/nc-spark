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
import Button from '../../components/ui/Button';
import Icon from '../../components/ui/Icon';
import { fadeUp, stagger, item } from '../../lib/motion';

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
      variants={stagger()}
      initial="hidden"
      animate="visible"
    >
      {/* Anything a trainer did while the trainee was away. Renders nothing
          when there is nothing to say, so it costs no space on a quiet day. */}
      <TraineeNotices />

      <motion.section className="hero" variants={fadeUp} custom={0}>
        <div className="hero-inner">
          <div className="grow">
            <p className="hero-eyebrow">
              <Icon name="spark" size={12} />
              Your training
            </p>
            <h1 className="hero-title">
              {firstName ? `Welcome back, ${firstName}` : 'Welcome back'}
            </h1>
            <p className="hero-sub">
              {started.length === 0
                ? 'You have not started a course yet.'
                : `${overall}% through ${started.length} course${started.length === 1 ? '' : 's'}.`}
            </p>
          </div>

          {resumeCourse && (
            <Button
              to={`/trainee/courses/${resumeCourse.id}`}
              variant="primary"
              iconAfter="forward"
            >
              {/*
                The title is not in the label. A course called "Workplace
                Health, Safety and Environmental Compliance" made this button
                wider than the panel it sits in, and wrapped the hero.
              */}
              Continue where you left off
            </Button>
          )}
        </div>
      </motion.section>

      <motion.div className="stat-grid" variants={stagger(0.05, 0.08)}>
        <StatCard label="Overall progress" value={`${overall}%`} icon="trend" color="var(--brand-primary)" />
        <StatCard label="In progress" value={active.length} icon="courses" color="var(--brand-accent)" />
        <StatCard label="Completed" value={completed.length} icon="complete" color="#1a7f37" />
        <StatCard
          label="Awaiting approval"
          value={waiting.length}
          icon="waiting"
          color={waiting.length > 0 ? 'var(--warn)' : 'var(--text-3)'}
          tone={waiting.length > 0 ? 'attention' : undefined}
        />
      </motion.div>

      <motion.section className="card no-hover" variants={item}>
        <h2 className="card-title">
          <Icon name="courses" size={17} />
          My courses
        </h2>

        {started.length === 0 && waiting.length === 0 ? (
          <EmptyState
            icon="catalog"
            title="Nothing on your plate yet"
            action={<Button to="/trainee/catalog" variant="primary" icon="catalog">Browse the catalog</Button>}
          >
            You are not enrolled in any course yet. Find one in the catalog and
            apply — a trainer approves you, then you can start.
          </EmptyState>
        ) : (
          <motion.div className="stack" variants={stagger(0.04)}>
            {started.map((e) => {
              const course = byId.get(e.courseId);
              if (!course) return null;
              return (
                <motion.div key={e.id} variants={item}>
                  <Link to={`/trainee/courses/${course.id}`} className="row-link">
                    <span
                      className="course-chip"
                      aria-hidden="true"
                      style={{ '--chip': course.color ?? 'var(--brand-accent)' }}
                    >
                      {course.icon ?? '\u{1F4D8}'}
                    </span>
                    <span className="data-row-main">
                      <span className="data-row-title">{course.title}</span>
                      <span className="data-row-meta">
                        {e.status === 'completed' ? 'Completed' : course.subtitle}
                      </span>
                    </span>
                    <ProgressRing radius={22} stroke={4} progress={e.percent ?? 0} />
                    <Icon name="next" size={16} className="row-chevron" />
                  </Link>
                </motion.div>
              );
            })}

            {/* A pending application is not a course yet: no progress, nowhere
                to click. Showing it stops a trainee re-applying. */}
            {waiting.map((e) => {
              const course = byId.get(e.courseId);
              if (!course) return null;
              return (
                <motion.div key={e.id} className="row-static" variants={item}>
                  <span className="course-chip course-chip-muted" aria-hidden="true">
                    {course.icon ?? '\u{1F4D8}'}
                  </span>
                  <span className="data-row-main">
                    <span className="data-row-title">{course.title}</span>
                    <span className="data-row-meta">Waiting for a trainer to approve you</span>
                  </span>
                  <span className="chip">
                    <Icon name="pending" size={12} />
                    Pending
                  </span>
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </motion.section>
    </motion.div>
  );
}
