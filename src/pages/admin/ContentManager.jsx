import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  useCourses, useCreateCourse, useUpdateCourse, useDeleteCourse, usePublishCourse,
} from '../../hooks/useCourses';
import { useUsers, useTeachingRequests, useDecideTeachingRequest } from '../../hooks/useAdmin';
import QueryError from '../../components/shared/QueryError';

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

const ICONS = ['📘', '🔥', '🦺', '⚕️', '⚖️', '🔧', '🚚', '🧪', '💡', '🎯'];
const COLORS = ['#00a3e0', '#6b2c8d', '#e8b34d', '#28a745', '#dc3545', '#0f766e'];

const STATUS_STYLE = {
  published: { bg: 'rgba(40,167,69,0.15)',  fg: '#28a745',       label: 'Published' },
  draft:     { bg: 'rgba(232,179,77,0.18)', fg: '#b8860b',       label: 'Draft' },
  archived:  { bg: 'var(--surface-alt)',    fg: 'var(--text-3)', label: 'Archived' },
};

const EMPTY = { title: '', subtitle: '', description: '', icon: '📘', color: '#00a3e0' };

// Module scope: a component declared during render is a new type every pass,
// so React remounts it and any state it holds is lost.
function Alert({ error }) {
  if (!error) return null;
  return (
    <p role="alert" style={{ color: 'var(--brand-accent)', fontSize: '0.85rem', margin: '0.5rem 0 0' }}>
      {error.message}
    </p>
  );
}

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

export default function ContentManager() {
  const courses = useCourses();
  const users = useUsers();
  const requests = useTeachingRequests();
  const create = useCreateCourse();

  const [editing, setEditing] = useState(null); // a course, or EMPTY for a new one
  const [form, setForm] = useState(EMPTY);

  if (courses.isLoading) {
    return <div className="page-body" role="status">Loading the curriculum…</div>;
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
    await create.mutateAsync(form).then(() => setEditing(null)).catch(() => null);
  }

  return (
    <div className="page-body" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
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
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            <AnimatePresence initial={false}>
              {queue.map((r) => <TeachingRequestCard key={r.id} request={r} />)}
            </AnimatePresence>
          </div>
        </section>
      )}

      {list.length === 0 ? (
        <div className="card no-hover" style={{ textAlign: 'center', padding: '3rem' }}>
          <p style={{ color: 'var(--text-2)', marginBottom: '1rem' }}>
            No courses yet. Create one, add modules and activities, then publish it.
          </p>
          <button type="button" className="btn btn-primary" onClick={openNew}>
            Create the first course
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '1rem' }}>
          {list.map((course) => (
            <CourseRow
              key={course.id}
              course={course}
              trainer={trainerName(course.trainerId)}
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

function TeachingRequestCard({ request }) {
  const decide = useDecideTeachingRequest();
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      className="card no-hover"
      style={{ borderLeft: '4px solid var(--brand-secondary)' }}
    >
      <div style={{
        display: 'flex', alignItems: 'center', gap: '1rem',
        justifyContent: 'space-between', flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div className="avatar" style={{ width: 40, height: 40 }}>{request.trainerAvatar}</div>
          <div>
            <div style={{ fontWeight: 600 }}>{request.trainerName}</div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-2)' }}>
              wants to teach <strong>{request.courseTitle || 'a deleted course'}</strong>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={decide.isPending}
            onClick={() => decide.mutate({ requestId: request.id, decision: 'approve' })}
          >
            {decide.isPending ? 'Working…' : 'Approve'}
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={decide.isPending}
            onClick={() => decide.mutate({ requestId: request.id, decision: 'deny' })}
          >
            Deny
          </button>
        </div>
      </div>
      <Alert error={decide.error} />
    </motion.div>
  );
}

function CourseRow({ course, trainer, onEdit }) {
  const publish = usePublishCourse();
  const remove = useDeleteCourse();
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const isPublished = course.status === 'published';
  const busy = publish.isPending || remove.isPending;

  return (
    <div className="card no-hover">
      <div style={{
        display: 'flex', alignItems: 'center', gap: '1rem',
        justifyContent: 'space-between', flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', minWidth: 0 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 'var(--r-lg)', display: 'grid',
            placeItems: 'center', fontSize: '1.3rem', flexShrink: 0,
            background: `${course.color ?? '#00a3e0'}22`,
          }}>
            {course.icon ?? '📘'}
          </div>
          <div style={{ minWidth: 0 }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 600, margin: 0 }}>{course.title}</h3>
            {course.subtitle && (
              <div style={{ fontSize: '0.85rem', color: 'var(--text-2)' }}>{course.subtitle}</div>
            )}
            <div style={{ fontSize: '0.78rem', color: trainer ? 'var(--text-3)' : 'var(--brand-accent)' }}>
              {trainer
                ? `Trainer: ${trainer}`
                : 'No trainer assigned — only an admin can edit or publish it'}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <StatusPill status={course.status} />
          <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={onEdit}>
            Edit
          </button>
          <button
            type="button"
            className={`btn btn-sm ${isPublished ? 'btn-outline' : 'btn-primary'}`}
            disabled={busy}
            onClick={() => publish.mutate({ courseId: course.id, publish: !isPublished })}
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
                onClick={() => remove.mutate({ id: course.id })}
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

/** The edit dialog owns its own mutation so its pending state is per-course. */
function EditDialog({ course, form, setForm, onClose }) {
  const update = useUpdateCourse();

  async function submit(e) {
    e.preventDefault();
    await update.mutateAsync({ id: course.id, ...form }).then(onClose).catch(() => null);
  }

  return (
    <CourseDialog
      title={`Edit ${course.title}`}
      form={form}
      setForm={setForm}
      submitting={update.isPending}
      error={update.error}
      submitLabel="Save changes"
      onCancel={onClose}
      onSubmit={submit}
    />
  );
}

function CourseDialog({ title, form, setForm, submitting, error, submitLabel, onCancel, onSubmit }) {
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onCancel}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 999 }}
      />
      <motion.div
        role="dialog"
        aria-label={title}
        initial={{ opacity: 0, y: 20, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.97 }}
        style={{
          position: 'fixed', top: '10vh', left: '50%', transform: 'translateX(-50%)',
          background: 'var(--bg)', padding: '2rem', borderRadius: 'var(--r-xl)',
          zIndex: 1000, width: '90%', maxWidth: 520, maxHeight: '80vh', overflowY: 'auto',
          border: '1px solid var(--border)', boxShadow: 'var(--shadow-xl)',
        }}
      >
        <h2 style={{ marginBottom: '1.5rem', fontFamily: 'var(--font-heading)' }}>{title}</h2>

        <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label className="input-label" htmlFor="course-title">Title</label>
            <input
              id="course-title" required className="input-field" value={form.title}
              onChange={(e) => set({ title: e.target.value })}
            />
          </div>
          <div>
            <label className="input-label" htmlFor="course-subtitle">Subtitle</label>
            <input
              id="course-subtitle" className="input-field" value={form.subtitle}
              onChange={(e) => set({ subtitle: e.target.value })}
            />
          </div>
          <div>
            <label className="input-label" htmlFor="course-description">Description</label>
            <textarea
              id="course-description" rows={4} className="input-field" value={form.description}
              onChange={(e) => set({ description: e.target.value })}
            />
          </div>

          <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="input-label">Icon</legend>
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
              {ICONS.map((i) => (
                <button
                  key={i} type="button" aria-label={`Icon ${i}`} aria-pressed={form.icon === i}
                  onClick={() => set({ icon: i })}
                  style={{
                    width: 40, height: 40, fontSize: '1.2rem', cursor: 'pointer',
                    borderRadius: 'var(--r-md)', background: 'var(--surface-alt)',
                    border: form.icon === i
                      ? '2px solid var(--brand-primary)' : '1px solid var(--border)',
                  }}
                >
                  {i}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="input-label">Colour</legend>
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
              {COLORS.map((c) => (
                <button
                  key={c} type="button" aria-label={`Colour ${c}`} aria-pressed={form.color === c}
                  onClick={() => set({ color: c })}
                  style={{
                    width: 32, height: 32, borderRadius: '50%', background: c, cursor: 'pointer',
                    border: form.color === c ? '3px solid var(--heading)' : '1px solid var(--border)',
                  }}
                />
              ))}
            </div>
          </fieldset>

          <Alert error={error} />

          <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
            <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" style={{ flex: 1 }}
                    disabled={submitting || !form.title.trim()}>
              {submitting ? 'Saving…' : submitLabel}
            </button>
          </div>
        </form>
      </motion.div>
    </>
  );
}
