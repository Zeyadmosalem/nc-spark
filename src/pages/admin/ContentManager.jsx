import { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useCourses, useCreateCourse, useCourseContentCounts } from '../../hooks/useCourses';
import { useUsers, useTeachingRequests } from '../../hooks/useAdmin';
import QueryError from '../../components/shared/QueryError';
import PageSkeleton from '../../components/ui/Skeleton';
import EmptyState from '../../components/ui/EmptyState';
import { useToast } from '../../components/ui/toast-context';
import CourseDialog from './CourseDialog';
import EditDialog from './EditDialog';
import TeachingRequestCard from './TeachingRequestCard';
import CourseRow from './CourseRow';

/**
 * The curriculum, on real courses.
 *
 * Scope is narrower than the prototype's four tabs on purpose. Activities,
 * quizzes and learning paths were all in-memory forms with no server-side
 * counterpart; authoring is backlog B6, and leaving dead tabs beside working
 * ones is worse than not offering them.
 *
 * Two rules the server owns, which this page only surfaces:
 * - Publishing goes through publish-course, which refuses a course with no
 *   activities (422). A published empty shell is a course a trainee can enrol
 *   in and then find nothing to do.
 * - courses.trainer_id is excluded from the UPDATE grant, so a trainer cannot
 *   be picked from a dropdown here. A trainer requests a course and an admin
 *   approves; that queue is the only way a course gets an owner.
 */


const EMPTY = { title: '', subtitle: '', description: '', icon: '📘', color: '#00a3e0' };

export default function ContentManager() {
  const courses = useCourses();
  const users = useUsers();
  const requests = useTeachingRequests();
  const content = useCourseContentCounts();
  const create = useCreateCourse();
  const { notify } = useToast();

  const [editing, setEditing] = useState(null); // a course, or EMPTY for a new one
  const [form, setForm] = useState(EMPTY);

  if (courses.isLoading) {
    return <PageSkeleton label="Loading the curriculum" stats={0} rows={4} />;
  }
  if (courses.error) {
    return (
      <div className="page-body">
        <QueryError error={courses.error} what="the curriculum" />
      </div>
    );
  }

  const list = courses.data ?? [];
  const queue = requests.data ?? [];
  const trainerName = (id) =>
    (users.data ?? []).find((u) => u.id === id)?.name ?? null;

  function openNew() {
    setForm(EMPTY);
    setEditing('new');
  }

  function openEdit(course) {
    setForm({
      title: course.title ?? '', subtitle: course.subtitle ?? '',
      description: course.description ?? '', icon: course.icon ?? '📘',
      color: course.color ?? '#00a3e0',
    });
    setEditing(course);
  }

  async function submitNew(e) {
    e.preventDefault();
    await create.mutateAsync(form)
      .then(() => {
        notify(`${form.title} created. Add some content before publishing it.`);
        setEditing(null);
      })
      .catch(() => null);
  }

  return (
    <div className="page-body stack-lg">
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
        flexWrap: 'wrap', gap: '1rem',
      }}>
        <div>
          <p className="eyebrow">Curriculum</p>
          <h1 className="section-heading" style={{ marginBottom: '0.35rem' }}>Courses</h1>
          <p className="section-sub">
            {list.length} course{list.length === 1 ? '' : 's'} ·{' '}
            {list.filter((c) => c.status === 'published').length} published
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={openNew}>
          + New course
        </button>
      </div>

      {/* The only route to a course having an owner. A course with no trainer
          cannot be edited or published by anyone but an admin. */}
      {queue.length > 0 && (
        <section>
          <h2 style={{ fontSize: '1.1rem', marginBottom: '0.75rem' }}>
            Trainers asking to teach ({queue.length})
          </h2>
          <div className="grid-sm">
            <AnimatePresence initial={false}>
              {queue.map((r) => <TeachingRequestCard key={r.id} request={r} />)}
            </AnimatePresence>
          </div>
        </section>
      )}

      {list.length === 0 ? (
        <EmptyState
          icon="courses"
          title="No courses yet"
          action={(
            <button type="button" className="btn btn-primary" onClick={openNew}>
              Create the first course
            </button>
          )}
        >
          A course holds modules, and a module holds activities. Create one, add
          content to it, then publish it.
        </EmptyState>
      ) : (
        <div className="grid">
          {list.map((course) => (
            <CourseRow
              key={course.id}
              course={course}
              trainer={trainerName(course.trainerId)}
              content={content.data?.[course.id]}
              onEdit={() => openEdit(course)}
            />
          ))}
        </div>
      )}

      <AnimatePresence>
        {editing === 'new' && (
          <CourseDialog
            title="New course"
            form={form}
            setForm={setForm}
            submitting={create.isPending}
            error={create.error}
            submitLabel="Create"
            onCancel={() => setEditing(null)}
            onSubmit={submitNew}
          />
        )}
        {editing && editing !== 'new' && (
          <EditDialog
            course={editing}
            form={form}
            setForm={setForm}
            onClose={() => setEditing(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

