import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { AppProvider, useApp } from './AppContext';
import { USERS } from '../data/dummyData';

const trainee = USERS.trainees.find((t) => t.id === 's1');
const wrapper = ({ children }) => <AppProvider currentUser={trainee}>{children}</AppProvider>;

let consoleError;
beforeEach(() => {
  vi.useFakeTimers();
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  consoleError.mockRestore();
});

function signedInTrainee() {
  return renderHook(() => useApp(), { wrapper });
}

describe('completeActivity milestone notifications', () => {
  // Trainee s1 has already finished module m1 (a1, a2 and quiz q1). Completing
  // an activity in a *different* module re-ran the completion check over every
  // module and re-announced m1 as freshly complete on every single call.
  it('does not re-announce a module that was already complete', () => {
    const { result } = signedInTrainee();

    act(() => { result.current.completeActivity('a3'); });

    const note = result.current.notification;
    expect(note?.text ?? '').not.toMatch(/Variables & Data Types/);
  });

  it('announces a module only when this activity is the one that completes it', () => {
    const { result } = signedInTrainee();

    // m2 is a3 + a4 + a7. Completing two of three must stay quiet.
    act(() => { result.current.completeActivity('a3'); });
    act(() => { result.current.completeActivity('a4'); });
    expect(result.current.notification?.text ?? '').not.toMatch(/Functions & Scope/);

    // The third completes it, so it should announce exactly once.
    act(() => { result.current.completeActivity('a7'); });
    expect(result.current.notification?.text ?? '').toMatch(/Functions & Scope/);
  });

  it('does not announce a module the completed activity has nothing to do with', () => {
    const { result } = signedInTrainee();
    act(() => { result.current.completeActivity('a6') });
    expect(result.current.notification?.text ?? '').not.toMatch(/Functions & Scope/);
  });
});

describe('submitQuizResult robustness', () => {
  it('does not throw when the quiz no longer exists', () => {
    const { result } = signedInTrainee();

    expect(() => {
      act(() => { result.current.submitQuizResult('deleted-quiz-id', 5, 10); });
    }).not.toThrow();
  });

  it('returns undefined for an unknown quiz rather than a bogus result', () => {
    const { result } = signedInTrainee();
    let out;
    act(() => { out = result.current.submitQuizResult('nope', 5, 10); });
    expect(out).toBeUndefined();
  });

  it('still grades a real quiz correctly', () => {
    const { result } = signedInTrainee();
    let out;
    // q1 passMark is 0.7; 9/10 = 0.9 passes.
    act(() => { out = result.current.submitQuizResult('q1', 9, 10); });
    expect(out).toMatchObject({ passed: true });
    expect(out.pct).toBeCloseTo(0.9);
  });

  it('marks a failing score as not passed', () => {
    const { result } = signedInTrainee();
    let out;
    act(() => { out = result.current.submitQuizResult('q1', 3, 10); });
    expect(out).toMatchObject({ passed: false });
  });

  it('does not divide by zero when the quiz has no questions', () => {
    const { result } = signedInTrainee();
    let out;
    expect(() => {
      act(() => { out = result.current.submitQuizResult('q1', 0, 0); });
    }).not.toThrow();
    expect(Number.isNaN(out?.pct)).toBe(false);
  });
});

describe('context value hygiene', () => {
  it('exposes applyForCourse, which the catalog depends on', () => {
    const { result } = renderHook(() => useApp(), { wrapper });
    expect(typeof result.current.applyForCourse).toBe('function');
  });
});
