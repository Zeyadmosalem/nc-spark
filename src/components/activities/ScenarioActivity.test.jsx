import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ScenarioActivity from './ScenarioActivity';

// A scenario is branching practice: pick a choice, read why it was right or
// wrong, move on. Two things here are worth holding in place — the step text is
// trainer-authored and goes through innerHTML, and a choice must stay locked
// once answered, or the feedback can be farmed by clicking every option.

const STEPS = [
  {
    text: 'Smoke is coming from a **server cabinet**.',
    choices: [
      { id: 'a', text: 'Open the cabinet to look', isCorrect: false, feedback: 'Opening it feeds the fire oxygen.' },
      { id: 'b', text: 'Raise the alarm', isCorrect: true, feedback: 'Right — alarm first, always.' },
    ],
  },
  {
    text: 'The alarm is sounding and a colleague is still at their desk.',
    choices: [
      { id: 'c', text: 'Keep typing your email', isCorrect: false, feedback: 'Nothing is worth the delay.' },
      { id: 'd', text: 'Tell them and leave together', isCorrect: true, feedback: 'Correct — leave together.' },
    ],
  },
];

const setup = (steps = STEPS) => {
  const user = userEvent.setup();
  render(<ScenarioActivity activity={{ steps }} />);
  return user;
};

describe('a situation', () => {
  it('opens on the first step and says where you are', () => {
    setup();
    expect(screen.getByText(`Situation 1 of ${STEPS.length}`)).toBeInTheDocument();
  });

  it('offers every choice as a button', () => {
    setup();
    for (const choice of STEPS[0].choices) {
      expect(screen.getByRole('button', { name: new RegExp(choice.text, 'i') })).toBeInTheDocument();
    }
  });

  it('says so when there are no steps', () => {
    render(<ScenarioActivity activity={{ steps: [] }} />);
    expect(screen.getByText('No scenario steps provided.')).toBeInTheDocument();
  });

  /**
   * The step text is written by a trainer and rendered through innerHTML, so
   * the light markdown pass has to end up sanitized. This is the test that
   * fails if somebody drops safeHtml for a raw dangerouslySetInnerHTML.
   */
  it('renders authored emphasis as real markup', () => {
    setup();
    expect(screen.getByText('server cabinet').tagName).toBe('STRONG');
  });

  it('strips active content out of authored text', () => {
    const { container } = render(<ScenarioActivity activity={{
      steps: [{
        text: 'Careful <img src=x onerror="alert(1)"> <script>alert(2)</script>',
        choices: STEPS[0].choices,
      }],
    }} />);

    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('[onerror]')).toBeNull();
  });
});

describe('answering', () => {
  it('tells you when you are right', async () => {
    const user = setup();

    await user.click(screen.getByRole('button', { name: /raise the alarm/i }));

    expect(screen.getByText('Correct!')).toBeInTheDocument();
    expect(screen.getByText(STEPS[0].choices[1].feedback)).toBeInTheDocument();
  });

  it('tells you when you are wrong, and why', async () => {
    const user = setup();

    await user.click(screen.getByRole('button', { name: /open the cabinet/i }));

    expect(screen.getByText('Not quite.')).toBeInTheDocument();
    expect(screen.getByText(STEPS[0].choices[0].feedback)).toBeInTheDocument();
  });

  /**
   * Once a step is answered it stays answered. Without this a trainee can click
   * through every option and read all the feedback, which turns the scenario
   * into an answer key.
   */
  it('ignores a second choice on the same step', async () => {
    const user = setup();

    await user.click(screen.getByRole('button', { name: /open the cabinet/i }));
    expect(screen.getByText('Not quite.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /raise the alarm/i }));

    expect(screen.getByText('Not quite.')).toBeInTheDocument();
    expect(screen.queryByText('Correct!')).not.toBeInTheDocument();
  });

  it('offers no way forward until something is chosen', () => {
    setup();
    expect(screen.queryByRole('button', { name: /next situation|finish/i })).not.toBeInTheDocument();
  });
});

describe('moving through the scenario', () => {
  it('advances to the next situation with a clean slate', async () => {
    const user = setup();

    await user.click(screen.getByRole('button', { name: /raise the alarm/i }));
    await user.click(screen.getByRole('button', { name: /next situation/i }));

    expect(screen.getByText(`Situation 2 of ${STEPS.length}`)).toBeInTheDocument();
    expect(screen.queryByText('Correct!')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /tell them and leave together/i })).toBeInTheDocument();
  });

  it('offers Finish rather than Next on the last situation', async () => {
    const user = setup();

    await user.click(screen.getByRole('button', { name: /raise the alarm/i }));
    await user.click(screen.getByRole('button', { name: /next situation/i }));
    await user.click(screen.getByRole('button', { name: /tell them and leave together/i }));

    expect(screen.getByRole('button', { name: /finish/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /next situation/i })).not.toBeInTheDocument();
  });

  it('reports completion, which is what unlocks Mark as complete', async () => {
    const user = setup();

    await user.click(screen.getByRole('button', { name: /raise the alarm/i }));
    await user.click(screen.getByRole('button', { name: /next situation/i }));
    await user.click(screen.getByRole('button', { name: /tell them and leave together/i }));
    await user.click(screen.getByRole('button', { name: /finish/i }));

    expect(screen.getByText(/Scenario Complete/i)).toBeInTheDocument();
  });

  it('can be worked through with the keyboard alone', async () => {
    const user = setup();

    screen.getByRole('button', { name: /raise the alarm/i }).focus();
    await user.keyboard('{Enter}');
    expect(screen.getByText('Correct!')).toBeInTheDocument();

    screen.getByRole('button', { name: /next situation/i }).focus();
    await user.keyboard('{Enter}');
    expect(screen.getByText(`Situation 2 of ${STEPS.length}`)).toBeInTheDocument();
  });
});
