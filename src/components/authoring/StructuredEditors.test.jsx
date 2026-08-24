import { describe, it, expect } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { FlashcardsEditor, MatchingEditor, ScenarioEditor } from './StructuredEditors';
import { EMPTY_CONTENT, BLANK_STEP, structuredProblem } from '../../api/authoring';
import FlashcardActivity from '../activities/FlashcardActivity';
import MatchingActivity from '../activities/MatchingActivity';
import ScenarioActivity from '../activities/ScenarioActivity';

/**
 * A host that holds the content the way CourseBuilder does, so a keystroke
 * goes through the same merge the real page performs. Passing a static prop
 * and a spy would let an editor that never re-renders pass every test.
 */
function Host({ Editor, initial }) {
  const [content, setContent] = useState(initial);
  return (
    <>
      <Editor content={content} onChange={(patch) => setContent((c) => ({ ...c, ...patch }))} />
      <output data-testid="content">{JSON.stringify(content)}</output>
    </>
  );
}

const contentOf = () => JSON.parse(screen.getByTestId('content').textContent);

describe('the flashcards editor', () => {
  it('writes the shape FlashcardActivity reads', async () => {
    render(<Host Editor={FlashcardsEditor} initial={EMPTY_CONTENT.flashcards} />);
    await userEvent.type(screen.getByLabelText('Front'), 'What does PPE stand for?');
    await userEvent.type(screen.getByLabelText('Back'), 'Personal Protective Equipment');

    const content = contentOf();
    expect(content).toEqual({
      cards: [{ front: 'What does PPE stand for?', back: 'Personal Protective Equipment' }],
    });

    // The contract, not a restatement of it: the same object goes into the
    // component a trainee sees. A renamed key breaks here rather than in
    // production as "No cards provided."
    render(<FlashcardActivity activity={content} />);
    expect(screen.getByText('What does PPE stand for?')).toBeInTheDocument();
  });

  it('adds and removes cards', async () => {
    render(<Host Editor={FlashcardsEditor} initial={EMPTY_CONTENT.flashcards} />);
    await userEvent.click(screen.getByRole('button', { name: '+ Add a card' }));
    expect(contentOf().cards).toHaveLength(2);

    await userEvent.click(screen.getAllByRole('button', { name: 'Remove' })[1]);
    expect(contentOf().cards).toHaveLength(1);
  });

  /** Removing the last card produces content the renderer draws as an error. */
  it('will not let the last card be removed', () => {
    render(<Host Editor={FlashcardsEditor} initial={EMPTY_CONTENT.flashcards} />);
    expect(screen.getByRole('button', { name: 'Remove' })).toBeDisabled();
  });

  it('edits the right card when there are several', async () => {
    render(<Host Editor={FlashcardsEditor} initial={{
      cards: [{ front: 'a', back: 'b' }, { front: 'c', back: 'd' }],
    }} />);
    await userEvent.clear(screen.getAllByLabelText('Front')[1]);
    await userEvent.type(screen.getAllByLabelText('Front')[1], 'changed');
    expect(contentOf().cards).toEqual([
      { front: 'a', back: 'b' }, { front: 'changed', back: 'd' },
    ]);
  });
});

describe('the matching editor', () => {
  it('writes the shape MatchingActivity reads', async () => {
    render(<Host Editor={MatchingEditor} initial={EMPTY_CONTENT.matching} />);
    await userEvent.type(screen.getByLabelText('Term'), 'Class A');
    await userEvent.type(screen.getByLabelText('Definition'), 'Wood and paper');

    const content = contentOf();
    expect(content).toEqual({ pairs: [{ term: 'Class A', definition: 'Wood and paper' }] });

    render(<MatchingActivity activity={content} />);
    expect(screen.getAllByText('Class A').length).toBeGreaterThan(0);
  });
});

describe('the scenario editor', () => {
  it('writes the shape ScenarioActivity reads', async () => {
    render(<Host Editor={ScenarioEditor} initial={EMPTY_CONTENT.scenario} />);
    await userEvent.type(screen.getByLabelText('What is happening'), 'The fire door is propped open.');
    await userEvent.type(screen.getByLabelText('Option 1 of situation 1'), 'Close it and report it');
    await userEvent.type(screen.getByLabelText('Feedback for option 1 of situation 1'), 'Right — it is a fire route.');
    await userEvent.type(screen.getByLabelText('Option 2 of situation 1'), 'Leave it');

    const content = contentOf();
    expect(content.steps[0].text).toBe('The fire door is propped open.');
    expect(content.steps[0].choices[0]).toEqual({
      text: 'Close it and report it', isCorrect: true, feedback: 'Right — it is a fire route.',
    });

    render(<ScenarioActivity activity={content} />);
    expect(screen.getByText('Close it and report it')).toBeInTheDocument();
  });

  /**
   * The renderer ticks every isCorrect option, so two of them produce a step
   * where either answer is right and the feedback contradicts itself.
   */
  it('keeps exactly one option correct', async () => {
    render(<Host Editor={ScenarioEditor} initial={EMPTY_CONTENT.scenario} />);
    await userEvent.click(screen.getByLabelText('Option 2 of situation 1 is correct'));
    expect(contentOf().steps[0].choices.map((c) => c.isCorrect)).toEqual([false, true]);
  });

  /** A step whose correct option was deleted can never be answered right. */
  it('moves correctness off an option that is removed', async () => {
    render(<Host Editor={ScenarioEditor} initial={{
      steps: [{
        text: 's',
        choices: [
          { text: 'a', isCorrect: true, feedback: '' },
          { text: 'b', isCorrect: false, feedback: '' },
          { text: 'c', isCorrect: false, feedback: '' },
        ],
      }],
    }} />);
    await userEvent.click(screen.getByRole('button', { name: 'Remove option 1 of situation 1' }));
    const choices = contentOf().steps[0].choices;
    expect(choices).toHaveLength(2);
    expect(choices.filter((c) => c.isCorrect)).toHaveLength(1);
  });

  it('will not go below two options', () => {
    render(<Host Editor={ScenarioEditor} initial={EMPTY_CONTENT.scenario} />);
    for (const b of screen.getAllByRole('button', { name: /Remove option \d+ of situation 1/ })) {
      expect(b).toBeDisabled();
    }
  });

  /** Radios in separate situations must not share a name, or one steals the other. */
  it('scopes the correct-answer choice to its own situation', async () => {
    render(<Host Editor={ScenarioEditor} initial={EMPTY_CONTENT.scenario} />);
    await userEvent.click(screen.getByRole('button', { name: '+ Add a situation' }));
    await userEvent.click(screen.getByLabelText('Option 2 of situation 1 is correct'));

    const steps = contentOf().steps;
    expect(steps[0].choices.map((c) => c.isCorrect)).toEqual([false, true]);
    expect(steps[1].choices.map((c) => c.isCorrect)).toEqual([true, false]);
  });

  /**
   * structuredClone on a shared literal, not the literal itself. Without it
   * both situations point at one choices array and typing into either edits
   * both.
   */
  it('gives each new situation its own options', async () => {
    render(<Host Editor={ScenarioEditor} initial={EMPTY_CONTENT.scenario} />);
    await userEvent.click(screen.getByRole('button', { name: '+ Add a situation' }));
    await userEvent.type(screen.getByLabelText('Option 1 of situation 2'), 'second');
    const steps = contentOf().steps;
    expect(steps[0].choices[0].text).toBe('');
    expect(steps[1].choices[0].text).toBe('second');
  });
});

describe('structuredProblem', () => {
  it('passes content that is ready', () => {
    expect(structuredProblem('flashcards', { cards: [{ front: 'a', back: 'b' }] })).toBeNull();
    expect(structuredProblem('matching', { pairs: [{ term: 'a', definition: 'b' }] })).toBeNull();
    expect(structuredProblem('scenario', {
      steps: [{ text: 's', choices: [
        { text: 'a', isCorrect: true }, { text: 'b', isCorrect: false },
      ] }],
    })).toBeNull();
  });

  // The CHECK constraint accepts every one of these.
  it.each([
    ['flashcards', { cards: [] }, /at least one card/],
    ['flashcards', { cards: [{ front: 'a', back: '' }] }, /Card 1 needs both/],
    ['flashcards', { cards: [{ front: 'a', back: 'b' }, { front: '', back: 'd' }] }, /Card 2 needs both/],
    ['matching', { pairs: [] }, /at least one pair/],
    ['matching', { pairs: [{ term: 'a', definition: '' }] }, /Pair 1 needs both/],
    ['scenario', { steps: [] }, /at least one situation/],
    ['scenario', { steps: [{ text: '', choices: [] }] }, /Situation 1 needs a description/],
    ['scenario', { steps: [{ text: 's', choices: [{ text: 'a', isCorrect: true }] }] }, /at least two options/],
    ['scenario', { steps: [{ text: 's', choices: [{ text: 'a', isCorrect: true }, { text: '' }] }] }, /Option 2 of situation 1 is empty/],
    ['scenario', { steps: [{ text: 's', choices: [{ text: 'a' }, { text: 'b' }] }] }, /no correct option/],
  ])('%s: rejects %j', (type, content, message) => {
    expect(structuredProblem(type, content)).toMatch(message);
  });

  /** Two identical definitions leave one term with no distinguishable target. */
  it('rejects a repeated definition', () => {
    expect(structuredProblem('matching', {
      pairs: [
        { term: 'a', definition: 'Same thing' },
        { term: 'b', definition: 'same THING ' },
      ],
    })).toMatch(/Pair 2 repeats a definition/);
  });

  it('has nothing to say about the single-field types', () => {
    for (const type of ['reading', 'video', 'submission', 'quiz']) {
      expect(structuredProblem(type, {})).toBeNull();
    }
  });
});

describe('what the builder starts a new activity with', () => {
  /**
   * The blank must satisfy activities_content_shape or the very first insert
   * is a 400 from the database, whatever the form did.
   */
  it.each([
    ['flashcards', 'cards'], ['matching', 'pairs'], ['scenario', 'steps'],
    ['reading', 'body'], ['video', 'videoId'],
  ])('%s content carries its required key', (type, key) => {
    expect(EMPTY_CONTENT[type]).toHaveProperty(key);
  });

  it('starts the structured types with one visible row, not an empty array', () => {
    expect(EMPTY_CONTENT.flashcards.cards).toHaveLength(1);
    expect(EMPTY_CONTENT.matching.pairs).toHaveLength(1);
    expect(EMPTY_CONTENT.scenario.steps).toHaveLength(1);
  });

  /**
   * EMPTY_CONTENT.scenario is a deep copy of BLANK_STEP, not a reference to
   * it. Sharing the nested choices array would mean the template for every
   * future activity is edited by the first trainer who types into one.
   */
  it('does not share its nested arrays with the template', () => {
    expect(EMPTY_CONTENT.scenario.steps[0]).not.toBe(BLANK_STEP);
    expect(EMPTY_CONTENT.scenario.steps[0].choices).not.toBe(BLANK_STEP.choices);
  });
});
