import { describe, it, expect, vi, beforeEach } from 'vitest';
import { waitFor } from '@testing-library/react';
import { renderQuery } from '../test/queryHarness';

// The quiz half of the authoring hooks. The existing useAuthoring test covers
// modules and activities; this covers what the quiz editor uses.
//
// The thing worth pinning is what these invalidate on. It is activityId, not
// quizId: the editor is opened from an activity and may not have a quiz yet,
// so the activity is the only identifier that exists for the whole lifetime of
// the screen — including the moment the quiz is created, which is exactly when
// the cache most needs refetching. The course outline goes too, because
// publish-course refuses a course whose quiz has no questions, so adding the
// first one changes whether Publish is offered at all.

const mocks = vi.hoisted(() => ({
  quizForAuthoring: vi.fn(), saveQuiz: vi.fn(), saveQuizQuestion: vi.fn(),
  deleteQuizQuestion: vi.fn(), reorderQuizQuestions: vi.fn(),
  createModule: vi.fn(), updateModule: vi.fn(), deleteModule: vi.fn(),
  createActivity: vi.fn(), updateActivity: vi.fn(), deleteActivity: vi.fn(),
  getCourseForEditing: vi.fn(),
}));
// The quiz functions live in api/quizzes, not api/authoring — mocking only
// the latter leaves the real ones running against an unconfigured client.
vi.mock('../api/authoring', () => ({
  getCourseForEditing: mocks.getCourseForEditing,
  createModule: mocks.createModule, updateModule: mocks.updateModule,
  deleteModule: mocks.deleteModule, createActivity: mocks.createActivity,
  updateActivity: mocks.updateActivity, deleteActivity: mocks.deleteActivity,
}));
vi.mock('../api/quizzes', () => ({
  quizForAuthoring: mocks.quizForAuthoring, saveQuiz: mocks.saveQuiz,
  saveQuizQuestion: mocks.saveQuizQuestion,
  deleteQuizQuestion: mocks.deleteQuizQuestion,
  reorderQuizQuestions: mocks.reorderQuizQuestions,
}));

const {
  useQuizForAuthoring, useSaveQuiz, useSaveQuizQuestion,
  useDeleteQuizQuestion, useReorderQuizQuestions,
  quizEditorKeys, editorKeys,
} = await import('./useAuthoring');
const { courseKeys } = await import('./useCourses');

beforeEach(() => {
  vi.clearAllMocks();
  for (const fn of Object.values(mocks)) fn.mockResolvedValue({ id: 'x' });
});

const keysOf = (client) => {
  const spy = vi.spyOn(client, 'invalidateQueries');
  return () => spy.mock.calls.map((c) => JSON.stringify(c[0].queryKey));
};

describe('reading the quiz behind an activity', () => {
  it('fetches by activity id', async () => {
    const { result } = renderQuery(() => useQuizForAuthoring('a1'));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mocks.quizForAuthoring).toHaveBeenCalledWith('a1');
  });

  it('does not fire before the activity id arrives', () => {
    renderQuery(() => useQuizForAuthoring(undefined));
    expect(mocks.quizForAuthoring).not.toHaveBeenCalled();
  });

  it('keys by activity, so two editors do not share a cache', () => {
    expect(quizEditorKeys.forActivity('a')).not.toEqual(quizEditorKeys.forActivity('b'));
  });
});

describe('what a quiz write refreshes', () => {
  /**
   * Creating the quiz is the case that matters: there is no quizId yet, so
   * anything keyed on one would refetch nothing at the exact moment the screen
   * needs it most.
   */
  it('refreshes the editor for the activity it was opened from', async () => {
    const { result, client } = renderQuery(() => useSaveQuiz());
    const keys = keysOf(client);

    result.current.mutate({ activityId: 'a1', courseId: 'c1', title: 'Quiz', passMark: 0.7 });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(keys()).toContain(JSON.stringify(quizEditorKeys.forActivity('a1')));
  });

  /** Adding the first question changes whether Publish is offered. */
  it('refreshes the course outline as well', async () => {
    const { result, client } = renderQuery(() => useSaveQuizQuestion());
    const keys = keysOf(client);

    result.current.mutate({ quizId: 'q1', activityId: 'a1', courseId: 'c1', type: 'mcq' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(keys()).toContain(JSON.stringify(editorKeys.course('c1')));
    expect(keys()).toContain(JSON.stringify(courseKeys.contentCounts));
  });

  it('still refreshes the counts when the caller names no course', async () => {
    const { result, client } = renderQuery(() => useDeleteQuizQuestion());
    const keys = keysOf(client);

    result.current.mutate({ questionId: 'qq1' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(keys()).toEqual([JSON.stringify(courseKeys.contentCounts)]);
  });

  it('refreshes nothing when the write is refused', async () => {
    mocks.reorderQuizQuestions.mockRejectedValue(new Error('not the whole quiz'));
    const { result, client } = renderQuery(() => useReorderQuizQuestions());
    const spy = vi.spyOn(client, 'invalidateQueries');

    result.current.mutate({ quizId: 'q1', order: ['a'] });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('what each write sends', () => {
  it('saves the quiz settings and nothing else', async () => {
    const { result } = renderQuery(() => useSaveQuiz());
    result.current.mutate({
      quizId: 'q1', activityId: 'a1', title: 'T', passMark: 0.7,
      timeLimitSeconds: 600, courseId: 'c1', stray: 'no',
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mocks.saveQuiz).toHaveBeenCalledWith({
      quizId: 'q1', activityId: 'a1', title: 'T', passMark: 0.7, timeLimitSeconds: 600,
    });
  });

  it('saves a question with its answer key', async () => {
    const { result } = renderQuery(() => useSaveQuizQuestion());
    result.current.mutate({
      quizId: 'q1', questionId: null, type: 'mcq', prompt: 'Pick',
      options: ['a', 'b'], points: 1, answer: { index: 0 }, explanation: 'Because',
      activityId: 'a1',
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mocks.saveQuizQuestion).toHaveBeenCalledWith({
      quizId: 'q1', questionId: null, type: 'mcq', prompt: 'Pick',
      options: ['a', 'b'], points: 1, answer: { index: 0 }, explanation: 'Because',
    });
  });

  it('deletes a question by id alone', async () => {
    const { result } = renderQuery(() => useDeleteQuizQuestion());
    result.current.mutate({ questionId: 'qq1', activityId: 'a1' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mocks.deleteQuizQuestion).toHaveBeenCalledWith('qq1');
  });

  it('reorders with the quiz and the whole order', async () => {
    const { result } = renderQuery(() => useReorderQuizQuestions());
    result.current.mutate({ quizId: 'q1', order: ['b', 'a'], activityId: 'a1' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mocks.reorderQuizQuestions).toHaveBeenCalledWith('q1', ['b', 'a']);
  });
});
