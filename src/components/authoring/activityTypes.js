/**
 * What each activity type is called on screen.
 *
 * Split out when CourseBuilder was broken up (B20): the add form and the row
 * both name a type, and they are separate files now.
 *
 * Note that QuizEditor has its own TYPE_LABEL in quizFields.js for QUESTION
 * types. Same name, different vocabulary — they are deliberately not shared.
 */
export const TYPE_LABEL = {
  reading: 'Reading',
  video: 'Video',
  submission: 'File submission',
  quiz: 'Quiz',
  flashcards: 'Flashcards',
  matching: 'Matching',
  scenario: 'Scenario',
};
