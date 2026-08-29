import { useState } from 'react';
import { motion } from 'framer-motion';
import Alert from '../ui/Alert';
import { useToast } from '../ui/toast-context';
import { useUpdateModule, useDeleteModule, useCreateActivity } from '../../hooks/useAuthoring';
import ActivityRow from './ActivityRow';
import ActivityForm from './ActivityForm';

export default function ModuleCard({ courseId, module: mod, earlier }) {
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
          <label className="input-label m-0" htmlFor={`gate-${mod.id}`}>
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
