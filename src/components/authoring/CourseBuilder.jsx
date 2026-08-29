import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import QueryError from '../shared/QueryError';
import CourseMaterials from '../shared/CourseMaterials';
import CourseTabs from '../shared/CourseTabs';
import PageSkeleton from '../ui/Skeleton';
import Alert from '../ui/Alert';
import EmptyState from '../ui/EmptyState';
import { useToast } from '../ui/toast-context';
import Icon from '../ui/Icon';
import { useCourseForEditing, useCreateModule } from '../../hooks/useAuthoring';
import ModuleCard from './ModuleCard';

/**
 * Putting content into a course.
 *
 * This is the screen the product has been missing. `modules_write` and
 * `activities_write` have been `for all` policies covering an admin or the
 * owning trainer since M2, with full grants — the database was ready and
 * nothing ever called it. The consequence was that a course created in the
 * admin console could never be published, because publish-course refuses a
 * course with zero activities and the only way to add one was
 * `npm run db:seed-catalog`.
 *
 * Every activity type the trainee side renders can now be written here.
 * flashcards, matching and scenario each store a nested array, and each has an
 * editor of its own in StructuredEditors.jsx — a textarea of raw JSON was the
 * alternative, and `activities_content_shape` would have turned every typo in
 * it into an unexplained 400.
 */


/**
 * @param backTo  where the breadcrumb goes. The same policies authorise an
 *                admin and the owning trainer, so both roles mount this; only
 *                the route they came from differs.
 */
export default function CourseBuilder({ backTo = '/admin/content' }) {
  const { courseId } = useParams();
  const course = useCourseForEditing(courseId);
  const addModule = useCreateModule();
  const { notify } = useToast();

  const [newModuleTitle, setNewModuleTitle] = useState('');

  if (course.isLoading) {
    return <PageSkeleton label="Loading the course" stats={0} rows={3} />;
  }
  if (course.error) {
    return (
      <div className="page-body">
        <QueryError error={course.error} what="this course" />
      </div>
    );
  }
  if (!course.data) {
    return (
      <div className="page-body">
        <p className="muted-2">
          That course does not exist, or you cannot edit it.
        </p>
        <Link to={backTo} className="crumb">
          <Icon name="back" size={14} />
          Back
        </Link>
      </div>
    );
  }

  const { title, status, modules } = course.data;
  const totalActivities = modules.reduce((n, m) => n + m.activities.length, 0);

  async function submitModule(e) {
    e.preventDefault();
    const trimmed = newModuleTitle.trim();
    if (!trimmed) return;
    // position is UNIQUE per course and nothing assigns it. Taking max+1 from
    // what is on screen rather than counting modules survives a deletion in
    // the middle, which would otherwise reuse a number that still exists.
    const nextPosition = modules.reduce((max, m) => Math.max(max, m.position), 0) + 1;
    await addModule
      .mutateAsync({ courseId, title: trimmed, position: nextPosition })
      .then(() => {
        notify(`Module "${trimmed}" added.`);
        setNewModuleTitle('');
      })
      .catch(() => null);
  }

  return (
    <div className="page-body stack-lg">
      <div>
        <Link to={backTo} style={{ fontSize: '0.85rem', color: 'var(--text-3)' }}>
          <Icon name="back" size={14} />
          Back
        </Link>
        <h1 className="section-heading" style={{ margin: '0.5rem 0 0.35rem' }}>{title}</h1>
        <p className="section-sub">
          {modules.length} module{modules.length === 1 ? '' : 's'}, {totalActivities} activit
          {totalActivities === 1 ? 'y' : 'ies'}
          {status !== 'published' && totalActivities === 0
            && ' — add at least one activity before this can be published'}
        </p>
        {/* Content, cohort and conversation are the three views of one
            course, and they all hang off the same id. The chat used to be
            further down this very page, which is why nobody found it. */}
        <div style={{ marginTop: '0.75rem' }}>
          {/* backTo is the course list this was reached from, so the course
              itself is always one segment below it: /admin/content/:id for an
              admin, /trainer/courses/:id for a trainer. */}
          <CourseTabs base={`${backTo}/${courseId}`} />
        </div>
      </div>

      {modules.length === 0 ? (
        <EmptyState icon="curriculum" title="No modules yet">
          A course is a list of modules, and each module is a list of activities.
          Add the first module below.
        </EmptyState>
      ) : (
        <div className="grid">
          <AnimatePresence initial={false}>
            {modules.map((m, i) => (
              <ModuleCard
                key={m.id}
                courseId={courseId}
                module={m}
                earlier={modules.slice(0, i)}
              />
            ))}
          </AnimatePresence>
        </div>
      )}

      <section>
        <h2 style={{ fontSize: '1.1rem', marginBottom: '0.75rem' }}>Materials</h2>
        {/* The same component a trainee sees, with the controls turned on.
            course_materials_write already limits those to an admin or the
            owning trainer, so canManage decides what to render and the
            database decides what is allowed. */}
        <CourseMaterials courseId={courseId} canManage />
      </section>

      <form onSubmit={submitModule} className="card no-hover cluster">
        <div className="grow-field">
          <label className="input-label" htmlFor="new-module">New module</label>
          <input
            id="new-module" className="input-field" placeholder="e.g. Fire extinguisher types"
            value={newModuleTitle}
            onChange={(e) => setNewModuleTitle(e.target.value)}
          />
        </div>
        <button type="submit" className="btn btn-primary"
                disabled={addModule.isPending || !newModuleTitle.trim()}>
          {addModule.isPending ? 'Adding…' : 'Add module'}
        </button>
        <div style={{ flexBasis: '100%' }}><Alert error={addModule.error} /></div>
      </form>
    </div>
  );
}

