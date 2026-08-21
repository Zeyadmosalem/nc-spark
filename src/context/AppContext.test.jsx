import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { AppProvider, useApp } from './AppContext';

// Regression cover for the activity CRUD crash: addActivity/updateActivity/
// deleteActivity all called setActivities, which was never destructured from
// useState, so every call threw "setActivities is not defined".

const wrapper = ({ children }) => <AppProvider>{children}</AppProvider>;

let consoleError;
beforeEach(() => {
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => consoleError.mockRestore());

describe('AppContext activity CRUD', () => {
  it('exposes the activity operations', () => {
    const { result } = renderHook(() => useApp(), { wrapper });
    expect(typeof result.current.addActivity).toBe('function');
    expect(typeof result.current.updateActivity).toBe('function');
    expect(typeof result.current.deleteActivity).toBe('function');
  });

  it('adds an activity without throwing and stores it', () => {
    const { result } = renderHook(() => useApp(), { wrapper });
    let newId;

    expect(() => {
      act(() => {
        newId = result.current.addActivity({ type: 'reading', title: 'Forklift Safety', xp: 10 });
      });
    }).not.toThrow();

    expect(newId).toBeTruthy();
    expect(result.current.activities[newId]).toMatchObject({
      id: newId,
      type: 'reading',
      title: 'Forklift Safety',
      xp: 10,
    });
  });

  it('updates an existing activity', () => {
    const { result } = renderHook(() => useApp(), { wrapper });

    expect(() => {
      act(() => { result.current.updateActivity('a1', { title: 'Renamed Activity' }); });
    }).not.toThrow();

    expect(result.current.activities.a1.title).toBe('Renamed Activity');
    // untouched fields survive the merge
    expect(result.current.activities.a1.type).toBe('video');
  });

  it('leaves state alone when updating an unknown activity', () => {
    const { result } = renderHook(() => useApp(), { wrapper });
    const before = result.current.activities;
    act(() => { result.current.updateActivity('does-not-exist', { title: 'x' }); });
    expect(result.current.activities).toBe(before);
  });

  it('deletes an activity', () => {
    const { result } = renderHook(() => useApp(), { wrapper });
    expect(result.current.activities.a1).toBeDefined();

    expect(() => {
      act(() => { result.current.deleteActivity('a1'); });
    }).not.toThrow();

    expect(result.current.activities.a1).toBeUndefined();
  });

  it('survives a full create/update/delete round trip', () => {
    const { result } = renderHook(() => useApp(), { wrapper });
    let id;
    act(() => { id = result.current.addActivity({ type: 'flashcards', title: 'Round Trip' }); });
    act(() => { result.current.updateActivity(id, { xp: 99 }); });
    expect(result.current.activities[id].xp).toBe(99);
    act(() => { result.current.deleteActivity(id); });
    expect(result.current.activities[id]).toBeUndefined();
  });
});
