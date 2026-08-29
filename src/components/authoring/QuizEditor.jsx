import QueryError from '../shared/QueryError';
import Alert from '../ui/Alert';
import EmptyState from '../ui/EmptyState';
import { SkeletonList } from '../ui/Skeleton';
import { useToast } from '../ui/toast-context';
import { useQuizForAuthoring, useSaveQuiz } from '../../hooks/useAuthoring';
import QuestionList from './QuestionList';
import QuizSettings from './QuizSettings';

/**
 * Writing the questions in a quiz.
 *
 * The builder could add a quiz *slot* to a module and nothing else. Questions
 * came from `npm run db:seed-quizzes`, so a trainer could build an entire
 * course and not write one — and a quiz activity with no quiz behind it is a
 * wall, because submit-quiz scores an empty quiz as zero and every pass mark
 * is above zero, leaving the rest of the course locked behind it.
 *
 * Everything here goes through the author-quiz Edge Function. quiz_answer_keys
 * has no grant for any browser role, on purpose, so there is no version of
 * this screen that talks to the table directly.
 */


/* question_type, which is a different vocabulary from activity_type. */


/** The answer shape each type stores. Changing type has to change the key too. */

export default function QuizEditor({ activityId, activityTitle, courseId }) {
  const { notify } = useToast();
  const editor = useQuizForAuthoring(activityId);
  const saveQuiz = useSaveQuiz();

  if (editor.isLoading) return <SkeletonList rows={3} label="Loading the quiz" />;
  if (editor.error) return <QueryError error={editor.error} what="this quiz" />;

  const quiz = editor.data?.quiz ?? null;
  const questions = editor.data?.questions ?? [];

  if (!quiz) {
    return (
      <div className="stack">
        <EmptyState icon="quiz" title="No quiz here yet">
          This activity is a quiz with nothing behind it. A trainee opening it
          finds nothing to answer, and the course cannot be published until it
          has questions.
        </EmptyState>
        <div>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={saveQuiz.isPending}
            onClick={() => saveQuiz.mutate(
              {
                activityId, courseId,
                title: activityTitle || 'Quiz', passMark: 0.7, timeLimitSeconds: null,
              },
              { onSuccess: () => notify('Quiz created. Add its first question.') },
            )}
          >
            {saveQuiz.isPending ? 'Creating…' : 'Create the quiz'}
          </button>
        </div>
        <Alert error={saveQuiz.error} />
      </div>
    );
  }

  return (
    <div className="stack-md">
      <QuizSettings quiz={quiz} activityId={activityId} courseId={courseId} />
      <QuestionList
        quiz={quiz}
        questions={questions}
        activityId={activityId}
        courseId={courseId}
      />
    </div>
  );
}

