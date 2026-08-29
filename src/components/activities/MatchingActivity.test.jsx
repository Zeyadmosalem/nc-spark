import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MatchingActivity from './MatchingActivity';
import { shuffleDefinitions } from '../../lib/shuffle';

// Matching is the one activity a trainee drives entirely by pointing at things,
// which is exactly why it needed testing: both of the bugs these cover were
// invisible to every other kind of check.
//
// The definitions used to be rendered with `[...pairs].reverse()`, so term i
// always sat opposite definition n-1-i and the whole thing could be solved from
// position. And both columns were `<div onClick>`, so a keyboard user could not
// complete it at all.

const PAIRS = [
  { term: 'Extinguisher', definition: 'Puts out a fire' },
  { term: 'Alarm', definition: 'Warns the building' },
  { term: 'Muster point', definition: 'Where everyone gathers' },
  { term: 'Warden', definition: 'Leads the evacuation' },
];

const setup = (pairs = PAIRS) => {
  const user = userEvent.setup();
  render(<MatchingActivity activity={{ pairs }} />);
  return user;
};

const columns = () => {
  const buttons = screen.getAllByRole('button');
  const terms = PAIRS.map((p) => p.term);
  return {
    terms: buttons.filter((b) => terms.includes(b.textContent)),
    definitions: buttons.filter((b) => !terms.includes(b.textContent)),
  };
};

describe('the board', () => {
  it('shows every term and every definition', () => {
    setup();
    for (const { term, definition } of PAIRS) {
      expect(screen.getByText(term)).toBeInTheDocument();
      expect(screen.getByText(definition)).toBeInTheDocument();
    }
  });

  it('counts nothing matched to begin with', () => {
    setup();
    expect(screen.getByText(`0 of ${PAIRS.length} matched`)).toBeInTheDocument();
  });

  it('says so when there are no pairs, rather than rendering an empty board', () => {
    render(<MatchingActivity activity={{}} />);
    expect(screen.getByText('No matching pairs provided.')).toBeInTheDocument();
  });
});

describe('the definitions are not lined up with their terms', () => {
  /**
   * The bug this replaces. Reversal is a permutation a trainee can read off the
   * screen: bottom definition answers the top term, every time, on every
   * activity in the product.
   */
  it('does not simply reverse them', () => {
    const order = shuffleDefinitions(PAIRS).map((p) => p.term);
    const reversed = [...PAIRS].reverse().map((p) => p.term);
    expect(order).not.toEqual(reversed);
  });

  it('does not leave them in the order the terms are in', () => {
    const order = shuffleDefinitions(PAIRS).map((p) => p.term);
    expect(order).not.toEqual(PAIRS.map((p) => p.term));
  });

  it('keeps every pair, so shuffling cannot lose an answer', () => {
    const order = shuffleDefinitions(PAIRS).map((p) => p.term).sort();
    expect(order).toEqual(PAIRS.map((p) => p.term).sort());
  });

  /**
   * Seeded from the pair text rather than Math.random: a component has to be
   * pure, and a trainee who comes back to a half-finished activity should meet
   * the same board rather than a reshuffled one.
   */
  it('gives the same order every time for the same pairs', () => {
    expect(shuffleDefinitions(PAIRS)).toEqual(shuffleDefinitions(PAIRS));
  });

  it('gives a different order for different pairs', () => {
    const other = [
      { term: 'Hose', definition: 'Carries water' },
      { term: 'Ladder', definition: 'Reaches height' },
      { term: 'Helmet', definition: 'Protects the head' },
      { term: 'Radio', definition: 'Carries the order' },
    ];
    expect(shuffleDefinitions(other).map((p) => p.term))
      .not.toEqual(shuffleDefinitions(PAIRS).map((p) => p.term));
  });

  it('survives an empty or missing list', () => {
    expect(shuffleDefinitions([])).toEqual([]);
    expect(shuffleDefinitions(undefined)).toEqual([]);
  });
});

describe('matching a pair', () => {
  it('records a correct pair and counts it', async () => {
    const user = setup();

    await user.click(screen.getByText('Alarm'));
    await user.click(screen.getByText('Warns the building'));

    expect(screen.getByText(`1 of ${PAIRS.length} matched`)).toBeInTheDocument();
  });

  it('does not count a wrong pair', async () => {
    const user = setup();

    await user.click(screen.getByText('Alarm'));
    await user.click(screen.getByText('Puts out a fire'));

    expect(screen.getByText(`0 of ${PAIRS.length} matched`)).toBeInTheDocument();
  });

  it('lets a term be deselected by clicking it again', async () => {
    const user = setup();
    const alarm = screen.getByText('Alarm');

    await user.click(alarm);
    expect(alarm).toHaveAttribute('aria-pressed', 'true');
    await user.click(alarm);
    expect(alarm).toHaveAttribute('aria-pressed', 'false');
  });

  it('takes a matched pair out of play', async () => {
    const user = setup();

    await user.click(screen.getByText('Alarm'));
    await user.click(screen.getByText('Warns the building'));

    expect(screen.getByText('Alarm')).toBeDisabled();
    expect(screen.getByText('Warns the building')).toBeDisabled();
  });

  it('congratulates only once every pair is matched', async () => {
    const user = setup();
    const done = /All pairs matched correctly/;

    for (const { term, definition } of PAIRS.slice(0, -1)) {
      await user.click(screen.getByText(term));
      await user.click(screen.getByText(definition));
      expect(screen.queryByText(done)).not.toBeInTheDocument();
    }

    const last = PAIRS[PAIRS.length - 1];
    await user.click(screen.getByText(last.term));
    await user.click(screen.getByText(last.definition));

    expect(screen.getByText(done)).toBeInTheDocument();
  });
});

describe('reaching it from the keyboard', () => {
  /**
   * Both columns were `<div onClick>`: no role, no tab stop, no key handler.
   * A keyboard or screen-reader user could not complete a matching activity at
   * all, and nothing failed to say so.
   */
  it('exposes every term and definition as a button', () => {
    setup();
    const { terms, definitions } = columns();
    expect(terms).toHaveLength(PAIRS.length);
    expect(definitions).toHaveLength(PAIRS.length);
  });

  it('can be completed with the keyboard alone', async () => {
    const user = setup();

    for (const { term, definition } of PAIRS) {
      screen.getByText(term).focus();
      await user.keyboard('{Enter}');
      screen.getByText(definition).focus();
      await user.keyboard('{Enter}');
    }

    expect(screen.getByText(`${PAIRS.length} of ${PAIRS.length} matched`)).toBeInTheDocument();
  });

  it('states selection in markup, not colour alone', async () => {
    const user = setup();
    const alarm = screen.getByText('Alarm');

    expect(alarm).toHaveAttribute('aria-pressed', 'false');
    await user.click(alarm);
    expect(alarm).toHaveAttribute('aria-pressed', 'true');
  });
});
