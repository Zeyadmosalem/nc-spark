import { motion } from 'framer-motion';
import Alert from '../../components/ui/Alert';
import { ICONS, COLORS } from './courseLooks';
export default function CourseDialog({ title, form, setForm, submitting, error, submitLabel, onCancel, onSubmit }) {
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onCancel}
        style={{ position: 'fixed', inset: 0, background: 'var(--scrim)', zIndex: 999 }}
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

        <form className="stack-md" onSubmit={onSubmit}>
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

          <fieldset className="bare-fieldset">
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

          <fieldset className="bare-fieldset">
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
            <button type="button" className="btn btn-ghost grow" onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary grow"
                    disabled={submitting || !form.title.trim()}>
              {submitting ? 'Saving…' : submitLabel}
            </button>
          </div>
        </form>
      </motion.div>
    </>
  );
}
