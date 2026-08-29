import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FlashcardActivity from './FlashcardActivity';

// A deck is the simplest activity in the product and the easiest to get subtly
// wrong: the card advances behind a 150ms timeout, so "Next" and "the next card
// is showing" are two different moments. These drive it the way a trainee does
// and wait for what a trainee would see.

const CARDS = [
  { front: 'What is the muster point?', back: 'The east car park' },
  { front: 'Who leads an evacuation?', back: 'The floor warden' },
  { front: 'When do you use water?', back: 'Never on an electrical fire' },
];

const setup = (cards = CARDS) => {
  const user = userEvent.setup();
  render(<FlashcardActivity activity={{ cards }} />);
  return user;
};

describe('the deck', () => {
  it('opens on the first card and says where you are', () => {
    setup();
    expect(screen.getByText(`Card 1 of ${CARDS.length}`)).toBeInTheDocument();
    expect(screen.getByText(CARDS[0].front)).toBeInTheDocument();
  });

  it('renders both faces, because the flip is a transform not a swap', () => {
    setup();
    expect(screen.getByText(CARDS[0].front)).toBeInTheDocument();
    expect(screen.getByText(CARDS[0].back)).toBeInTheDocument();
  });

  it('says so when there are no cards', () => {
    render(<FlashcardActivity activity={{ cards: [] }} />);
    expect(screen.getByText('No cards provided.')).toBeInTheDocument();
  });

  it('says so when cards are missing entirely', () => {
    render(<FlashcardActivity activity={{}} />);
    expect(screen.getByText('No cards provided.')).toBeInTheDocument();
  });
});

describe('moving through it', () => {
  it('advances to the next card', async () => {
    const user = setup();

    await user.click(screen.getByRole('button', { name: /next/i }));

    expect(await screen.findByText(`Card 2 of ${CARDS.length}`)).toBeInTheDocument();
    expect(screen.getByText(CARDS[1].front)).toBeInTheDocument();
  });

  it('goes back again', async () => {
    const user = setup();

    await user.click(screen.getByRole('button', { name: /next/i }));
    expect(await screen.findByText(`Card 2 of ${CARDS.length}`)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /previous/i }));
    expect(await screen.findByText(`Card 1 of ${CARDS.length}`)).toBeInTheDocument();
  });

  /** Nothing before the first card and nothing after the last. */
  it('cannot go back from the first card', () => {
    setup();
    expect(screen.getByRole('button', { name: /previous/i })).toBeDisabled();
  });

  it('cannot go forward from the last card', async () => {
    const user = setup();

    for (let i = 1; i < CARDS.length; i += 1) {
      await user.click(screen.getByRole('button', { name: /next/i }));
      await screen.findByText(`Card ${i + 1} of ${CARDS.length}`);
    }

    expect(screen.getByRole('button', { name: /next/i })).toBeDisabled();
    expect(screen.getByText(CARDS[CARDS.length - 1].front)).toBeInTheDocument();
  });

  it('handles a single-card deck, where both ends are the same card', () => {
    setup([CARDS[0]]);
    expect(screen.getByText('Card 1 of 1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /previous/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /next/i })).toBeDisabled();
  });
});

describe('flipping', () => {
  /**
   * The card itself is a div with an onClick, so the Flip button is the only
   * keyboard route to the answer. If it ever stops working the deck becomes
   * unusable without a mouse, and nothing else here would notice.
   */
  it('offers a Flip control that does not need a pointer', async () => {
    const user = setup();
    const flip = screen.getByRole('button', { name: /flip/i });

    flip.focus();
    expect(flip).toHaveFocus();
    await user.keyboard('{Enter}');

    expect(screen.getByText(CARDS[0].back)).toBeInTheDocument();
  });

  it('shows the front of the next card, not the previous answer', async () => {
    const user = setup();

    await user.click(screen.getByRole('button', { name: /flip/i }));
    await user.click(screen.getByRole('button', { name: /next/i }));

    expect(await screen.findByText(`Card 2 of ${CARDS.length}`)).toBeInTheDocument();
    expect(screen.getByText(CARDS[1].front)).toBeInTheDocument();
  });
});
