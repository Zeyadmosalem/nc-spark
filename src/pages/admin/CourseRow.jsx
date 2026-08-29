import { useState } from 'react';
import { useDeleteCourse, usePublishCourse } from '../../hooks/useCourses';
import StatusPill from '../../components/ui/StatusPill';
import Button from '../../components/ui/Button';
import Alert from '../../components/ui/Alert';
import { useToast } from '../../components/ui/toast-context';
export default function CourseRow({ course, trainer, content, onEdit }) {
  const { notify } = useToast();
  const publish = usePublishCourse();
  const remove = useDeleteCourse();
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const isPublished = course.status === 'published';
  const busy = publish.isPending || remove.isPending;

  // publish-course refuses a course with no activities. Knowing that here turns
  // a 422 an admin has to provoke into a disabled button that says why.
  const activities = content?.activities;
  const cannotPublish = activities === 0 && !isPublished;

  return (
    <div className="card no-hover">
      <div className="cluster-between">
        <div className="cluster grow">
          <span className="course-chip" aria-hidden="true"
                style={{ '--chip': course.color ?? 'var(--brand-accent)' }}>
            {course.icon ?? '\u{1F4D8}'}
          </span>
          <div className="grow">
            <h3 className="row-title">{course.title}</h3>
            {course.subtitle && (
              <div className="text-sm muted-2">{course.subtitle}</div>
            )}
            <div className={`text-xs ${trainer ? 'muted' : 'warn'}`}>
              {trainer
                ? `Trainer: ${trainer}`
                : 'No trainer assigned — only an admin can edit or publish it'}
            </div>
            {content && (
              <div className={`text-xs ${cannotPublish ? 'warn' : 'muted'}`}>
                {content.modules} module{content.modules === 1 ? '' : 's'} ·{' '}
                {activities} activit{activities === 1 ? 'y' : 'ies'}
                {cannotPublish && ' — needs at least one activity before it can be published'}
              </div>
            )}
          </div>
        </div>

        <div className="cluster">
          <StatusPill status={course.status} />
          <Button to={`/admin/content/${course.id}`} variant="secondary" size="sm"
                  icon={activities === 0 ? 'add' : 'curriculum'}>
            {activities === 0 ? 'Add content' : 'Content'}
          </Button>
          <Button variant="ghost" size="sm" icon="edit" disabled={busy} onClick={onEdit}>
            Details
          </Button>
          <button
            type="button"
            className={`btn btn-sm ${isPublished ? 'btn-outline' : 'btn-primary'}`}
            disabled={busy || cannotPublish}
            title={cannotPublish ? 'Add an activity first' : undefined}
            onClick={() => publish.mutate(
              { courseId: course.id, publish: !isPublished },
              {
                onSuccess: () => notify(
                  isPublished
                    ? `${course.title} is back to draft — trainees can no longer see it.`
                    : `${course.title} is published and visible in the catalog.`,
                ),
              },
            )}
          >
            {publish.isPending ? 'Working…' : isPublished ? 'Unpublish' : 'Publish'}
          </button>

          {/* Deleting cascades to modules, activities and every enrolment on
              the course. One click is not enough for that. */}
          {confirmingDelete ? (
            <>
              <button
                type="button"
                className="btn btn-sm btn-danger"
                disabled={busy}
                onClick={() => remove.mutate(
                  { id: course.id },
                  { onSuccess: () => notify(`${course.title} deleted.`) },
                )}
              >
                Delete for good
              </button>
              <button type="button" className="btn btn-ghost btn-sm"
                      onClick={() => setConfirmingDelete(false)}>
                Cancel
              </button>
            </>
          ) : (
            <button type="button" className="btn btn-ghost btn-sm" disabled={busy}
                    onClick={() => setConfirmingDelete(true)}>
              Delete
            </button>
          )}
        </div>
      </div>
      <Alert error={publish.error ?? remove.error} />
    </div>
  );
}
