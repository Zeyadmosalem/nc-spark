import Icon from '../ui/Icon';

export default function McqOptions({ q, set, idBase }) {
  const options = q.options ?? ['', ''];
  const correct = q.answer?.index ?? 0;

  return (
    <fieldset className="bare-fieldset">
      <legend className="input-label" style={{ padding: 0 }}>
        Options — select the correct one
      </legend>
      <div className="stack-xs">
        {options.map((option, i) => (
          <div key={i} style={{
            display: 'flex', gap: '0.5rem', alignItems: 'center',
            padding: '0.35rem 0.5rem', borderRadius: 'var(--r-sm)',
            background: correct === i ? 'rgba(40,167,69,0.08)' : 'transparent',
          }}>
            <input
              type="radio"
              name={`${idBase}-correct`}
              aria-label={`Option ${i + 1} is correct`}
              checked={correct === i}
              onChange={() => set({ answer: { index: i } })}
            />
            <label className="sr-only" htmlFor={`${idBase}-opt-${i}`}>Option {i + 1}</label>
            <input
              id={`${idBase}-opt-${i}`}
              className="input-field"
              value={option}
              onChange={(e) => set({
                options: options.map((o, j) => (j === i ? e.target.value : o)),
              })}
            />
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ color: options.length > 2 ? '#dc3545' : 'var(--text-3)' }}
              disabled={options.length <= 2}
              aria-label={`Remove option ${i + 1}`}
              onClick={() => {
                const kept = options.filter((_, j) => j !== i);
                /*
                 * The answer is stored as an index, so deleting an option
                 * above the correct one silently moves the right answer to a
                 * different line — and submit-quiz compares indexes, so every
                 * trainee would get it wrong with nothing on screen to show
                 * why. The index is shifted to follow the option it named.
                 */
                let next = correct;
                if (correct === i) next = 0;
                else if (correct > i) next = correct - 1;
                set({ options: kept, answer: { index: next } });
              }}
            >
              <Icon name="close" size={13} />
            </button>
          </div>
        ))}
      </div>
      <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: '0.4rem' }}
              onClick={() => set({ options: [...options, ''] })}>
        + Add an option
      </button>
    </fieldset>
  );
}
