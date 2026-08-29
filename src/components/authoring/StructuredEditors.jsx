import { motion, AnimatePresence } from 'framer-motion';
import Icon from '../ui/Icon';
import { BLANK_CARD, BLANK_PAIR, BLANK_CHOICE, BLANK_STEP } from '../../api/authoring';

/**
 * Editors for the three activity types that store structured content.
 *
 * flashcards, matching and scenario were the reason AUTHORABLE_TYPES had four
 * entries instead of seven: each stores a nested array that a single text
 * field cannot express, so the builder offered no form and the picker said
 * they were seed-only. Three of the six activity types the product renders
 * could be shown to a trainee and not written by a trainer.
 *
 * A raw-JSON textarea would have been the cheap version of this, and it is
 * exactly what these avoid: `activities_content_shape` is a CHECK constraint,
 * so a stray comma becomes a 400 from a form the trainer just spent ten
 * minutes filling in, with no indication of which line was wrong.
 *
 * The shapes come from the renderers in src/components/activities and are
 * asserted by these editors' tests, so a change to either side breaks a test
 * rather than a trainee's screen.
 */

const listStyle = { display: 'flex', flexDirection: 'column', gap: '0.6rem' };

const rowStyle = {
  border: '1px solid var(--border)',
  borderRadius: 'var(--r-md)',
  padding: '0.7rem',
  background: 'var(--surface)',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.5rem',
};

/** The index badge on each row, so "Card 2" on screen matches "Card 2" spoken. */
function Ordinal({ children }) {
  return (
    <span style={{
      width: 24, height: 24, borderRadius: '50%', flexShrink: 0, fontSize: '0.72rem',
      display: 'grid', placeItems: 'center', fontWeight: 700,
      background: 'var(--surface-alt)', color: 'var(--text-2)',
    }}>
      {children}
    </span>
  );
}

function RowFrame({ label, index, onRemove, canRemove, children }) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0, marginBottom: 0 }}
      style={rowStyle}
    >
      <div className="cluster">
        <Ordinal>{index + 1}</Ordinal>
        <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{label} {index + 1}</span>
        <div style={{ marginLeft: 'auto' }}>
          {/* Removing the last one would leave content the renderer draws as
              "No cards provided", so the control goes away at one rather than
              erroring after the fact. */}
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            style={{ color: canRemove ? 'var(--danger)' : 'var(--text-3)' }}
            disabled={!canRemove}
            title={canRemove ? undefined : `A ${label.toLowerCase()} activity needs at least one`}
            onClick={onRemove}
          >
            Remove
          </button>
        </div>
      </div>
      {children}
    </motion.div>
  );
}

function AddButton({ onClick, children }) {
  return (
    <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }}
            onClick={onClick}>
      + {children}
    </button>
  );
}

/**
 * Replaces one entry in an array without mutating it.
 *
 * The state lives in the builder and is passed down, so mutating in place
 * would leave React with the same array reference and no re-render — the
 * classic version of this bug where typing appears to do nothing until some
 * unrelated state change flushes it.
 */
const replaceAt = (list, i, next) => list.map((item, j) => (i === j ? next : item));

/* ---------------------------------------------------------------- flashcards */

export function FlashcardsEditor({ content, onChange, idPrefix = 'fc' }) {
  const cards = content.cards?.length ? content.cards : [{ ...BLANK_CARD }];
  const set = (next) => onChange({ cards: next });

  return (
    <div style={listStyle}>
      <p style={{ fontSize: '0.8rem', color: 'var(--text-3)', margin: 0 }}>
        A prompt on the front, the answer on the back. Trainees flip through them
        in order.
      </p>
      <AnimatePresence initial={false}>
        {cards.map((card, i) => (
          <RowFrame
            key={i}
            label="Card"
            index={i}
            canRemove={cards.length > 1}
            onRemove={() => set(cards.filter((_, j) => j !== i))}
          >
            <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
              <div className="grow-field">
                <label className="input-label" htmlFor={`${idPrefix}-front-${i}`}>Front</label>
                <input
                  id={`${idPrefix}-front-${i}`}
                  className="input-field"
                  placeholder="What does PPE stand for?"
                  value={card.front ?? ''}
                  onChange={(e) => set(replaceAt(cards, i, { ...card, front: e.target.value }))}
                />
              </div>
              <div className="grow-field">
                <label className="input-label" htmlFor={`${idPrefix}-back-${i}`}>Back</label>
                <input
                  id={`${idPrefix}-back-${i}`}
                  className="input-field"
                  placeholder="Personal Protective Equipment"
                  value={card.back ?? ''}
                  onChange={(e) => set(replaceAt(cards, i, { ...card, back: e.target.value }))}
                />
              </div>
            </div>
          </RowFrame>
        ))}
      </AnimatePresence>
      <AddButton onClick={() => set([...cards, { ...BLANK_CARD }])}>Add a card</AddButton>
    </div>
  );
}

/* ------------------------------------------------------------------ matching */

export function MatchingEditor({ content, onChange, idPrefix = 'mt' }) {
  const pairs = content.pairs?.length ? content.pairs : [{ ...BLANK_PAIR }];
  const set = (next) => onChange({ pairs: next });

  return (
    <div style={listStyle}>
      {/* The renderer shuffles the definition column by reversing it, so two
          identical definitions make one of them unmatchable. Worth saying
          before it is discovered by a trainee who cannot finish the module. */}
      <p style={{ fontSize: '0.8rem', color: 'var(--text-3)', margin: 0 }}>
        Trainees drag each term onto its definition. Keep every definition
        distinct — two identical ones cannot be told apart.
      </p>
      <AnimatePresence initial={false}>
        {pairs.map((pair, i) => (
          <RowFrame
            key={i}
            label="Pair"
            index={i}
            canRemove={pairs.length > 1}
            onRemove={() => set(pairs.filter((_, j) => j !== i))}
          >
            <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 160 }}>
                <label className="input-label" htmlFor={`${idPrefix}-term-${i}`}>Term</label>
                <input
                  id={`${idPrefix}-term-${i}`}
                  className="input-field"
                  placeholder="Class A fire"
                  value={pair.term ?? ''}
                  onChange={(e) => set(replaceAt(pairs, i, { ...pair, term: e.target.value }))}
                />
              </div>
              <div style={{ flex: 2, minWidth: 200 }}>
                <label className="input-label" htmlFor={`${idPrefix}-def-${i}`}>Definition</label>
                <input
                  id={`${idPrefix}-def-${i}`}
                  className="input-field"
                  placeholder="Ordinary combustibles such as wood or paper"
                  value={pair.definition ?? ''}
                  onChange={(e) => set(replaceAt(pairs, i, { ...pair, definition: e.target.value }))}
                />
              </div>
            </div>
          </RowFrame>
        ))}
      </AnimatePresence>
      <AddButton onClick={() => set([...pairs, { ...BLANK_PAIR }])}>Add a pair</AddButton>
    </div>
  );
}

/* ------------------------------------------------------------------ scenario */

export function ScenarioEditor({ content, onChange, idPrefix = 'sc' }) {
  const steps = content.steps?.length ? content.steps : [structuredClone(BLANK_STEP)];
  const set = (next) => onChange({ steps: next });

  const setStep = (i, next) => set(replaceAt(steps, i, next));

  return (
    <div style={listStyle}>
      <p style={{ fontSize: '0.8rem', color: 'var(--text-3)', margin: 0 }}>
        A situation, then the options a trainee picks from. Each option shows its
        feedback once chosen, so write the wrong ones as teaching, not scolding.
      </p>

      <AnimatePresence initial={false}>
        {steps.map((step, i) => {
          const choices = step.choices?.length ? step.choices : [{ ...BLANK_CHOICE }];
          const setChoices = (next) => setStep(i, { ...step, choices: next });

          return (
            <RowFrame
              key={i}
              label="Situation"
              index={i}
              canRemove={steps.length > 1}
              onRemove={() => set(steps.filter((_, j) => j !== i))}
            >
              <div>
                <label className="input-label" htmlFor={`${idPrefix}-text-${i}`}>
                  What is happening
                </label>
                <textarea
                  id={`${idPrefix}-text-${i}`}
                  className="input-field"
                  rows={3}
                  placeholder="You arrive on site and the fire door is propped open with a chair."
                  value={step.text ?? ''}
                  onChange={(e) => setStep(i, { ...step, text: e.target.value })}
                />
              </div>

              <fieldset className="bare-fieldset">
                <legend className="input-label u-p0">
                  Options — select the correct one
                </legend>
                <div className="stack">
                  {choices.map((choice, c) => (
                    <div
                      key={c}
                      style={{
                        display: 'flex', gap: '0.55rem', alignItems: 'flex-start',
                        padding: '0.5rem', borderRadius: 'var(--r-sm)',
                        background: choice.isCorrect
                          ? 'var(--success-soft)' : 'var(--surface-alt)',
                      }}
                    >
                      {/*
                        A radio, not a checkbox. The renderer marks every
                        isCorrect option with a tick, so two correct answers
                        produce a step where picking either is right and the
                        feedback contradicts itself. One per situation is the
                        only shape the trainee side can draw.
                      */}
                      <input
                        type="radio"
                        name={`${idPrefix}-correct-${i}`}
                        style={{ marginTop: '0.55rem' }}
                        aria-label={`Option ${c + 1} of situation ${i + 1} is correct`}
                        checked={Boolean(choice.isCorrect)}
                        onChange={() => setChoices(choices.map((o, j) => ({
                          ...o, isCorrect: j === c,
                        })))}
                      />
                      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                        <div>
                          <label className="sr-only" htmlFor={`${idPrefix}-opt-${i}-${c}`}>
                            Option {c + 1} of situation {i + 1}
                          </label>
                          <input
                            id={`${idPrefix}-opt-${i}-${c}`}
                            className="input-field"
                            placeholder="Close the door and report it"
                            value={choice.text ?? ''}
                            onChange={(e) => setChoices(
                              replaceAt(choices, c, { ...choice, text: e.target.value }))}
                          />
                        </div>
                        <div>
                          <label className="sr-only" htmlFor={`${idPrefix}-fb-${i}-${c}`}>
                            Feedback for option {c + 1} of situation {i + 1}
                          </label>
                          <input
                            id={`${idPrefix}-fb-${i}-${c}`}
                            className="input-field"
                            style={{ fontSize: '0.85rem' }}
                            placeholder="Why this is right, or what it misses"
                            value={choice.feedback ?? ''}
                            onChange={(e) => setChoices(
                              replaceAt(choices, c, { ...choice, feedback: e.target.value }))}
                          />
                        </div>
                      </div>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        style={{ color: choices.length > 2 ? 'var(--danger)' : 'var(--text-3)' }}
                        disabled={choices.length <= 2}
                        // The glyph used to be a literal ✕, which gave the
                        // button its only accessible name by accident. An icon
                        // is aria-hidden, so the name has to be said.
                        aria-label={`Remove option ${c + 1} of situation ${i + 1}`}
                        title={choices.length > 2 ? undefined : 'A situation needs at least two options'}
                        onClick={() => {
                          const kept = choices.filter((_, j) => j !== c);
                          // Removing the correct option would leave a step
                          // nobody can answer right. The first survivor takes
                          // it, which is visible on screen and fixable.
                          if (!kept.some((o) => o.isCorrect)) kept[0] = { ...kept[0], isCorrect: true };
                          setChoices(kept);
                        }}
                      >
                        <Icon name="close" size={13} />
                      </button>
                    </div>
                  ))}
                </div>
                <AddButton onClick={() => setChoices([...choices, { ...BLANK_CHOICE }])}>
                  Add an option
                </AddButton>
              </fieldset>
            </RowFrame>
          );
        })}
      </AnimatePresence>

      <AddButton onClick={() => set([...steps, structuredClone(BLANK_STEP)])}>
        Add a situation
      </AddButton>
    </div>
  );
}
