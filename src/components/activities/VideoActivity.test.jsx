import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import VideoActivity from './VideoActivity';

const watch = (activity) => render(<VideoActivity activity={activity} />);
const frame = (container) => container.querySelector('iframe');

describe('the embed', () => {
  it('points at the YouTube id the activity carries', () => {
    const { container } = watch({ videoId: 'dQw4w9WgXcQ', title: 'Extinguisher types' });
    expect(frame(container).getAttribute('src'))
      .toBe('https://www.youtube.com/embed/dQw4w9WgXcQ?rel=0');
  });

  /**
   * An iframe with no accessible name is announced as "frame" and nothing
   * else, which in a course of a dozen videos tells a screen reader user
   * nothing about which one they are on.
   */
  it('names the frame after the activity', () => {
    watch({ videoId: 'abc123', title: 'Using an extinguisher' });
    expect(screen.getByTitle('Using an extinguisher')).toBeInTheDocument();
  });

  /**
   * The id is interpolated into a fixed https://www.youtube.com/embed/ prefix.
   * A traversal in an authored id must not be able to walk the URL somewhere
   * else — the origin is what matters, since anything served from it runs in
   * this frame.
   */
  it('cannot be walked off the YouTube origin', () => {
    const { container } = watch({ videoId: '../../evil', title: 'x' });
    const url = new URL(frame(container).getAttribute('src'), 'https://www.youtube.com');
    expect(url.origin).toBe('https://www.youtube.com');
  });

  it('does not render a frame at all without a video', () => {
    const { container } = watch({ title: 'Nothing here' });
    expect(frame(container)).toBeNull();
    expect(screen.getByText('No video source provided.')).toBeInTheDocument();
  });

  it('survives no activity at all', () => {
    render(<VideoActivity />);
    expect(screen.getByText('No video source provided.')).toBeInTheDocument();
  });
});

describe('what it tells the trainee', () => {
  it('shows the duration when there is one', () => {
    watch({ videoId: 'a', title: 't', duration: '8:24' });
    expect(screen.getByText(/8:24/)).toBeInTheDocument();
  });

  /** "Unknown" rather than a blank, so a missing duration reads as missing. */
  it('says Unknown rather than leaving a gap', () => {
    watch({ videoId: 'a', title: 't' });
    expect(screen.getByText(/Unknown/)).toBeInTheDocument();
  });

  it('tells them to finish before marking it complete', () => {
    watch({ videoId: 'a', title: 't' });
    expect(screen.getByText(/watch the entire video/i)).toBeInTheDocument();
  });
});
