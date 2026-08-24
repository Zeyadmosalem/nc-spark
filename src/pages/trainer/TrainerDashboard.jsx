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
import Button from '../../components/ui/Button';
import Icon from '../../components/ui/Icon';
import PageHeader from '../../components/ui/PageHeader';
import { fadeUp, stagger, item } from '../../lib/motion';

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
    <motion.div className="page-body" variants={stagger()} initial="hidden" animate="visible">
      <PageHeader
        eyebrow="Teaching"
        icon="teaching"
        title={firstName ? `Hello, ${firstName}` : 'Hello'}
        subtitle={mine.length === 0
          ? 'No courses are assigned to you yet.'
          : `${mine.length} course${mine.length === 1 ? '' : 's'}, ${started.length} learner${started.length === 1 ? '' : 's'}.`}
      />

      {/* Everything in this block stops a trainee from progressing. */}
      <motion.section variants={fadeUp} custom={1}>
        <h2 className="group-title">
          <Icon name="inbox" size={17} />
          Waiting on you
          {waiting > 0 && <span className="group-count">{waiting} in total</span>}
        </h2>

        {waiting === 0 ? (
          <EmptyState icon="complete" title="All clear">
            Nothing is blocked on you. Every trainee on your courses can keep going.
          </EmptyState>
        ) : (
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            {toApprove.length > 0 && (
              <ApplicationQueue applications={toApprove} />
            )}
            {(toMark.length > 0 || stuck.length > 0) && (
              <div className="card no-hover card-accent">
                <h3 className="card-title"><Icon name="review" size={16} />Assessment</h3>
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
                  <Button to="/trainer/review" variant="primary" size="sm" iconAfter="forward">
                    Open the review queue
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </motion.section>

      <motion.div className="stat-grid" variants={stagger(0.045, 0.06)}>
        <StatCard label="Courses" value={mine.length} icon="courses"
                  sub={`${mine.filter((c) => c.status === 'published').length} published`}
                  color="var(--brand-primary)" />
        <StatCard label="Learners" value={started.length} icon="users" color="var(--brand-accent)" />
        <StatCard
          label="Average progress"
          value={averageProgress === null ? '—' : `${averageProgress}%`}
          icon="trend"
          color="#1a7f37"
        />
        <StatCard
          label="Completed"
          value={cohort.filter((e) => e.status === 'completed').length}
          icon="complete"
          color="var(--heading)"
        />
      </motion.div>

      <motion.section className="card no-hover" variants={item}>
        <h2 className="card-title"><Icon name="courses" size={16} />Your courses</h2>
        {mine.length === 0 ? (
          <EmptyState icon="teaching" title="Nothing assigned yet"
                      action={(
                        <Button to="/trainer/courses" variant="primary" icon="catalog">
                          Find a course to teach
                        </Button>
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
                  className="row-link"
                >
                  <span className="course-chip" aria-hidden="true"
                        style={{ '--chip': course.color ?? 'var(--brand-accent)' }}>
                    {course.icon ?? '\u{1F4D8}'}
                  </span>
                  <span className="data-row-main">
                    <span className="data-row-title">{course.title}</span>
                    <span className="data-row-meta">
                      {onCourse.length} learner{onCourse.length === 1 ? '' : 's'}
                      {progress !== null && ` · ${progress}% average progress`}
                    </span>
                  </span>
                  <Icon name="next" size={16} className="row-chevron" />
                </Link>
              );
            })}
          </div>
        )}
      </motion.section>
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
