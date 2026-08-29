import { useState } from 'react';
import Alert from '../ui/Alert';
import { useToast } from '../ui/toast-context';
import { structuredProblem } from '../../api/authoring';
import QuizEditor from './QuizEditor';
import Icon from '../ui/Icon';
import { useUpdateActivity, useDeleteActivity } from '../../hooks/useAuthoring';
import ContentFields from './ContentFields';
import { TYPE_LABEL } from './activityTypes';

export default function ActivityRow({ courseId, activity }) {
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
  const problem = structuredProblem(activity.type, content);

  return (
    <div style={{
      border: '1px solid var(--border)', borderRadius: 'var(--r-md)', padding: '0.6rem 0.8rem',
    }}>
      <div className="u-row u-gap-3 u-between">
        <div className="cluster grow">
          <span className="row-icon" style={{ width: '1.6rem', height: '1.6rem' }}>
            <Icon name={activity.type} size={14} />
          </span>
          <span style={{ fontWeight: 600, fontSize: '0.92rem' }}>{activity.title}</span>
          <span className="text-xs muted">
            {TYPE_LABEL[activity.type] ?? activity.type} · {activity.xp} XP
          </span>
        </div>
        <div style={{ display: 'flex', gap: '0.4rem' }}>
          <button type="button" className="btn btn-ghost btn-sm" disabled={busy}
                  onClick={() => setOpen((o) => !o)}>
            {open ? 'Close' : 'Edit'}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" disabled={busy}
                  style={{ color: 'var(--danger)' }}
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
          <div className="cluster">
            <div className="grow-field">
              <label className="input-label" htmlFor={`t-${activity.id}`}>Title</label>
              <input id={`t-${activity.id}`} className="input-field" value={title}
                     onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="field-xs">
              <label className="input-label" htmlFor={`x-${activity.id}`}>XP</label>
              <input id={`x-${activity.id}`} className="input-field" inputMode="numeric" value={xp}
                     onChange={(e) => setXp(e.target.value)} />
            </div>
          </div>

          <ContentFields type={activity.type} content={content} idPrefix={`a${activity.id}`}
                         onChange={(patch) => setContent((c) => ({ ...c, ...patch }))} />

          {/* The quiz lives in its own tables behind an Edge Function, so it
              saves on its own rather than through this row's Save button. */}
          {activity.type === 'quiz' && (
            <QuizEditor
              activityId={activity.id}
              activityTitle={activity.title}
              courseId={courseId}
            />
          )}

          {problem && (
            <p className="text-xs warn m-0">
              {problem}
            </p>
          )}

          <Alert error={update.error ?? remove.error} />

          <div>
            <button
              type="button" className="btn btn-primary btn-sm"
              disabled={busy || !title.trim() || badXp || Boolean(problem)}
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
