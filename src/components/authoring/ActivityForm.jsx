import { useState } from 'react';
import Alert from '../ui/Alert';
import { AUTHORABLE_TYPES, EMPTY_CONTENT, structuredProblem } from '../../api/authoring';
import ContentFields from './ContentFields';
import { TYPE_LABEL } from './activityTypes';
export default function ActivityForm({ moduleId, courseId, nextPosition, mutation, onAdded, onDone }) {
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
  // Empty content passes the CHECK constraint — `{cards: []}` stores fine and
  // renders to a trainee as "No cards provided."
  const problem = structuredProblem(type, content);

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
    <form onSubmit={submit} className="u-col u-mt-4 u-p4 u-r-lg u-alt u-bordered u-gap-3">
      <div className="cluster">
        <div>
          <label className="input-label" htmlFor="act-type">Type</label>
          <select id="act-type" className="input-field field-auto"
                  value={type} onChange={(e) => pickType(e.target.value)}>
            {AUTHORABLE_TYPES.map((t) => (
              <option key={t} value={t}>{TYPE_LABEL[t]}</option>
            ))}
          </select>
        </div>
        <div className="grow-field">
          <label className="input-label" htmlFor="act-title">Title</label>
          <input id="act-title" className="input-field" value={title}
                 onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="field-xs">
          <label className="input-label" htmlFor="act-xp">XP</label>
          <input id="act-xp" className="input-field" inputMode="numeric" value={xp}
                 onChange={(e) => setXp(e.target.value)} />
        </div>
      </div>

      <ContentFields type={type} content={content} idPrefix="new"
                     onChange={(patch) => setContent((c) => ({ ...c, ...patch }))} />

      {/* Said, not just enforced. A Save button that is disabled for a reason
          nobody states is its own dead end. */}
      {problem && (
        <p className="text-xs warn m-0">
          {problem}
        </p>
      )}

      <Alert error={mutation.error} />

      <div className="cluster">
        <button type="submit" className="btn btn-primary btn-sm"
                disabled={mutation.isPending || !title.trim() || badXp || Boolean(problem)}>
          {mutation.isPending ? 'Adding…' : 'Add activity'}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onDone}>Cancel</button>
      </div>
    </form>
  );
}
