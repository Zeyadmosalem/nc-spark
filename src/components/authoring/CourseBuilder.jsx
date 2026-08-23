import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import QueryError from '../shared/QueryError';
import PageSkeleton from '../ui/Skeleton';
import Alert from '../ui/Alert';
import EmptyState from '../ui/EmptyState';
import { useToast } from '../ui/toast-context';
import { AUTHORABLE_TYPES, EMPTY_CONTENT } from '../../api/authoring';
import {
  useCourseForEditing,
  useCreateModule, useUpdateModule, useDeleteModule,
  useCreateActivity, useUpdateActivity, useDeleteActivity,
} from '../../hooks/useAuthoring';

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
 * Four of the seven activity types are authorable here. flashcards, matching
 * and scenario store structured content — decks, pairs, branching steps — and
 * each needs an editor of its own; a textarea of raw JSON is not one. They
 * remain seed-only and the picker says so rather than offering a form that
 * produces something the CHECK constraint rejects.
 */

const TYPE_LABEL = {
  reading: 'Reading',
  video: 'Video',
  submission: 'File submission',
  quiz: 'Quiz',
};

const TYPE_ICON = {
  reading: '📖', video: '🎬', submission: '📎', quiz: '📝',
  flashcards: '🃏', matching: '🔗', scenario: '🧭',
};

/** The one field each authorable type needs beyond a title. */
function ContentFields({ type, content, onChange }) {
  if (type === 'reading') {
    return (
      <div>
        <label className="input-label" htmlFor="act-body">Text</label>
        <textarea
          id="act-body" rows={6} className="input-field"
          value={content.body ?? ''}
          onChange={(e) => onChange({ body: e.target.value })}
        />
      </div>
    );
  }
  if (type === 'video') {
    return (
      <div>
        <label className="input-label" htmlFor="act-video">YouTube video ID</label>
        <input
          id="act-video" className="input-field" placeholder="dQw4w9WgXcQ"
          value={content.videoId ?? ''}
          onChange={(e) => onChange({ videoId: e.target.value })}
        />
        <p style={{ fontSize: '0.78rem', color: 'var(--text-3)', margin: '0.35rem 0 0' }}>
          The id only, not the whole URL — the part after <code className="inline-code">v=</code>.
        </p>
      </div>
    );
  }
  if (type === 'submission') {
    return (
      <p style={{ fontSize: '0.85rem', color: 'var(--text-2)', margin: 0 }}>
        Trainees upload a file here and a trainer reviews it. Nothing else to set up.
      </p>
    );
  }
  return (
    <p style={{ fontSize: '0.85rem', color: 'var(--text-2)', margin: 0 }}>
      This adds the quiz slot to the module. The questions themselves are still
      seeded with <code className="inline-code">npm run db:seed-quizzes</code> —
      trainer quiz authoring is backlog B6.
    </p>
  );
}

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
        <p style={{ color: 'var(--text-2)' }}>
          That course does not exist, or you cannot edit it.
        </p>
        <Link to={backTo} className="btn btn-ghost btn-sm">← Back</Link>
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
    <div className="page-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div>
        <Link to={backTo} style={{ fontSize: '0.85rem', color: 'var(--text-3)' }}>
          ← Back
        </Link>
        <h1 className="section-heading" style={{ margin: '0.5rem 0 0.35rem' }}>{title}</h1>
        <p className="section-sub">
          {modules.length} module{modules.length === 1 ? '' : 's'}, {totalActivities} activit
          {totalActivities === 1 ? 'y' : 'ies'}
          {status !== 'published' && totalActivities === 0
            && ' — add at least one activity before this can be published'}
        </p>
      </div>

      {modules.length === 0 ? (
        <EmptyState icon="🧱" title="No modules yet">
          A course is a list of modules, and each module is a list of activities.
          Add the first module below.
        </EmptyState>
      ) : (
        <div style={{ display: 'grid', gap: '1rem' }}>
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

      <form onSubmit={submitModule} className="card no-hover"
            style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 220 }}>
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

function ModuleCard({ courseId, module: mod, earlier }) {
  const { notify } = useToast();
  const rename = useUpdateModule();
  const remove = useDeleteModule();
  const addActivity = useCreateActivity();

  const [title, setTitle] = useState(mod.title);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [adding, setAdding] = useState(false);

  const busy = rename.isPending || remove.isPending;
  const dirty = title.trim() !== mod.title && title.trim() !== '';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      className="card no-hover"
    >
      <div style={{
        display: 'flex', gap: '0.75rem', alignItems: 'center',
        justifyContent: 'space-between', flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flex: 1, minWidth: 240 }}>
          <span style={{
            width: 28, height: 28, borderRadius: '50%', flexShrink: 0, fontSize: '0.8rem',
            display: 'grid', placeItems: 'center', fontWeight: 700,
            background: 'var(--surface-alt)', color: 'var(--text-2)',
          }}>
            {mod.position}
          </span>
          <input
            className="input-field"
            aria-label={`Title of module ${mod.position}`}
            value={title}
            disabled={busy}
            onChange={(e) => setTitle(e.target.value)}
          />
          {dirty && (
            <button
              type="button" className="btn btn-primary btn-sm" disabled={busy}
              onClick={() => rename.mutate(
                { id: mod.id, courseId, title: title.trim() },
                { onSuccess: () => notify('Module renamed.') },
              )}
            >
              Save
            </button>
          )}
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {/* Only earlier modules are offered. A module gated on a later one,
              or on itself, can never open. */}
          <label className="input-label" style={{ margin: 0 }} htmlFor={`gate-${mod.id}`}>
            Opens after
          </label>
          <select
            id={`gate-${mod.id}`}
            className="input-field"
            style={{ width: 'auto', padding: '0.4rem 0.6rem' }}
            value={mod.unlockAfterModuleId ?? ''}
            disabled={busy || earlier.length === 0}
            onChange={(e) => rename.mutate({
              id: mod.id, courseId, unlockAfterModuleId: e.target.value || null,
            })}
          >
            <option value="">Nothing — always open</option>
            {earlier.map((p) => (
              <option key={p.id} value={p.id}>{p.position}. {p.title}</option>
            ))}
          </select>

          {confirmingDelete ? (
            <>
              <button type="button" className="btn btn-sm btn-danger" disabled={busy}
                      onClick={() => remove.mutate(
                        { id: mod.id, courseId },
                        { onSuccess: () => notify(`Module "${mod.title}" deleted.`) },
                      )}>
                Delete module
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

      {confirmingDelete && mod.activities.length > 0 && (
        <p style={{ color: 'var(--brand-accent)', fontSize: '0.82rem', margin: '0.5rem 0 0' }}>
          This also deletes {mod.activities.length} activit
          {mod.activities.length === 1 ? 'y' : 'ies'} and every trainee&apos;s progress on them.
        </p>
      )}
      <Alert error={rename.error ?? remove.error} />

      <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        {mod.activities.length === 0 && !adding && (
          <p style={{ color: 'var(--text-3)', fontSize: '0.85rem', margin: 0 }}>
            No activities in this module yet.
          </p>
        )}
        {mod.activities.map((a) => (
          <ActivityRow key={a.id} courseId={courseId} activity={a} />
        ))}
      </div>

      {adding ? (
        <ActivityForm
          moduleId={mod.id}
          courseId={courseId}
          nextPosition={mod.activities.reduce((max, a) => Math.max(max, a.position), 0) + 1}
          mutation={addActivity}
          onAdded={(name) => notify(`"${name}" added to ${mod.title}.`)}
          onDone={() => setAdding(false)}
        />
      ) : (
        <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: '0.75rem' }}
                onClick={() => setAdding(true)}>
          + Add activity
        </button>
      )}
    </motion.div>
  );
}

function ActivityForm({ moduleId, courseId, nextPosition, mutation, onAdded, onDone }) {
  const [type, setType] = useState('reading');
  const [title, setTitle] = useState('');
  const [xp, setXp] = useState('10');
  const [content, setContent] = useState(EMPTY_CONTENT.reading);

  function pickType(next) {
    setType(next);
    // The CHECK constraint keys off the type, so the content has to be reset
    // to that type's shape or the insert is rejected.
    setContent(EMPTY_CONTENT[next] ?? {});
  }

  // Held as a string: clearing the field would otherwise put NaN in the value
  // attribute, which React rejects and which leaves the input unusable.
  const points = Number(xp);
  const badXp = xp.trim() === '' || Number.isNaN(points) || points < 0;

  async function submit(e) {
    e.preventDefault();
    await mutation
      .mutateAsync({
        courseId, moduleId, type, title: title.trim(), position: nextPosition,
        xp: points, content,
      })
      .then(() => {
        onAdded?.(title.trim());
        onDone();
      })
      .catch(() => null);
  }

  return (
    <form onSubmit={submit} style={{
      marginTop: '1rem', padding: '1rem', borderRadius: 'var(--r-lg)',
      background: 'var(--surface-alt)', border: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column', gap: '0.75rem',
    }}>
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <div>
          <label className="input-label" htmlFor="act-type">Type</label>
          <select id="act-type" className="input-field" style={{ width: 'auto' }}
                  value={type} onChange={(e) => pickType(e.target.value)}>
            {AUTHORABLE_TYPES.map((t) => (
              <option key={t} value={t}>{TYPE_ICON[t]} {TYPE_LABEL[t]}</option>
            ))}
          </select>
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <label className="input-label" htmlFor="act-title">Title</label>
          <input id="act-title" className="input-field" value={title}
                 onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div style={{ width: 90 }}>
          <label className="input-label" htmlFor="act-xp">XP</label>
          <input id="act-xp" className="input-field" inputMode="numeric" value={xp}
                 onChange={(e) => setXp(e.target.value)} />
        </div>
      </div>

      <ContentFields type={type} content={content}
                     onChange={(patch) => setContent((c) => ({ ...c, ...patch }))} />

      <p style={{ fontSize: '0.78rem', color: 'var(--text-3)', margin: 0 }}>
        Flashcards, matching and scenario activities are still seeded — each stores
        structured content that needs an editor of its own.
      </p>

      <Alert error={mutation.error} />

      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button type="submit" className="btn btn-primary btn-sm"
                disabled={mutation.isPending || !title.trim() || badXp}>
          {mutation.isPending ? 'Adding…' : 'Add activity'}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onDone}>Cancel</button>
      </div>
    </form>
  );
}

function ActivityRow({ courseId, activity }) {
  const { notify } = useToast();
  const update = useUpdateActivity();
  const remove = useDeleteActivity();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(activity.title);
  const [xp, setXp] = useState(String(activity.xp));
  const [content, setContent] = useState(activity.content ?? {});

  const busy = update.isPending || remove.isPending;
  const points = Number(xp);
  const badXp = xp.trim() === '' || Number.isNaN(points) || points < 0;

  return (
    <div style={{
      border: '1px solid var(--border)', borderRadius: 'var(--r-md)', padding: '0.6rem 0.8rem',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', minWidth: 0 }}>
          <span>{TYPE_ICON[activity.type] ?? '•'}</span>
          <span style={{ fontWeight: 600, fontSize: '0.92rem' }}>{activity.title}</span>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>
            {TYPE_LABEL[activity.type] ?? activity.type} · {activity.xp} XP
          </span>
        </div>
        <div style={{ display: 'flex', gap: '0.4rem' }}>
          <button type="button" className="btn btn-ghost btn-sm" disabled={busy}
                  onClick={() => setOpen((o) => !o)}>
            {open ? 'Close' : 'Edit'}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" disabled={busy}
                  style={{ color: '#dc3545' }}
                  onClick={() => remove.mutate(
                    { id: activity.id, courseId },
                    { onSuccess: () => notify(`"${activity.title}" removed.`) },
                  )}>
            Remove
          </button>
        </div>
      </div>

      {open && (
        <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <label className="input-label" htmlFor={`t-${activity.id}`}>Title</label>
              <input id={`t-${activity.id}`} className="input-field" value={title}
                     onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div style={{ width: 90 }}>
              <label className="input-label" htmlFor={`x-${activity.id}`}>XP</label>
              <input id={`x-${activity.id}`} className="input-field" inputMode="numeric" value={xp}
                     onChange={(e) => setXp(e.target.value)} />
            </div>
          </div>

          <ContentFields type={activity.type} content={content}
                         onChange={(patch) => setContent((c) => ({ ...c, ...patch }))} />

          <Alert error={update.error ?? remove.error} />

          <div>
            <button
              type="button" className="btn btn-primary btn-sm"
              disabled={busy || !title.trim() || badXp}
              onClick={() => update.mutate(
                { id: activity.id, courseId, title: title.trim(), xp: points, content },
                { onSuccess: () => notify('Activity saved.') },
              )}
            >
              {update.isPending ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      )}
      {!open && <Alert error={remove.error} />}
    </div>
  );
}
