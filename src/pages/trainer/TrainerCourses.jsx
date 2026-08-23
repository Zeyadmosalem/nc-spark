import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useSession } from '../../hooks/useSession';
import { useCourses, usePublishCourse, useCourseContentCounts } from '../../hooks/useCourses';
import { useMyTeachingRequests, useRequestToTeach } from '../../hooks/useTeaching';
import QueryError from '../../components/shared/QueryError';

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

const STATUS_STYLE = {
  published: { bg: 'rgba(40,167,69,0.15)',  fg: '#28a745',       label: 'Published' },
  draft:     { bg: 'rgba(232,179,77,0.18)', fg: '#b8860b',       label: 'Draft' },
  archived:  { bg: 'var(--surface-alt)',    fg: 'var(--text-3)', label: 'Archived' },
};

function StatusPill({ status }) {
  const s = STATUS_STYLE[status] ?? STATUS_STYLE.archived;
  return (
    <span style={{
      background: s.bg, color: s.fg, fontSize: '0.7rem', fontWeight: 700,
      padding: '0.2rem 0.55rem', borderRadius: 999, textTransform: 'uppercase',
      letterSpacing: '0.04em', whiteSpace: 'nowrap',
    }}>
      {s.label}
    </span>
  );
}

// Module scope: a component declared during render remounts on every pass.
function Alert({ error }) {
  if (!error) return null;
  return (
    <p role="alert" style={{ color: 'var(--brand-accent)', fontSize: '0.85rem', margin: '0.5rem 0 0' }}>
      {error.message}
    </p>
  );
}

export default function TrainerCourses() {
  const { profile } = useSession();
  const courses = useCourses();
  const content = useCourseContentCounts();
  const requests = useMyTeachingRequests();

  if (courses.isLoading) {
    return <div className="page-body" role="status">Loading your courses…</div>;
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
    <div className="page-body" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div>
        <p className="eyebrow">Teaching</p>
        <h1 className="section-heading" style={{ marginBottom: '0.35rem' }}>My Courses</h1>
        <p className="section-sub">
          {mine.length} course{mine.length === 1 ? '' : 's'} assigned to you.
        </p>
      </div>

      {mine.length === 0 ? (
        <div className="card no-hover" style={{ textAlign: 'center', padding: '2.5rem' }}>
          <p style={{ color: 'var(--text-2)', margin: 0 }}>
            No courses are assigned to you yet. Ask to take one on below, or an
            administrator can assign you one.
          </p>
        </div>
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
          <button
            type="button"
            className={`btn btn-sm ${isPublished ? 'btn-outline' : 'btn-primary'}`}
            disabled={publish.isPending || cannotPublish}
            title={cannotPublish ? 'Add an activity first' : undefined}
            onClick={() => publish.mutate({ courseId: course.id, publish: !isPublished })}
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
            onClick={() => ask.mutate({ courseId: course.id })}
          >
            {ask.isPending ? 'Asking…' : 'Ask to teach this'}
          </button>
        )}
      </div>
      <Alert error={ask.error} />
    </div>
  );
}
