import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useSession } from '../../hooks/useSession';
import { useCourses, usePublishCourse, useCourseContentCounts } from '../../hooks/useCourses';
import { useMyTeachingRequests, useRequestToTeach } from '../../hooks/useTeaching';
import QueryError from '../../components/shared/QueryError';
import PageSkeleton from '../../components/ui/Skeleton';
import PageHeader from '../../components/ui/PageHeader';
import StatusPill from '../../components/ui/StatusPill';
import Alert from '../../components/ui/Alert';
import EmptyState from '../../components/ui/EmptyState';
import { useToast } from '../../components/ui/toast-context';

/**
 * A trainer's own courses, and the ones they can ask to take on.
 *
 * A trainer cannot create a course — courses_insert_admin is admin-only — and
 * cannot assign themselves one, because trainer_id is excluded from the UPDATE
 * grant. The only route is to ask, and for an admin to approve. This is the
 * other half of the queue on the admin Curriculum page.
 *
 * Editing content uses the same CourseBuilder the admin console uses:
 * modules_write and activities_write authorise the owning trainer identically,
 * so there is no second implementation to keep in step.
 */

export default function TrainerCourses() {
  const { profile } = useSession();
  const courses = useCourses();
  const content = useCourseContentCounts();
  const requests = useMyTeachingRequests();

  if (courses.isLoading) {
    return <PageSkeleton label="Loading your courses" stats={0} rows={4} />;
  }
  if (courses.error) {
    return (
      <div className="page-body">
        <QueryError error={courses.error} what="your courses" />
      </div>
    );
  }

  const all = courses.data ?? [];
  const mine = all.filter((c) => c.trainerId === profile?.id);
  // Only published courses with no trainer are visible to ask about: an
  // unassigned draft is not readable by anyone but an admin.
  const unclaimed = all.filter((c) => !c.trainerId);
  const pendingOn = new Set(
    (requests.data ?? []).filter((r) => r.status === 'pending').map((r) => r.courseId));

  return (
    <div className="page-body">
      <PageHeader
        eyebrow="Teaching"
        icon="teaching"
        title="My courses"
        subtitle={`${mine.length} course${mine.length === 1 ? '' : 's'} assigned to you.`}
      />

      {mine.length === 0 ? (
        <EmptyState icon="📋" title="No courses yet">
          Nothing is assigned to you. Ask to take a course on below, or an
          administrator can assign you one.
        </EmptyState>
      ) : (
        <div style={{ display: 'grid', gap: '1rem' }}>
          {mine.map((course) => (
            <MyCourseRow
              key={course.id}
              course={course}
              content={content.data?.[course.id]}
            />
          ))}
        </div>
      )}

      {unclaimed.length > 0 && (
        <section>
          <h2 style={{ fontSize: '1.1rem', marginBottom: '0.75rem' }}>
            Courses looking for a trainer ({unclaimed.length})
          </h2>
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            {unclaimed.map((course) => (
              <ClaimRow key={course.id} course={course} alreadyAsked={pendingOn.has(course.id)} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function MyCourseRow({ course, content }) {
  const { notify } = useToast();
  const publish = usePublishCourse();

  const isPublished = course.status === 'published';
  const activities = content?.activities;
  const cannotPublish = activities === 0 && !isPublished;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="card no-hover">
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
            <h3 style={{ fontSize: '1.05rem', fontWeight: 600, margin: 0 }}>{course.title}</h3>
            {course.subtitle && (
              <div style={{ fontSize: '0.85rem', color: 'var(--text-2)' }}>{course.subtitle}</div>
            )}
            {content && (
              <div style={{
                fontSize: '0.78rem',
                color: cannotPublish ? 'var(--brand-accent)' : 'var(--text-3)',
              }}>
                {content.modules} module{content.modules === 1 ? '' : 's'} ·{' '}
                {activities} activit{activities === 1 ? 'y' : 'ies'}
                {cannotPublish && ' — add one before this can be published'}
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <StatusPill status={course.status} />
          <Link
            to={`/trainer/courses/${course.id}`}
            className="btn btn-ghost btn-sm"
            style={{ textDecoration: 'none' }}
          >
            {activities === 0 ? 'Add content' : 'Content'}
          </Link>
          {/* The other half of running a course: who is on it and how far
              they have got. There was no screen for that at all. */}
          <Link
            to={`/trainer/courses/${course.id}/people`}
            className="btn btn-ghost btn-sm"
            style={{ textDecoration: 'none' }}
          >
            People
          </Link>
          <button
            type="button"
            className={`btn btn-sm ${isPublished ? 'btn-outline' : 'btn-primary'}`}
            disabled={publish.isPending || cannotPublish}
            title={cannotPublish ? 'Add an activity first' : undefined}
            onClick={() => publish.mutate(
              { courseId: course.id, publish: !isPublished },
              {
                onSuccess: () => notify(
                  isPublished
                    ? `${course.title} is back to draft.`
                    : `${course.title} is live in the catalog.`,
                ),
              },
            )}
          >
            {publish.isPending ? 'Working…' : isPublished ? 'Unpublish' : 'Publish'}
          </button>
        </div>
      </div>
      <Alert error={publish.error} />
    </motion.div>
  );
}

function ClaimRow({ course, alreadyAsked }) {
  const { notify } = useToast();
  const ask = useRequestToTeach();

  return (
    <div className="card no-hover">
      <div style={{
        display: 'flex', alignItems: 'center', gap: '1rem',
        justifyContent: 'space-between', flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
          <span style={{ fontSize: '1.2rem' }}>{course.icon ?? '📘'}</span>
          <div>
            <div style={{ fontWeight: 600 }}>{course.title}</div>
            {course.subtitle && (
              <div style={{ fontSize: '0.82rem', color: 'var(--text-2)' }}>{course.subtitle}</div>
            )}
          </div>
        </div>

        {/* Asking twice hits teaching_requests_one_open, a partial unique index
            over pending rows. Better to say it is already pending than to let
            the click produce a duplicate-key error. */}
        {alreadyAsked ? (
          <span className="chip">⏳ Waiting on an admin</span>
        ) : (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={ask.isPending}
            onClick={() => ask.mutate(
              { courseId: course.id },
              { onSuccess: () => notify(`Asked to teach ${course.title}. An admin decides next.`) },
            )}
          >
            {ask.isPending ? 'Asking…' : 'Ask to teach this'}
          </button>
        )}
      </div>
      <Alert error={ask.error} />
    </div>
  );
}
