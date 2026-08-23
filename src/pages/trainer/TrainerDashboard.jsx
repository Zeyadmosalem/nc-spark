import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { useSession } from '../../hooks/useSession';
import { useCourses, useCourseEnrollments } from '../../hooks/useCourses';
import { usePendingReviews, useBlockedAttempts } from '../../hooks/useReview';
import { usePendingEnrollments, useDecideEnrollment } from '../../hooks/useApprovals';
import QueryError from '../../components/shared/QueryError';
import PageSkeleton from '../../components/ui/Skeleton';
import StatCard from '../../components/ui/StatCard';
import EmptyState from '../../components/ui/EmptyState';
import Alert from '../../components/ui/Alert';
import { useToast } from '../../components/ui/toast-context';

/**
 * What a trainer needs to see first, on real data.
 *
 * The prototype version read the whole of AppContext: invented trainees with
 * invented XP, quiz submissions from a localStorage blob, and a second-attempt
 * request list that no longer exists. Every figure on it was fiction.
 *
 * The organising idea is different too. It opens with what is BLOCKED on this
 * trainer, because all three queues stop a trainee dead: an unmarked paragraph
 * holds up a quiz, a failed attempt with no retake ends a course, and an
 * unapproved application means somebody cannot start at all. Statistics come
 * after, because statistics are not actionable.
 *
 * Absent on purpose: XP and leaderboards (backlog B7, nothing awards them).
 */

const fadeUp = {
  hidden: { opacity: 0, y: 18 },
  visible: (i = 0) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.07, duration: 0.4, ease: [0.4, 0, 0.2, 1] },
  }),
};

const mean = (nums) =>
  (nums.length ? Math.round(nums.reduce((a, b) => a + b, 0) / nums.length) : null);

export default function TrainerDashboard() {
  const { profile } = useSession();
  const courses = useCourses();
  const enrolments = useCourseEnrollments();
  const pending = usePendingReviews();
  const blocked = useBlockedAttempts();
  const applications = usePendingEnrollments();

  if (courses.isLoading) {
    return <PageSkeleton label="Loading your dashboard" />;
  }
  if (courses.error) {
    return (
      <div className="page-body">
        <QueryError error={courses.error} what="your dashboard" />
      </div>
    );
  }

  const mine = (courses.data ?? []).filter((c) => c.trainerId === profile?.id);
  const myCourseIds = new Set(mine.map((c) => c.id));

  // Only enrolments on this trainer's own courses. An admin reading this page
  // would otherwise see the whole platform under the heading "your courses".
  const cohort = (enrolments.data ?? []).filter((e) => myCourseIds.has(e.courseId));
  const started = cohort.filter((e) => e.status === 'active' || e.status === 'completed');
  const averageProgress = mean(started.map((e) => e.percent));

  const toMark = pending.data ?? [];
  const stuck = blocked.data ?? [];
  const toApprove = (applications.data ?? []).filter((a) => myCourseIds.has(a.courseId));
  const waiting = toMark.length + stuck.length + toApprove.length;

  const firstName = (profile?.name ?? '').split(' ')[0];

  return (
    <motion.div
      className="page-body"
      style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}
      initial="hidden"
      animate="visible"
    >
      <motion.div variants={fadeUp} custom={0}>
        <p className="eyebrow">Teaching</p>
        <h1 className="section-heading" style={{ marginBottom: '0.35rem' }}>
          {firstName ? `Hello, ${firstName}` : 'Hello'}
        </h1>
        <p className="section-sub">
          {mine.length === 0
            ? 'No courses are assigned to you yet.'
            : `${mine.length} course${mine.length === 1 ? '' : 's'}, ${started.length} learner${started.length === 1 ? '' : 's'}.`}
        </p>
      </motion.div>

      {/* Everything in this block stops a trainee from progressing. */}
      <motion.section variants={fadeUp} custom={1}>
        <div className="section-header" style={{ marginBottom: '0.75rem' }}>
          <h2 style={{ fontSize: '1.1rem', margin: 0 }}>Waiting on you</h2>
          {waiting > 0 && <span className="section-count">{waiting} in total</span>}
        </div>

        {waiting === 0 ? (
          <EmptyState icon="✅" title="All clear">
            Nothing is blocked on you. Every trainee on your courses can keep going.
          </EmptyState>
        ) : (
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            {toApprove.length > 0 && (
              <ApplicationQueue applications={toApprove} />
            )}
            {(toMark.length > 0 || stuck.length > 0) && (
              <div className="card no-hover">
                <div className="card-title">Assessment</div>
                <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                  {toMark.length > 0 && (
                    <span style={{ color: 'var(--text-2)', fontSize: '0.9rem' }}>
                      <strong>{toMark.length}</strong> written answer
                      {toMark.length === 1 ? '' : 's'} to mark
                    </span>
                  )}
                  {stuck.length > 0 && (
                    <span style={{ color: 'var(--text-2)', fontSize: '0.9rem' }}>
                      <strong>{stuck.length}</strong> trainee{stuck.length === 1 ? '' : 's'} blocked
                      without a retake
                    </span>
                  )}
                  <Link to="/trainer/review" className="btn btn-primary btn-sm"
                        style={{ textDecoration: 'none' }}>
                    Open the review queue →
                  </Link>
                </div>
              </div>
            )}
          </div>
        )}
      </motion.section>

      <motion.div variants={fadeUp} custom={2} className="stat-grid stat-grid-4">
        <StatCard label="Courses" value={mine.length}
                  sub={`${mine.filter((c) => c.status === 'published').length} published`}
                  color="var(--brand-primary)" />
        <StatCard label="Learners" value={started.length} color="var(--brand-secondary)" />
        <StatCard
          label="Average progress"
          value={averageProgress === null ? '—' : `${averageProgress}%`}
          color="#28a745"
        />
        <StatCard
          label="Completed"
          value={cohort.filter((e) => e.status === 'completed').length}
          color="var(--heading)"
        />
      </motion.div>

      <motion.div variants={fadeUp} custom={3} className="card no-hover">
        <div className="card-title">Your courses</div>
        {mine.length === 0 ? (
          <EmptyState icon="📋" title="Nothing assigned yet"
                      action={(
                        <Link to="/trainer/courses" className="btn btn-primary"
                              style={{ textDecoration: 'none' }}>
                          Find a course to teach
                        </Link>
                      )}>
            An administrator assigns courses, or you can ask to take one on.
          </EmptyState>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {mine.map((course) => {
              const onCourse = started.filter((e) => e.courseId === course.id);
              const progress = mean(onCourse.map((e) => e.percent));
              return (
                <Link
                  key={course.id}
                  to={`/trainer/courses/${course.id}`}
                  className="data-row"
                >
                  <span style={{ fontSize: '1.3rem' }} aria-hidden="true">{course.icon ?? '📘'}</span>
                  <div className="data-row-main">
                    <div className="data-row-title">{course.title}</div>
                    <div className="data-row-meta">
                      {onCourse.length} learner{onCourse.length === 1 ? '' : 's'}
                      {progress !== null && ` · ${progress}% average progress`}
                    </div>
                  </div>
                  <span style={{ fontSize: '0.9rem', color: 'var(--text-3)' }} aria-hidden="true">→</span>
                </Link>
              );
            })}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

/**
 * Course applications waiting on a decision.
 *
 * This used to live on the Course Catalog page, which was otherwise a
 * prototype browsing screen that duplicated /trainer/courses. It belongs where
 * a trainer looks first: an unapproved application means somebody cannot start
 * at all, and nothing else in the product tells them they are waiting.
 */
function ApplicationQueue({ applications }) {
  const { notify } = useToast();
  const decide = useDecideEnrollment();

  return (
    <div className="card no-hover" style={{ borderLeft: '4px solid #b8860b' }}>
      <div className="card-title">
        Course applications ({applications.length})
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        {applications.map((a) => (
          <div key={a.id} className="data-row">
            <div className="avatar" style={{ width: '2rem', height: '2rem', fontSize: '0.7rem' }}
                 aria-hidden="true">
              {a.traineeAvatar}
            </div>
            <div className="data-row-main">
              <div className="data-row-title">{a.traineeName}</div>
              <div className="data-row-meta">wants to join {a.courseTitle}</div>
            </div>
            <div className="data-row-actions">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={decide.isPending}
                onClick={() => decide.mutate(
                  { enrollmentId: a.id, decision: 'approve' },
                  { onSuccess: () => notify(`${a.traineeName} can start ${a.courseTitle}.`) },
                )}
              >
                Approve
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={decide.isPending}
                onClick={() => decide.mutate(
                  { enrollmentId: a.id, decision: 'deny' },
                  { onSuccess: () => notify(`${a.traineeName} was not admitted.`) },
                )}
              >
                Deny
              </button>
            </div>
          </div>
        ))}
      </div>
      <Alert error={decide.error} />
    </div>
  );
}
