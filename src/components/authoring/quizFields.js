/**
 * The question types the quiz editor can author, and a blank of each.
 *
 * Split out when QuizEditor was broken up (B20): the list, the row and the
 * form are separate files now and all three read from this.
 *
 * Note that CourseBuilder has its own TYPE_LABEL in activityTypes.js for
 * ACTIVITY types. Same name, different vocabulary — deliberately not shared.
 */

export const TYPE_LABEL = {
  mcq: 'Multiple choice',
  truefalse: 'True or false',
  paragraph: 'Written answer',
};

export const TYPE_ICON = { mcq: 'quiz', truefalse: 'verified', paragraph: 'edit' };

/** A new question, before anybody has typed anything into it. */
export const BLANK = {
  type: 'mcq',
  prompt: '',
  options: ['', ''],
  points: 1,
  answer: { index: 0 },
  explanation: '',
};

/** The answer shape each type expects, for when the type is changed. */
export const BLANK_ANSWER = {
  mcq: { index: 0 },
  truefalse: { value: true },
  paragraph: { guidance: '' },
};
