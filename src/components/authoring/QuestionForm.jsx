import { useState } from 'react';
import Alert from '../ui/Alert';
import { useSaveQuizQuestion } from '../../hooks/useAuthoring';
import { questionProblem } from '../../api/quizzes';
import McqOptions from './McqOptions';
import { TYPE_LABEL, BLANK_ANSWER } from './quizFields';

export default function QuestionForm({ quiz, activityId, courseId, initial, questionId, onSaved, onCancel }) {
  const save = useSaveQuizQuestion();
  const [q, setQ] = useState(initial);
  const idBase = questionId ?? 'new';

  const set = (patch) => setQ((prev) => ({ ...prev, ...patch }));

  function pickType(type) {
    // The answer key is shaped by the type. Carrying {index: 2} onto a
    // true/false question would be rejected by the function, and carrying
    // options onto one would render two answer widgets to the trainee.
    set({ type, answer: { ...BLANK_ANSWER[type] }, options: type === 'mcq' ? (q.options?.length ? q.options : ['', '']) : [] });
  }

  const problem = questionProblem(q);

  function submit(e) {
    e.preventDefault();
    save.mutate({
      quizId: quiz.id, questionId, activityId, courseId,
      type: q.type,
      prompt: q.prompt.trim(),
      options: q.type === 'mcq' ? q.options.map((o) => o.trim()) : [],
      points: Number(q.points),
      answer: q.answer,
      explanation: q.explanation,
    }, { onSuccess: onSaved });
  }

  return (
    <form onSubmit={submit} style={{
      padding: '0.9rem', borderRadius: 'var(--r-lg)',
      background: 'var(--surface-alt)', border: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column', gap: '0.75rem',
    }}>
      <div className="cluster">
        <div>
          <label className="input-label" htmlFor={`${idBase}-type`}>Type</label>
          <select id={`${idBase}-type`} className="input-field field-auto"
                  value={q.type} onChange={(e) => pickType(e.target.value)}>
            {Object.entries(TYPE_LABEL).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
        <div className="field-xs">
          <label className="input-label" htmlFor={`${idBase}-points`}>Points</label>
          <input id={`${idBase}-points`} className="input-field" inputMode="numeric"
                 value={q.points} onChange={(e) => set({ points: e.target.value })} />
        </div>
      </div>

      <div>
        <label className="input-label" htmlFor={`${idBase}-prompt`}>Question</label>
        <textarea id={`${idBase}-prompt`} className="input-field" rows={2}
                  placeholder="Which extinguisher is used on an electrical fire?"
                  value={q.prompt} onChange={(e) => set({ prompt: e.target.value })} />
      </div>

      {q.type === 'mcq' && (
        <McqOptions q={q} set={set} idBase={idBase} />
      )}

      {q.type === 'truefalse' && (
        <fieldset className="bare-fieldset">
          <legend className="input-label" style={{ padding: 0 }}>The statement is</legend>
          <div style={{ display: 'flex', gap: '1rem' }}>
            {[true, false].map((value) => (
              <label key={String(value)} style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                <input
                  type="radio"
                  name={`${idBase}-tf`}
                  checked={q.answer?.value === value}
                  onChange={() => set({ answer: { value } })}
                />
                {value ? 'True' : 'False'}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {q.type === 'paragraph' && (
        <div>
          <label className="input-label" htmlFor={`${idBase}-guidance`}>
            Marking guidance
          </label>
          <textarea
            id={`${idBase}-guidance`} className="input-field" rows={2}
            placeholder="What a full-marks answer covers"
            value={q.answer?.guidance ?? ''}
            onChange={(e) => set({ answer: { guidance: e.target.value } })}
          />
          {/* Worth stating: this is the only question type that stops an
              attempt being scored automatically. */}
          <p className="input-hint mt-xs">
            Only you see this, while marking. A written answer is not graded
            automatically — every attempt waits in Review Work until you mark it,
            and the trainee cannot move on until then.
          </p>
        </div>
      )}

      <div>
        <label className="input-label" htmlFor={`${idBase}-explanation`}>
          Explanation (optional)
        </label>
        <input
          id={`${idBase}-explanation`} className="input-field"
          placeholder="Shown after the attempt is graded"
          value={q.explanation ?? ''}
          onChange={(e) => set({ explanation: e.target.value })}
        />
      </div>

      {problem && (
        <p className="text-xs warn m-0">{problem}</p>
      )}
      <Alert error={save.error} />

      <div className="cluster">
        <button type="submit" className="btn btn-primary btn-sm"
                disabled={save.isPending || Boolean(problem)}>
          {save.isPending ? 'Saving…' : questionId ? 'Save question' : 'Add question'}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
